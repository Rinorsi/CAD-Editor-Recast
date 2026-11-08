# Standalone javac gates must use the same baseline sources as Gradle.
$EditorBaselineRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$StonecutterText = Get-Content -LiteralPath (Join-Path $EditorBaselineRoot 'stonecutter.gradle') -Raw
if ($StonecutterText -notmatch "stonecutter[.]active\s+'(26[.][123])'") { throw 'Cannot determine Stonecutter active version' }
$BaselineCommon = if ($Matches[1] -eq '26.1') { 'common/src' } else { 'common/versions/26.1/build/generated/stonecutter' }
$BaselineFabric = if ($Matches[1] -eq '26.1') { 'fabric/src' } else { 'fabric/versions/26.1/build/generated/stonecutter' }
