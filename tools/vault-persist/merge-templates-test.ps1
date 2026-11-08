$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'VaultLegacyMerge.cs')
$Temp=Join-Path ([IO.Path]::GetTempPath()) ('vault-merge-templates-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $Temp | Out-Null
function Entry($Kind,$Id,$Template){return @{id=$Id;kind=$Kind;name='Preset';tags=@();note='';created=1;updated=1;mcDataVersion=4790;modVersion='test';template=$Template}}
function Check($Value,$Reason){if(!$Value){throw $Reason}}
$Block=Entry 'block' '00000000-0000-0000-0000-000000000001' @{block='minecraft:chest';block_state=@{};snbt='{id:"minecraft:chest",Items:[],data:{n:9223372036854775807L,f:0.8f}}'}
$Player=Entry 'player_preset' '00000000-0000-0000-0000-000000000002' @{sections=@{effects=@();inventory=@{slots=@(@{slot=0;stack=@{id='minecraft:paper';count=1;comps=@{custom_data=@{n=[long]9007199254740993}};removed=@{};component_snbt=@{custom_data='{n:9007199254740993L}'}}})}}}
$Source=Join-Path $Temp 'source.json'
$Output=Join-Path $Temp 'out/vault.json'
[IO.File]::WriteAllText($Source,(@{version=3;entries=@($Block,$Player)}|ConvertTo-Json -Depth 96 -Compress))
$Merged=[VaultLegacyMerge]::Merge($Output,[string[]]@($Source))
$Parsed=$Merged|ConvertFrom-Json -AsHashtable
Check ($Parsed.version -eq 3 -and $Parsed.entries.Count -eq 2) 'New categories preserved'
Check (@($Parsed.entries.name|Select-Object -Unique).Count -eq 2) 'Name conflicts numbered'
Check ($Merged.Contains('9007199254740993') -and $Merged.Contains('9223372036854775807L')) 'Typed and JSON long precision preserved'
Check ([VaultLegacyMerge]::Merge($Output,[string[]]@($Source)) -ceq $Merged) 'Merge idempotent'
$Before=[IO.File]::ReadAllText($Output)
$Bad=Join-Path $Temp 'bad.json'
foreach($Value in @(@{version=99;entries=@()},@{version=3;entries=@((Entry 'unknown' $Block.id @{}))},@{version=3;entries=@((Entry 'player_preset' $Block.id @{sections=@{UUID='bad'}}))},@{version=3;entries=@((Entry 'block' $Block.id @{block='minecraft:chest';block_state=@{};snbt='invalid'}))})) {
  [IO.File]::WriteAllText($Bad,($Value|ConvertTo-Json -Depth 96 -Compress));$Rejected=$false
  try{[VaultLegacyMerge]::Merge($Output,[string[]]@($Bad))|Out-Null}catch{$Rejected=$true}
  Check $Rejected 'Invalid input must reject';Check ([IO.File]::ReadAllText($Output) -ceq $Before) 'Failed merge preserves destination'
}
Write-Output ('PASS new category merge, numbering, precision, idempotence, safe rejection; fixtures='+$Temp)
