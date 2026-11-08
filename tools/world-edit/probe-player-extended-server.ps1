$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(30)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
    & ./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:compileJava :fabric:26.1:compileCodecVerificationJava *> logs/player-extended/probe-build.log
    if($LASTEXITCODE -ne 0){throw '探针源码生成失败：logs/player-extended/probe-build.log'}
    & (Join-Path $PSScriptRoot 'verify-player.ps1') -Tests @('dev.rinorsi.editor.registry.PlayerWorldEditTest')
    & (Join-Path $PSScriptRoot 'probe-player-server.ps1') -Extended
    Write-Output 'PASS player server probe; logs/player-extended/captured-server.json'
} finally {Remove-Item -LiteralPath $Lock}
