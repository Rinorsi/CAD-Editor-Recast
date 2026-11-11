param(
 [Parameter(Mandatory)][string]$Evidence,
 [Parameter(Mandatory)][string]$EditorJar,
 [Parameter(Mandatory)][string]$ExpectedEditorSha256,
 [Parameter(Mandatory)][string]$RuntimeClasspath,
 [Parameter(Mandatory)][string]$ProbeJar,
 [Parameter(Mandatory)][string]$RegistryPack
)
$ErrorActionPreference='Stop'
# Explicit artifact only; retain the hidden owner/port/no-capture/cleanup guards.
& ($PSScriptRoot+'/run-live.ps1') -RegistryLive -RegistryPack $RegistryPack -Mode backend-single -Evidence $Evidence -EditorJar $EditorJar -ExpectedEditorSha256 $ExpectedEditorSha256 -RuntimeClasspath $RuntimeClasspath -ProbeJar $ProbeJar
