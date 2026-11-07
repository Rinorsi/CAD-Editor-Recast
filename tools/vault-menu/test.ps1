$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
# Full-source javac; never launches a client.
& (Join-Path $Root 'tools/world-edit/verify-player.ps1') -Tests @('dev.rinorsi.editor.vault.VaultTest','dev.rinorsi.editor.registry.EditDispatchTest')
