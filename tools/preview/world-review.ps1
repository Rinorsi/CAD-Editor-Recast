param([string[]]$Components = @('can_place_on','block_state','entity_data','custom_data','lock','container_loot'), [string]$Size='760x560', [switch]$Light)
$ErrorActionPreference='Stop'
$workspaceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$previewPost = Join-Path ([IO.Path]::GetTempPath()) ('editor-world-'+[guid]::NewGuid().ToString('N')+'.js')
$previous = @{FIXTURE=$env:FIXTURE;POSTJS=$env:POSTJS;FRAMES=$env:FRAMES;THEME=$env:THEME}
try {
  $env:FIXTURE=(Join-Path $PSScriptRoot 'world-stack.js').Replace('\','/')
  $env:POSTJS=$previewPost.Replace('\','/');$env:FRAMES='8';$env:THEME=if($Light){'light'}else{'dark'}
  foreach($component in $Components) {
    if($component -notmatch '^[a-z_]+$'){throw 'Invalid component ID'}
    $detail=if($component -eq 'page'){''}else{"openDetail({cid:'$component'});"}
    Set-Content -LiteralPath $previewPost -Encoding utf8 -Value "UI.uni['u-world']=1;UI.tab='u-world';drawTabbar();drawTabBody();$detail"
    bash (Join-Path $PSScriptRoot 'shot.sh') $Size "world-$component-$Size-$env:THEME" | Select-String 'Wrote|Exception|Error|SEVERE'
    if($LASTEXITCODE -ne 0){throw "Preview failed: $component"}
  }
} finally {
  foreach($key in $previous.Keys){[Environment]::SetEnvironmentVariable($key,$previous[$key],'Process')}
  Remove-Item -LiteralPath $previewPost -ErrorAction SilentlyContinue
}
