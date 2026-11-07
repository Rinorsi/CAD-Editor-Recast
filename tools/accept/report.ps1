param([string]$Receipt, [string]$Pending, [string]$AdditionalReceipt)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if($Pending){ & python ($PSScriptRoot+'/report.py') --root $Root --pending $Pending }
elseif($AdditionalReceipt){ & python ($PSScriptRoot+'/report.py') --root $Root --receipt $Receipt --additional-receipt $AdditionalReceipt }
else { & python ($PSScriptRoot+'/report.py') --root $Root --receipt $Receipt }
if($LASTEXITCODE){throw '验收报告生成失败'}
