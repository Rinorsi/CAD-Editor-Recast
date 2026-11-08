param([switch]$CompileOnly,[switch]$BaselineOnly,[switch]$Regression)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Logs=Join-Path $Root ('../Oriel-UI-Workspace/daily/'+(Get-Date -Format yyyy-MM-dd)+'/logs/vault-templates')
New-Item -ItemType Directory -Force $Logs | Out-Null
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(40)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
  Push-Location $Root
  $Tasks=@()
  foreach($Loader in $(if($BaselineOnly){@('fabric')}else{@('fabric','neoforge')})) {foreach($Version in $(if($BaselineOnly){@('26.1')}else{@('26.1','26.2','26.3')})) {$Tasks+=(':'+$Loader+':'+$Version+':compileJava');if(!$CompileOnly){$Tasks+=(':'+$Loader+':'+$Version+':vaultTemplateTest')}}}
  if(!$CompileOnly){$Tasks+=':fabric:26.1:exportVaultProbeClasspath'}
  if($Regression){foreach($Task in @('vaultTest','vaultEntityRegression','vaultPersistenceRegression','vaultGlobalRegression')){$Tasks+=(':fabric:26.1:'+$Task)}}
  & ./gradlew.bat --console=plain --max-workers=2 -I tools/vault-persist/templates.init.gradle @Tasks *> (Join-Path $Logs 'matrix.log')
  if($LASTEXITCODE -ne 0){throw ('Gradle失败；'+(Join-Path $Logs 'matrix.log'))}
  Write-Output ('PASS vault template matrix; '+(Join-Path $Logs 'matrix.log'))
} finally {Pop-Location;Remove-Item -LiteralPath $Lock}
