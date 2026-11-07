param([Parameter(Mandatory=$true)][string]$SourceWorld)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Source=(Resolve-Path -LiteralPath $SourceWorld).Path
if(!(Test-Path -LiteralPath (Join-Path $Source 'level.dat'))){throw '来源不是有效单人世界'}
$Run=[IO.Path]::GetFullPath((Join-Path $Root ('../Oriel-UI-Workspace/daily/'+(Get-Date -Format yyyy-MM-dd)+'/run/editor-mod-client')))
$World='Editor-final-gate-'+(Get-Date -Format yyyyMMdd-HHmmss)
$Destination=Join-Path $Run ('saves/'+$World)
if(Test-Path -LiteralPath $Destination){throw '验证世界目录已存在；不会覆盖'}
New-Item -ItemType Directory -Force (Join-Path $Run 'saves'),(Join-Path $Root 'logs/final-gate') | Out-Null
Copy-Item -LiteralPath $Source -Destination $Destination -Recurse
$Options=Join-Path $Run 'options.txt'
$Lines=if(Test-Path -LiteralPath $Options){@(Get-Content -LiteralPath $Options | Where-Object {$_ -notmatch '^(pauseOnLostFocus|fullscreen|soundCategory_master):'})}else{@()}
[IO.File]::WriteAllLines($Options,$Lines+@('pauseOnLostFocus:false','fullscreen:false','soundCategory_master:0.0'),[Text.UTF8Encoding]::new($false))
$Commit=(& git rev-parse HEAD).Trim()
$Preparation=@{world=$World;directory=$Destination;source=$Source;launchShellPid=$PID;commit=$Commit;started=(Get-Date).ToString('o')}
[IO.File]::WriteAllText((Join-Path $Root 'logs/final-gate/client-preparation.json'),($Preparation|ConvertTo-Json))
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(20)
while($true){
    try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}
    catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}
}
try {
    & ./gradlew.bat --console=plain --max-workers=2 -I tools/final-gate/launch.init.gradle ('-PfinalGateWorld='+$World) ('-PfinalGateCommit='+$Commit) :fabric:26.1.2:runClient *> logs/final-gate/runClient.log
    if($LASTEXITCODE -ne 0){throw ('runClient退出码 '+$LASTEXITCODE+'；见 logs/final-gate/runClient.log')}
} finally {
    # This is only the lock this launcher acquired; keep it while runClient owns Gradle.
    if([IO.Path]::GetFullPath($Lock) -ne (Join-Path $Root 'logs/.gradle.lock.d')){throw '锁路径无效'}
    Remove-Item -LiteralPath $Lock
}
