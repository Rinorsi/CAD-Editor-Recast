param([ValidateSet('new','old')][string]$InputEngine='new')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $Root
$Out=Join-Path $Root 'logs/live-test'
New-Item -ItemType Directory -Force $Out | Out-Null
function Assert-NoGame {
    $Games=@(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {
        $Command=$_.CommandLine
        if($Command -match 'agent[.]jar|GradleDaemon'){return $false}
        if($Command -match '"@([^"]+)"|@"([^"]+)"|@([^ ]+)'){
            $Path=if($Matches[1]){$Matches[1]}elseif($Matches[2]){$Matches[2]}else{$Matches[3]}
            if(Test-Path -LiteralPath $Path){$Command+=' '+(Get-Content -LiteralPath $Path -Raw)}
        }
        $Command -match 'KnotClient|runClient|net.minecraft.client.main.Main'
    })
    if($Games.Count){$Games | Select-Object ProcessId,CommandLine | ConvertTo-Json | Set-Content ($Out+'/blocked-processes.json');throw 'User Minecraft running; skipped without touching it'}
}
Assert-NoGame
if(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue){throw 'MCTest port occupied; refusing to attach'}
$Run=Join-Path $Out 'mctest-run'
if(Test-Path $Run){throw 'Fresh run directory required; archive the previous owned run first'}
New-Item -ItemType Directory $Run | Out-Null
[IO.File]::WriteAllLines(($Run+'/options.txt'),@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:1280','overrideHeight:800','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0'),[Text.UTF8Encoding]::new($false))
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Held=$false;$Process=$null;$Node=$null
$Owner=[Guid]::NewGuid().ToString('N')
try {
    $Deadline=(Get-Date).AddMinutes(20)
    while(!$Held){try{New-Item -ItemType Directory $Lock -ErrorAction Stop | Out-Null;$Held=$true}catch{if((Get-Date)-gt $Deadline){throw};Start-Sleep 5}}
    Assert-NoGame
    $Info=[Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$env:ComSpec
    $Info.Arguments='/d /s /c ""'+(Join-Path $Root 'gradlew.bat')+'" --console=plain --max-workers=2 -PliveTestOwner='+$Owner+' -PliveTestInput='+$InputEngine+' -I tools/live-test/launch.init.gradle :fabric:26.1.2:runClient"'
    $Info.WorkingDirectory=$Root;$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden'
    $Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Process=[Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync();$Stderr=$Process.StandardError.ReadToEndAsync()
    [IO.File]::WriteAllText(($Out+'/owned-gradle-launcher-pid.txt'),[string]$Process.Id)
    $NodeInfo=[Diagnostics.ProcessStartInfo]::new()
    $NodeInfo.FileName=(Get-Command node).Source;$NodeInfo.Arguments='tools/live-test/smoke.mjs';$NodeInfo.WorkingDirectory=$Root
    $NodeInfo.UseShellExecute=$false;$NodeInfo.CreateNoWindow=$true
    $Node=[Diagnostics.Process]::Start($NodeInfo)
    $Deadline=(Get-Date).AddMinutes(15)
    while(!$Process.WaitForExit(1000)){
        if($Held -and (Test-Path ($Out+'/mctest-ready.json'))){Remove-Item -LiteralPath $Lock;$Held=$false;Write-Output 'Released build lock after client readiness'}
        if((Get-Date)-gt $Deadline){throw 'Owned client timed out'}
        if($Node.HasExited -and $Node.ExitCode -ne 0){throw 'MCTest smoke failed; see mctest-error.txt'}
    }
    if(!$Node.WaitForExit(15000)){throw 'Smoke driver did not exit'}
    if($Process.ExitCode -ne 0 -or $Node.ExitCode -ne 0){throw 'Client/driver returned a failure'}
    Write-Output 'PASS client and driver exited'
} finally {
    # The unique launch token also identifies a client that fails before MCTest becomes ready.
    foreach($Client in Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object { $_.CommandLine -like ('*-Deditor.liveTest.owner='+$Owner+'*') }) {
        Stop-Process -Id $Client.ProcessId
        Write-Output ('Stopped owned client '+$Client.ProcessId)
    }
    if($Node -and !$Node.HasExited){$Node.Kill();$Node.WaitForExit()}
    if($Process){
        if(!$Process.WaitForExit(30000)){$Process.Kill();$Process.WaitForExit()}
        [IO.File]::WriteAllText(($Out+'/runClient.log'),$Stdout.Result+[Environment]::NewLine+$Stderr.Result)
        $Process.Dispose()
    }
    if($Held){Remove-Item -LiteralPath $Lock}
}
