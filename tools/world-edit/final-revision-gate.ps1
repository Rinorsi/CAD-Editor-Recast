$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(20)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
 & ./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:build *> logs/world-merge2/gradle-build.log
 if($LASTEXITCODE -ne 0){throw 'Gradle build失败：logs/world-merge2/gradle-build.log'}
 Write-Output 'PASS gradlew.bat :fabric:26.1:build; logs/world-merge2/gradle-build.log'
}finally{if([IO.Path]::GetFullPath($Lock) -ne (Join-Path $Root 'logs/.gradle.lock.d')){throw '锁路径无效'};Remove-Item -LiteralPath $Lock}
& git diff --check *> logs/world-merge2/diff-check.log
if($LASTEXITCODE -ne 0){throw 'git diff --check失败：logs/world-merge2/diff-check.log'}
Write-Output 'PASS git diff --check; logs/world-merge2/diff-check.log'

