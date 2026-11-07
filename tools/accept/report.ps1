param([string]$Receipt, [string]$Pending, [string]$AdditionalReceipt, [string]$OutputDirectory)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$OutputArgs=if($OutputDirectory){@('--output',$OutputDirectory)}else{@()}
if($Pending){ & python ($PSScriptRoot+'/report.py') --root $Root --pending $Pending @OutputArgs }
elseif($AdditionalReceipt){ & python ($PSScriptRoot+'/report.py') --root $Root --receipt $Receipt --additional-receipt $AdditionalReceipt @OutputArgs }
else { & python ($PSScriptRoot+'/report.py') --root $Root --receipt $Receipt @OutputArgs }
if($LASTEXITCODE){throw '验收报告生成失败'}
