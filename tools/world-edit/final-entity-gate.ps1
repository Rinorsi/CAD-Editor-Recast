$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
foreach($Process in Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^java(w)?[.]exe$'}) {
 $Command=$Process.CommandLine
 if($Command -match '@"?([^"]+[/\]java[.]args)'){if(Test-Path -LiteralPath $Matches[1]){$Command+=Get-Content -LiteralPath $Matches[1] -Raw}}
 if($Command -match 'KnotClient|net[.]minecraft[.]client[.]main[.]Main|runClient' -and $Command -notmatch '-Deditor[.]autotest='){throw '检测到用户 Minecraft 客户端；Gradle与真实客户端门禁待运行，不操作已有进程'}
}
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(20)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
 & ./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:build *> logs/world-entity/gradle-build.log
 if($LASTEXITCODE -ne 0){throw 'Gradle build失败：logs/world-entity/gradle-build.log'}
 Write-Output 'PASS Gradle build; logs/world-entity/gradle-build.log'
}finally{if([IO.Path]::GetFullPath($Lock) -ne (Join-Path $Root 'logs/.gradle.lock.d')){throw '锁路径无效'};Remove-Item -LiteralPath $Lock}
