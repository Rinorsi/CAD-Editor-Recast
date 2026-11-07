$ErrorActionPreference = "Stop"
$Editor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../.."))
$Day = [IO.Path]::GetFullPath((Join-Path $Editor "../Oriel-UI-Workspace/daily/2026-11-06"))
$Run = Join-Path $Day "run/editor-registry-probe"
$Build = Join-Path $Day "scratch/editor-mod/build/fabric-26.1.2"
$Mods = Join-Path $Run "mods"
New-Item -ItemType Directory -Force -Path $Mods,(Join-Path $Run "saves") | Out-Null
if (!(Test-Path (Join-Path $Run "saves/Editor-release-test/level.dat"))) {
    Copy-Item -LiteralPath (Join-Path $Day "run/editor-autotest-client/saves/Editor-release-test") -Destination (Join-Path $Run "saves") -Recurse
}
$Pack = Join-Path $Run "saves/Editor-release-test/datapacks/registry-probe"
$Files = @{
    "pack.mcmeta" = '{"pack":{"description":"Registry integration test only","min_format":[101,1],"max_format":[101,1]}}'
    "data/editor_registry_probe/enchantment/shock.json" = '{"description":{"text":"Registry probe shock"},"supported_items":"#editor_registry_probe:weapons","primary_items":["minecraft:diamond_sword"],"weight":5,"max_level":3,"min_cost":{"base":1,"per_level_above_first":10},"max_cost":{"base":15,"per_level_above_first":10},"anvil_cost":2,"slots":["mainhand"],"exclusive_set":"#editor_registry_probe:conflicts","effects":{}}'
    "data/editor_registry_probe/tags/item/weapons.json" = '{"values":["minecraft:diamond_sword","minecraft:iron_sword"]}'
    "data/editor_registry_probe/tags/enchantment/conflicts.json" = '{"values":["minecraft:sharpness"]}'
    "data/editor_registry_probe/tags/enchantment/custom.json" = '{"values":["editor_registry_probe:shock"]}'
    "data/minecraft/tags/enchantment/curse.json" = '{"replace":false,"values":["editor_registry_probe:shock"]}'
}
foreach ($Relative in $Files.Keys) {
    $Target = Join-Path $Pack $Relative
    New-Item -ItemType Directory -Force -Path (Split-Path $Target -Parent) | Out-Null
    [IO.File]::WriteAllText($Target, $Files[$Relative], [Text.UTF8Encoding]::new($false))
}
$Runtime = @((Get-Content (Join-Path $Day "scratch/editor-mod/runtime-classpath.json") | ConvertFrom-Json) | ForEach-Object { $_.Replace([char]92,[char]47) })
$FabricApi = $Runtime | Where-Object { $_ -match "net.fabricmc.fabric-api.fabric-api" } | Select-Object -First 1
Copy-Item -LiteralPath $FabricApi -Destination $Mods -Force
Copy-Item -LiteralPath (Join-Path $Editor "libs/oriel-fabric-26.1.2-0.11.0.jar"),(Join-Path $Build "libs/cadeditor-fabric-26.1.2-0.99.2.jar"),(Join-Path $Build "registry-probe/editor-registry-probe.jar") -Destination $Mods -Force
$Classpath = @($Runtime | Where-Object { $_ -notmatch "/Editor/libs/|net.fabricmc.fabric-api" })
$Cache = Join-Path $env:USERPROFILE ".gradle/caches/fabric-loom"
$Java = Join-Path $env:USERPROFILE ".jdks/jdk-25.0.5+8/bin/java.exe"
[IO.File]::WriteAllLines((Join-Path $Run "options.txt"), @('pauseOnLostFocus:false','fullscreen:false','overrideWidth:640','overrideHeight:480','guiScale:2','narrator:0','lang:zh_cn'), [Text.UTF8Encoding]::new($false))
$Jvm = @('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official', ('-Dfabric.gameJarPath='+(Join-Path $Cache "26.1.2/minecraft-merged.jar")),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=registry','-cp',($Classpath -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',(Join-Path $Cache "assets"),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
$ArgsFile = Join-Path $Day "scratch/editor-mod/registry-probe-java.args"
$Escaped = $Jvm | ForEach-Object { '"' + $_.Replace('\','\\').Replace('"','\"') + '"' }
[IO.File]::WriteAllLines($ArgsFile, $Escaped, [Text.UTF8Encoding]::new($false))
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;
public static class RegistryProbeWindow {
public delegate bool Callback(IntPtr h,IntPtr p);
[DllImport("user32.dll")]public static extern bool EnumWindows(Callback c,IntPtr p);
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
public static void HideWithoutActivation(int process){EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==process)SetWindowPos(h,IntPtr.Zero,-32000,-32000,0,0,0x0010|0x0004|0x0001);return true;},IntPtr.Zero);}}'
$Info = [Diagnostics.ProcessStartInfo]::new()
$Info.FileName=$Java; $Info.Arguments='"@'+$ArgsFile+'"'; $Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false; $Info.CreateNoWindow=$true; $Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
$Started=[DateTime]::UtcNow; $Process=[Diagnostics.Process]::Start($Info)
$Out=$Process.StandardOutput.ReadToEndAsync(); $Err=$Process.StandardError.ReadToEndAsync()
try {
    while (!$Process.HasExited) {
        if ([DateTime]::UtcNow -gt $Started.AddMinutes(5)) { throw "注册表独立客户端自测超时" }
        [RegistryProbeWindow]::HideWithoutActivation($Process.Id)
        Start-Sleep -Milliseconds 100
    }
    $ExitCode=$Process.ExitCode
} finally {
    if (!$Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    [IO.File]::WriteAllText((Join-Path $Day "logs/registry-client.log"),$Out.Result+"`nSTDERR:`n"+$Err.Result)
    $Process.Dispose()
}
$Receipt=Join-Path $Run "registry-verification.json"
if ($ExitCode -ne 0 -or !(Test-Path $Receipt) -or (Get-Item $Receipt).LastWriteTimeUtc -lt $Started -or (Get-Content $Receipt | ConvertFrom-Json).status -ne "PASSED") { throw "注册表自测未通过；查看 logs/registry-client.log 和 run/editor-registry-probe/registry-verification.json" }
Write-Output "PASS independent registry client; receipt=$Receipt"
