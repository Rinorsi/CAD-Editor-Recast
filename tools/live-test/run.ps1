param([ValidateSet('new','old')][string]$InputEngine='new', [string]$EvidenceRoot, [ValidateSet('smoke','pages')][string]$Driver='smoke')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $Root
$Out=if($EvidenceRoot){[IO.Path]::GetFullPath($EvidenceRoot)}else{Join-Path $Root 'logs/live-test'}
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
$OwnerFile=Join-Path $Lock ('live-test-'+$Owner+'.owner')
function Release-OwnedLock {
    if($script:Held -and (Test-Path -LiteralPath $OwnerFile) -and (Get-Content -LiteralPath $OwnerFile -Raw) -eq $Owner){
        Remove-Item -LiteralPath $OwnerFile
        [IO.Directory]::Delete($Lock,$false)
        $script:Held=$false
    }
}
try {
    $Deadline=(Get-Date).AddMinutes(20)
    while(!$Held){try{New-Item -ItemType Directory $Lock -ErrorAction Stop | Out-Null;$Held=$true}catch{if((Get-Date)-gt $Deadline){throw};Start-Sleep 5}}
    [IO.File]::WriteAllText($OwnerFile,$Owner)
    Assert-NoGame
    if(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue){throw 'MCTest port became occupied; refusing to launch'}
    $Info=[Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$env:ComSpec
    $Info.Arguments='/d /s /c ""'+(Join-Path $Root 'gradlew.bat')+'" --console=plain --max-workers=2 -PliveTestOwner='+$Owner+' "-PliveTestEvidence='+$Out+'" -PliveTestInput='+$InputEngine+' -I tools/live-test/launch.init.gradle :fabric:26.1.2:runClient"'
    $Info.WorkingDirectory=$Root;$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden'
    $Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Process=[Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync();$Stderr=$Process.StandardError.ReadToEndAsync()
    [IO.File]::WriteAllText(($Out+'/owned-gradle-launcher-pid.txt'),[string]$Process.Id)
    $NodeInfo=[Diagnostics.ProcessStartInfo]::new()
    $NodeInfo.FileName=(Get-Command node).Source;$NodeInfo.Arguments='tools/live-test/'+$Driver+'.mjs';$NodeInfo.WorkingDirectory=$Root
    $NodeInfo.UseShellExecute=$false;$NodeInfo.CreateNoWindow=$true
    $NodeInfo.Environment['EDITOR_LIVE_TEST_EVIDENCE']=$Out
    $Node=[Diagnostics.Process]::Start($NodeInfo)
    $Deadline=(Get-Date).AddMinutes(15)
    while(!$Process.WaitForExit(1000)){
        if($Held -and (Test-Path ($Out+'/mctest-ready.json'))){Release-OwnedLock;Write-Output 'Released build lock after client readiness'}
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
    Release-OwnedLock
    $Remaining=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('java.exe','javaw.exe') -and $_.CommandLine -like ('*-Deditor.liveTest.owner='+$Owner+'*') })
    $Listeners=@(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue)
    @{ownedRemaining=@($Remaining | ForEach-Object { $_.ProcessId });port25599=@($Listeners | ForEach-Object { $_.OwningProcess });ownedLockReleased=!(Test-Path -LiteralPath $OwnerFile)} | ConvertTo-Json | Set-Content ($Out+'/cleanup.json')
    if($Remaining.Count){throw 'Owned client still running after cleanup'}
}
