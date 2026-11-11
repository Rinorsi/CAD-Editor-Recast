param([Parameter(Mandatory=$true)][string]$ClasspathFile)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$deps=(Get-Content -LiteralPath $ClasspathFile -Raw).Trim().Split(';') | Where-Object { $_ -notmatch 'minecraft-merged|minecraft-client|minecraft-server' -and (Test-Path -LiteralPath $_) }
$report=Join-Path $root 'reports/worker-aoypp1fct3un3xstylayfbkj'
foreach($version in @('26.1.2','26.2','26.3')) {
    $jar=Join-Path $env:USERPROFILE ".gradle/caches/fabric-loom/minecraftMaven/net/minecraft/minecraft-merged-deobf/$version/minecraft-merged-deobf-$version.jar"
    $output=Join-Path $report "native-$version"
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $cp=$jar+';'+($deps -join ';')
    & javap -c -p -classpath $jar net.minecraft.world.entity.player.Player net.minecraft.server.level.ServerPlayer net.minecraft.server.commands.ExperienceCommand > (Join-Path $report "native-xp-bytecode-$version.log")
    $log=Join-Path $report "native-$version.log"
    $ErrorActionPreference='Continue'
    & javac -cp $cp -d $output (Join-Path $root 'common/src/main/java/dev/rinorsi/editor/SpecialFloatingPointSnbt.java') (Join-Path $root 'tools/nbt-audit/SpecialFloatNativeProbe.java') *> $log
    $ErrorActionPreference='Stop'
    if($LASTEXITCODE -ne 0){throw "javac failed: $log"}
    $ErrorActionPreference='Continue'
    & java --enable-native-access=ALL-UNNAMED -cp ($output+';'+$cp) dev.rinorsi.editor.SpecialFloatNativeProbe *>> $log
    $ErrorActionPreference='Stop'
    if($LASTEXITCODE -ne 0){throw "native probe failed: $log"}
    "PASS $version native parser/Codec/XP: $log"
}
