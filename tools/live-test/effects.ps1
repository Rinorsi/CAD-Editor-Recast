param(
    [ValidateSet('quick','full')][string]$Tier='quick',
    [string]$Only,
    [switch]$DryRun,
    [string]$EvidenceRoot
)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $Root
$Stamp=(Get-Date).ToString('yyyy-MM-ddTHH-mm-ss-fff')+'-'+$PID
$Out=if($EvidenceRoot){[IO.Path]::GetFullPath($EvidenceRoot)}else{Join-Path $Root ('logs/live-test/effects/'+$Stamp)}
New-Item -ItemType Directory -Force $Out | Out-Null
$Driver=Join-Path $PSScriptRoot 'effects.mjs'
$DriverArgs=@($Driver,'--tier',$Tier,'--out',$Out)
if($Only){$DriverArgs+=@('--only',$Only)}
# This branch precedes all process/port/Gradle queries; it cannot launch or attach to Minecraft.
if($DryRun){& node @DriverArgs --dry-run;exit $LASTEXITCODE}
function User-Games {
    @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {
        $Command=$_.CommandLine
        if($Command -match 'agent[.]jar|GradleDaemon'){return $false}
        if($Command -match '"@([^"]+)"|@"([^"]+)"|@([^ ]+)'){
            $ArgPath=if($Matches[1]){$Matches[1]}elseif($Matches[2]){$Matches[2]}else{$Matches[3]}
            if(Test-Path -LiteralPath $ArgPath){$Command+=' '+(Get-Content -LiteralPath $ArgPath -Raw)}
        }
        $Command.Contains($Out) -and $Command -match 'KnotClient|runClient|net.minecraft.client.main.Main'
    })
}
function Skip-Run([string]$Reason) {
    @('# 功能生效测试','',('SKIP: '+$Reason),'','未启动或连接游戏。') | Set-Content -LiteralPath (Join-Path $Out 'report.md') -Encoding utf8
    Write-Output ('SKIP: '+$Reason)
}
if((User-Games).Count){Skip-Run 'This evidence directory already has a client';exit 2}
if(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue){Skip-Run 'MCTest port 25599 is occupied';exit 2}
# Validate the plan before paying for a client startup. Kept separate from live report.
$PreflightArgs=@($Driver,'--tier',$Tier,'--out',(Join-Path $Out 'preflight'),'--dry-run')
if($Only){$PreflightArgs+=@('--only',$Only)}
& node @PreflightArgs
if($LASTEXITCODE -ne 0){throw 'Effects plan validation failed'}
$Run=Join-Path $Out 'mctest-run'
New-Item -ItemType Directory $Run | Out-Null
[IO.File]::WriteAllLines(($Run+'/options.txt'),@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:1280','overrideHeight:800','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0'),[Text.UTF8Encoding]::new($false))
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Held=$false;$Process=$null;$Node=$null;$Stdout=$null;$Stderr=$null
$Owner=[Guid]::NewGuid().ToString('N')
$OwnerFile=Join-Path $Lock ('effects-'+$Owner+'.owner')
function Release-OwnedLock {
    if($script:Held -and (Test-Path -LiteralPath $OwnerFile) -and (Get-Content -LiteralPath $OwnerFile -Raw) -eq $Owner){
        Remove-Item -LiteralPath $OwnerFile
        [IO.Directory]::Delete($Lock,$false)
        $script:Held=$false
    }
}
$Failed=$false
try {
    $Deadline=(Get-Date).AddMinutes(20)
    while(!$Held){
        try{New-Item -ItemType Directory $Lock -ErrorAction Stop | Out-Null;$Held=$true}
        catch{if((Get-Date)-gt $Deadline){throw 'Timed out waiting for Gradle lock'};Write-Output 'Waiting for Gradle lock';Start-Sleep 5}
    }
    [IO.File]::WriteAllText($OwnerFile,$Owner)
    if((User-Games).Count){Skip-Run 'This evidence directory was claimed while waiting for Gradle lock';exit 2}
    if(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue){Skip-Run 'MCTest port became occupied';exit 2}
    $Info=[Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$env:ComSpec
    $Info.Arguments='/d /s /c ""'+(Join-Path $Root 'gradlew.bat')+'" --console=plain --max-workers=2 -PliveTestOwner='+$Owner+' "-PliveTestEvidence='+$Out+'" -I tools/live-test/launch.init.gradle :fabric:26.1:runClient"'
    $Info.WorkingDirectory=$Root;$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden'
    $Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Process=[Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync();$Stderr=$Process.StandardError.ReadToEndAsync()
    [IO.File]::WriteAllText(($Out+'/owned-launcher-pid.txt'),[string]$Process.Id)
    $NodeInfo=[Diagnostics.ProcessStartInfo]::new()
    $NodeInfo.FileName=(Get-Command node).Source;$NodeInfo.WorkingDirectory=$Root
    $NodeInfo.UseShellExecute=$false;$NodeInfo.CreateNoWindow=$true
    foreach($Argument in ($DriverArgs+@('--run',$Run))){$NodeInfo.ArgumentList.Add($Argument)}
    $Node=[Diagnostics.Process]::Start($NodeInfo)
    $Deadline=(Get-Date).AddMinutes($(if($Tier -eq 'quick'){10}else{25}))
    while(!$Process.WaitForExit(1000)){
        if($Held -and (Test-Path ($Out+'/mctest-ready.json'))){Release-OwnedLock;Write-Output 'Released build lock after client readiness'}
        if((Get-Date)-gt $Deadline){throw 'Owned effects client timed out'}
        if($Node.HasExited -and $Node.ExitCode -ne 0){throw 'Effects driver failed; see report.md'}
    }
    if(!$Node.WaitForExit(15000)){throw 'Client exited before effects driver completed'}
    if($Process.ExitCode -ne 0 -or $Node.ExitCode -ne 0){throw 'Client/driver returned a failure'}
} catch {
    $Failed=$true
    $_ | Out-String | Set-Content -LiteralPath ($Out+'/launcher-error.txt')
    if(!(Test-Path ($Out+'/report.md'))){@('# 功能生效测试','','FAIL: launcher failed; see launcher-error.txt') | Set-Content ($Out+'/report.md')}
    Write-Warning $_
} finally {
    # Always attempt mc_quit (wire method quit) before stopping an owned process.
    if($Process){
        & node $Driver --quit-only --run $Run --out $Out 2>&1 | Out-File ($Out+'/shutdown.log')
        if($Node -and !$Node.HasExited){if(!$Node.WaitForExit(12000)){$Node.Kill();$Node.WaitForExit()}}
        foreach($Client in Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object { $_.CommandLine -like ('*-Deditor.liveTest.owner='+$Owner+'*') }) {
            Stop-Process -Id $Client.ProcessId
        }
        if(!$Process.WaitForExit(15000)){$Process.Kill();$Process.WaitForExit()}
        [IO.File]::WriteAllText(($Out+'/runClient.log'),$Stdout.Result+[Environment]::NewLine+$Stderr.Result)
        $Process.Dispose()
    }
    Release-OwnedLock
    $Remaining=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('java.exe','javaw.exe') -and $_.CommandLine -like ('*-Deditor.liveTest.owner='+$Owner+'*') })
    $Listeners=@(Get-NetTCPConnection -LocalPort 25599 -State Listen -ErrorAction SilentlyContinue)
    @{ownedRemaining=@($Remaining | ForEach-Object { $_.ProcessId });port25599=@($Listeners | ForEach-Object { $_.OwningProcess });ownedLockReleased=!(Test-Path -LiteralPath $OwnerFile)} | ConvertTo-Json | Set-Content ($Out+'/cleanup.json')
    if($Remaining.Count){$Failed=$true}
}
Write-Output ('Report: '+$Out+'/report.md')
if($Failed){exit 1}
exit 0
