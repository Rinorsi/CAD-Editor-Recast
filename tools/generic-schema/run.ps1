param([string[]]$Tasks=@(':fabric:26.1:genericSchemaTest',':fabric:26.2:genericSchemaTest',':fabric:26.3:genericSchemaTest'),[string]$LogName='generic-schema.log')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Out=Join-Path $Root ('../Oriel-UI-Workspace/daily/'+(Get-Date -Format 'yyyy-MM-dd')+'/logs/p4-generic')
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(40)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
$PriorGwTries=$env:GW_TRIES
try {
    $env:GW_TRIES='1'
    & bash tools/gw.sh @Tasks --no-problems-report *> (Join-Path $Out $LogName)
    if($LASTEXITCODE -ne 0){throw ('Gradle 验证失败：'+(Join-Path $Out $LogName))}
    Write-Output ('PASS '+($Tasks -join ' ')+'; '+(Join-Path $Out $LogName))
} finally { $env:GW_TRIES=$PriorGwTries; Remove-Item -LiteralPath $Lock }
