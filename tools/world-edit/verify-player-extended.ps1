param([string[]]$Tasks=@(':fabric:26.3:compileJava'),[string]$LogName='compile-26.3.log')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Log=Join-Path $Root 'logs/player-extended'
New-Item -ItemType Directory -Force $Log | Out-Null
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(30)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
 & ./gradlew.bat --console=plain --max-workers=2 --no-problems-report @Tasks *> (Join-Path $Log $LogName)
 if($LASTEXITCODE -ne 0){throw ('Gradle失败：'+(Join-Path $Log $LogName))}
 Write-Output ('PASS '+($Tasks -join ' ')+'; '+(Join-Path $Log $LogName))
}finally{if([IO.Path]::GetFullPath($Lock) -ne (Join-Path $Root 'logs/.gradle.lock.d')){throw '锁路径无效'};Remove-Item -LiteralPath $Lock}
