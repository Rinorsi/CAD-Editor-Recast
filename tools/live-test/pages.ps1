param([string]$EvidenceRoot)
$ErrorActionPreference='Stop'
if(!$EvidenceRoot){$EvidenceRoot=Join-Path $PSScriptRoot ('../../logs/live-test/pages/'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff'))}
# Reuse the invisible/unfocused/no-mouse-capture launcher and its ownership cleanup.
& (Join-Path $PSScriptRoot 'run.ps1') -EvidenceRoot $EvidenceRoot -Driver pages
