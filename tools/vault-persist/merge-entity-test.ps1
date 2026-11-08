$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'VaultLegacyMerge.cs')
$Temp=Join-Path ([IO.Path]::GetTempPath()) ('vault-merge-entity-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $Temp | Out-Null
$Checks=0
function Assert($Value,$Message){if(!$Value){throw $Message};$script:Checks++}
function Save-Json($Name,$Value){$Path=Join-Path $Temp $Name;[IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 96 -Compress));return $Path}
function Entry($Kind,$Updated){
  $e=@{id='00000000-0000-0000-0000-000000000001';kind=$Kind;name="name-$Updated";tags=@("tag-$Updated");note="note-$Updated";created=$Updated;updated=$Updated;mcDataVersion=4790;modVersion='test';hash='untrusted'}
  if($Kind -eq 'entity'){$e.snbt='{data:{f:1.25f,n:9223372036854775807L,a:[B;1B,-2B]},id:"minecraft:zombie"}'}
  else{$e.stack=@{id='minecraft:paper';count=1;comps=@{};removed=@{}}}
  return $e
}
try {
  $Old=Entry 'item' 1;$Old.Remove('kind')
  $Legacy=Save-Json 'legacy.json' @{version=1;entries=@($Old)}
  $First=Entry 'entity' 2
  $Second=Entry 'entity' 3
  $Different=Entry 'entity' 4;$Different.snbt=$Different.snbt.Replace('1.25f','1.25d')
  $Source=Save-Json 'new.json' @{version=2;entries=@($First,$Second,$Different)}
  $Output=Join-Path $Temp 'vault.json'
  [IO.File]::Copy($Legacy,$Output)
  $Original=[IO.File]::ReadAllText($Output)
  $Text=[VaultLegacyMerge]::Merge($Output,[string[]]@($Source))
  $Root=$Text | ConvertFrom-Json -AsHashtable
  Assert ($Root.version -eq 2) 'Output must use schema 2'
  Assert ($Root.entries.Count -eq 3) 'Expected one item and two typed-distinct entities'
  Assert (@($Root.entries | Where-Object kind -eq 'item').Count -eq 1) 'Legacy kind must default to item'
  Assert (@($Root.entries.id | Select-Object -Unique).Count -eq 3) 'Different payloads sharing UUID need new IDs'
  $Entity=@($Root.entries | Where-Object {$_.kind -eq 'entity' -and $_.updated -eq 3})[0]
  Assert ($Entity.snbt -ceq $First.snbt) 'Typed SNBT must remain byte-exact'
  Assert ($Entity.name -eq 'name-3' -and $Entity.created -eq 2) 'Duplicate must retain newest metadata and earliest creation'
  Assert (($Entity.tags -join ',') -eq 'tag-3,tag-2') 'Tags must be merged newest first'
  Assert ($Entity.note -ceq "note-3`nnote-2") 'Notes must be merged by unique lines'
  Assert (!$Entity.ContainsKey('hash')) 'Untrusted internal hash must be removed'
  Assert ([IO.File]::ReadAllText($Output+'.bak') -ceq $Original) 'Backup must contain original target'
  Assert ([IO.File]::ReadAllText($Legacy) -ceq $Original) 'Source must not change'
  $Again=[VaultLegacyMerge]::Merge($Output,[string[]]@($Source,$Legacy))
  Assert ($Again -ceq $Text) 'Mixed schema merge must be idempotent'
  $Backup=[IO.File]::ReadAllText($Output+'.bak')
  $BadCases=@(
    @{version=99;entries=@()},
    @{version=2;entries=@((Entry 'unknown' 5))},
    @{version=2;entries=@((Entry 'entity' 5))},
    @{version=2;entries=@((Entry 'entity' 5))},
    @{version=2;entries=@((Entry 'entity' 5))},
    @{version=2;entries=@((Entry 'entity' 5))}
  )
  $BadCases[2].entries[0].snbt=42
  $BadCases[3].entries[0].snbt='not a compound'
  $BadCases[4].entries[0].snbt='{id:"minecraft:zombie",data:"'+('x'*65536)+'"}'
  $BadCases[5].entries[0].tags=@('a','b','c','d','e','f','g','h')
  foreach($Case in $BadCases){
    $Bad=Save-Json 'bad.json' $Case
    $Rejected=$false
    try{[VaultLegacyMerge]::Merge($Output,[string[]]@($Bad)) | Out-Null}catch{$Rejected=$true}
    Assert $Rejected 'Invalid input or merged quota overflow must fail'
    Assert ([IO.File]::ReadAllText($Output) -ceq $Again) 'Failure must not write target'
    Assert ([IO.File]::ReadAllText($Output+'.bak') -ceq $Backup) 'Failure must not replace backup'
  }
  $Held=[IO.FileStream]::new($Output+'.lock',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite)
  try {
    $Held.Lock(0,[long]::MaxValue);$Rejected=$false
    try{[VaultLegacyMerge]::Merge($Output,[string[]]@($Source)) | Out-Null}catch{$Rejected=$true}
    Assert $Rejected 'Exclusive lock must reject another writer'
    Assert ([IO.File]::ReadAllText($Output) -ceq $Again) 'Lock failure must not write target'
  } finally {$Held.Unlock(0,[long]::MaxValue);$Held.Dispose()}
  Write-Output "PASS $Checks mixed-schema merge assertions; temporary fixtures only; no user vault accessed"
} finally {Remove-Item -LiteralPath $Temp -Recurse -Force}
