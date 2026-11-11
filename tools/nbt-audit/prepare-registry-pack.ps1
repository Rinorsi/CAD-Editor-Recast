param([Parameter(Mandatory)][string]$Evidence,[string]$MinecraftJar=(Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar'))
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence)
if(Test-Path -LiteralPath $Evidence){throw '数据包证据目录必须全新'}
New-Item -ItemType Directory -Force $Evidence | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip=[IO.Compression.ZipFile]::OpenRead($MinecraftJar)
function Read-Zip([string]$Name){
 $Entry=$Zip.GetEntry($Name);if(!$Entry){throw ('真实Minecraft资源缺失：'+$Name)}
 $Reader=[IO.StreamReader]::new($Entry.Open());try{return $Reader.ReadToEnd()}finally{$Reader.Dispose()}
}
function Write-Json([string]$Path,$Value){
 New-Item -ItemType Directory -Force (Split-Path $Path) | Out-Null
 [IO.File]::WriteAllText($Path,($Value | ConvertTo-Json -Depth 80),[Text.UTF8Encoding]::new($false))
}
try{
 $Version=Read-Zip 'version.json' | ConvertFrom-Json
 $Source=Read-Zip 'data/minecraft/enchantment/sharpness.json'
 $Sharpness=$Source | ConvertFrom-Json
 $OriginalMax=$Sharpness.max_level
 $Sharpness.max_level=9
 $Pack=Join-Path $Evidence 'nbt-registry-live'
 $Format=@([int]$Version.pack_version.data_major,[int]$Version.pack_version.data_minor)
 Write-Json ($Pack+'/pack.mcmeta') @{pack=@{description='Isolated registry live verification; derived vanilla definition';min_format=$Format;max_format=$Format}}
 Write-Json ($Pack+'/data/minecraft/enchantment/sharpness.json') $Sharpness
 # This namespace is a REAL datapack registry entry, not evidence of an installed mod.
 $Custom=$Source | ConvertFrom-Json;$Custom.max_level=9;$Custom.description='NBT audit custom namespace nine';$Custom.exclusive_set=@()
 # Vanilla's real vanishing tag has >64 members on 26.1.2, so the actual
 # RegistrySnapshot must serve supported_ref instead of the small inline list.
 $Custom.supported_items='#minecraft:enchantable/vanishing'
 Write-Json ($Pack+'/data/nbt_audit/enchantment/sharpness_nine.json') $Custom
 [IO.File]::WriteAllText(($Evidence+'/vanilla-sharpness-source.json'),$Source,[Text.UTF8Encoding]::new($false))
 Write-Json ($Evidence+'/fixture-provenance.json') @{minecraftVersion=$Version.id;minecraftJar=$MinecraftJar;minecraftSha256=(Get-FileHash -LiteralPath $MinecraftJar -Algorithm SHA256).Hash;sourceEntry='data/minecraft/enchantment/sharpness.json';sourceMax=$OriginalMax;fixtureMax=9;format=$Format;pack=$Pack;customId='nbt_audit:sharpness_nine';customScope='datapack custom namespace, not an installed third-party mod';files=@(Get-ChildItem -LiteralPath $Pack -File -Recurse | ForEach-Object {@{path=$_.FullName;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})}
 Write-Output ('PASS prepared actual Minecraft '+$Version.id+' datapack; live loader acceptance NOT_EXECUTED: '+$Pack)
}finally{$Zip.Dispose()}
