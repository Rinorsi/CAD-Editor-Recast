param(
  [Parameter(Mandatory=$true)][string]$ClasspathJson,
  [Parameter(Mandatory=$true)][string]$EvidenceDir,
  [string]$MinecraftJar
)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$evidence=[IO.Path]::GetFullPath($EvidenceDir)
New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$inputCp=Get-Content -LiteralPath $ClasspathJson -Raw | ConvertFrom-Json
$entries=if($inputCp.runtime){@($inputCp.runtime)}else{@($inputCp)}
if($MinecraftJar){$entries=@($entries | Where-Object {$_ -notmatch 'minecraft-merged-|oriel-.*[.]jar$'});$entries=@([IO.Path]::GetFullPath($MinecraftJar))+$entries}
$cp=$entries -join ';'
$jdk=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$classes=Join-Path $evidence 'classes';New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources=@('common/src/main/java/dev/rinorsi/editor/EditorDiagnostics.java','common/src/main/java/dev/rinorsi/editor/registry/BucketItemMetadata.java','common/src/test/java/dev/rinorsi/editor/registry/BucketItemMetadataTest.java') | ForEach-Object {Join-Path $root $_}
$sources | Get-FileHash -Algorithm SHA256 | ConvertTo-Json | Set-Content (Join-Path $evidence 'sourcehash.json')
if($MinecraftJar -match '26[.]1[.]2') {
  # Mirror the exact reversible constant-owner mapping in stonecutter.gradle.
  $sourceDir=Join-Path $evidence 'source';New-Item -ItemType Directory -Force -Path $sourceDir | Out-Null
  $sources=@($sources | ForEach-Object {
    $copy=Join-Path $sourceDir ([IO.Path]::GetFileName($_))
    $source=[regex]::Replace([IO.File]::ReadAllText($_),'(?s)//[?] if >=26[.]2 [{](.*?)//[?][}]','')
    [IO.File]::WriteAllText($copy,($source.Replace('net.minecraft.world.entity.EntityTypes.','net.minecraft.world.entity.EntityType.')))
    $copy
  })
}
$entries | ConvertTo-Json | Set-Content (Join-Path $evidence 'classpath.json')
& (Join-Path $jdk 'javac.exe') -encoding UTF-8 -cp $cp -d $classes @sources *> (Join-Path $evidence 'javac.log')
if($LASTEXITCODE -ne 0){throw 'Bucket metadata javac failed; see javac.log'}
Push-Location $evidence
try {
  & (Join-Path $jdk 'java.exe') -cp "$classes;$cp" dev.rinorsi.editor.registry.BucketItemMetadataTest *> (Join-Path $evidence 'test.log')
  if($LASTEXITCODE -ne 0){throw 'Bucket metadata registry test failed; see test.log'}
  $bucketable=if($MinecraftJar -match '26[.]1[.]2'){'net.minecraft.world.entity.animal.Bucketable'}else{'net.minecraft.world.entity.Bucketable'}
  & (Join-Path $jdk 'javap.exe') -p -c -classpath $cp $bucketable net.minecraft.world.entity.animal.axolotl.Axolotl net.minecraft.world.entity.animal.frog.Tadpole net.minecraft.world.entity.animal.fish.TropicalFish net.minecraft.world.entity.animal.fish.Salmon *> (Join-Path $evidence 'semantics.log')
  if($LASTEXITCODE -ne 0){throw 'Bucket semantic API inspection failed; see semantics.log'}
  $api=Get-Content (Join-Path $evidence 'semantics.log') -Raw
  if($api -match '找不到类|class not found'){throw 'javap reported missing class; see semantics.log'}
  $contracts=Get-Content (Join-Path $evidence 'test.log') | Where-Object {$_ -match 'BUCKET_CONTRACT_JSON '} | ForEach-Object {($_ -split 'BUCKET_CONTRACT_JSON ',2)[1] | ConvertFrom-Json}
  if(@($contracts).Count -eq 0){throw 'No real bucket contracts returned'}
  # Bytecode excerpts alone are not proof of per-species field consumption.
  # bucketConsumerTest executes each entity loader/getter/save with that metadata.
  Write-Output "PASS actual registry bucket metadata; no game/client/world created; native field consumption requires bucketConsumerTest; $evidence"
} finally {Pop-Location}
