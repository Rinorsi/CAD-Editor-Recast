param([Parameter(Mandatory)][string]$EvidenceRoot)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($EvidenceRoot).Replace([char]92,[char]47)
$runs=@('registry-final-D089-06','natural-final-D089-01','integrated-final-D089-01','registry-final-830-01','registry-final-830-02','integrated-final-830-01')
$processes=@(Get-CimInstance Win32_Process)
$records=@()
foreach($run in $runs){
 $clean=Get-Content -LiteralPath ($root+'/'+$run+'/cleanup.json') -Raw|ConvertFrom-Json
 $ports=Get-Content -LiteralPath ($root+'/'+$run+'/port-cleanup.json') -Raw|ConvertFrom-Json
 if(@($clean.remaining).Count -ne 0){throw ($run+' remaining not empty')}
 foreach($ownedId in $ports.ownedPids){
  $found=@($processes|Where-Object {$_.ProcessId -eq $ownedId})
  $owned=@($found|Where-Object {$_.CommandLine -and $_.CommandLine.Replace([char]92,[char]47).Contains($root+'/'+$run+'/')})
  if($owned.Count){throw ($run+' owned process still alive '+$ownedId)}
  $records+=@{run=$run;pid=$ownedId;pidExistsNow=[bool]$found.Count;ownedProcessExists=$false;currentCommandLine=@($found.CommandLine)}
 }
}
$ownedJava=@($processes|Where-Object {$_.Name -match '^java(w)?[.]exe$' -and $_.CommandLine -and $_.CommandLine.Replace([char]92,[char]47).Contains($root+'/')})
if($ownedJava.Count){throw 'owned nbt-worker Java process remains'}
$listeners=@(Get-NetTCPConnection -LocalPort 25782 -State Listen -ErrorAction SilentlyContinue)
if($listeners.Count){throw '25782 listener remains'}
@{status='PASS';checkedAt=(Get-Date -Format o);ownedPids=$records;remainingOwnedJava=@($ownedJava);listeners25782=@($listeners);otherWorker25784='not inspected or touched'}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($root+'/final-os-cleanup.json')
Write-Output 'PASS six owned run cleanup.remaining=[]; owned JVM commands absent; 25782 has no LISTEN; other instances untouched'
