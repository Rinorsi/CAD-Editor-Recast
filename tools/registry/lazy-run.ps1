param([string]$ClasspathFile, [string]$BaseJar, [string]$World, [switch]$UseReleaseJar)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace = [IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Out = Join-Path $Root ('daily/' + (Get-Date -Format 'yyyy-MM-dd') + '/lazy-catalog')
$Run = Join-Path $Out $(if ($UseReleaseJar) { 'run-release' } else { 'run' })
$Classes = Join-Path $Out 'compiled'
$Probe = Join-Path $Out 'probe'
New-Item -ItemType Directory -Force $Run,$Classes,$Probe,(Join-Path $Run 'mods'),(Join-Path $Run 'saves') | Out-Null
if (!$ClasspathFile) { $ClasspathFile = (Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName }
if (!$BaseJar) { $BaseJar = (Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/build/fabric-26.1.2/libs/cadeditor-fabric-26.1.2-0.99.2.jar') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName }
if (!$World) { $World = (Get-ChildItem ($Workspace+'/daily/*/run/editor-autotest-client/saves/Editor-release-test/level.dat') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).Directory.FullName }
if (!$ClasspathFile -or !$BaseJar -or !$World) { throw '缺少已构建的基础 jar、runtime-classpath.json 或独立测试世界；请先按 TESTING.md 准备。' }
$JavaBin = Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Cache = Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
$Mc = Join-Path $Cache 'minecraftMaven/net/minecraft/minecraft-merged-deobf/26.1.2/minecraft-merged-deobf-26.1.2.jar'
$Runtime = @(Get-Content $ClasspathFile | ConvertFrom-Json)
$Cp = (@($BaseJar,$Mc) + $Runtime) -join ';'
$Sources = @(Get-ChildItem ($Root+'/fabric/src/main/java/dev/rinorsi/editor/registry') -Recurse -Filter '*.java' | ForEach-Object FullName)
$Sources += $Root+'/fabric/src/main/java/dev/rinorsi/editor/ComponentValidation.java'
# Existing interactive Gradle runClient processes remain untouched; compile the registry package directly.
if (!$UseReleaseJar) {
    & ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d $Classes $Sources *> ($Out+'/compile.log')
    if ($LASTEXITCODE) { throw ('注册表 javac 失败；查看 '+$Out+'/compile.log') }
}
$EditorJar = Join-Path $Run 'mods/editor-supplement-under-test.jar'
Copy-Item -LiteralPath $BaseJar -Destination $EditorJar -Force
if (!$UseReleaseJar) {
    & ($JavaBin+'/jar.exe') uf $EditorJar -C $Classes .
    if ($LASTEXITCODE) { throw '测试副本打包失败' }
} elseif ((Get-FileHash -LiteralPath $EditorJar).Hash -ne (Get-FileHash -LiteralPath $BaseJar).Hash) { throw '发行jar复制后哈希不一致' }
$TestSources = @(($Root+'/fabric/src/autotest/java/dev/rinorsi/editor/registry/LazyCatalogProbe.java'), ($Root+'/fabric/src/autotest/java/dev/rinorsi/editor/registry/supplementmixin/RegistrySupplementWindowMixin.java'), ($Root+'/fabric/src/autotest/java/dev/rinorsi/editor/probe/mixin/NoMouseCaptureMixin.java'))
$ProbeCp = if ($UseReleaseJar) { $Cp } else { $Classes+';'+$Cp }
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $ProbeCp -d $Probe $TestSources *> ($Out+'/probe-compile.log')
if ($LASTEXITCODE) { throw ('探针 javac 失败；查看 '+$Out+'/probe-compile.log') }
$Utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText(($Probe+'/fabric.mod.json'), '{"schemaVersion":1,"id":"editor_supplement_probe","version":"1.0.0","environment":"client","entrypoints":{"client":["dev.rinorsi.editor.registry.LazyCatalogProbe"]},"mixins":["supplement-window.mixins.json","editor-probe.mixins.json"],"depends":{"fabricloader":">=0.19.5","fabric-api":"*","minecraft":"26.1.2","cadeditor":"*"}}', $Utf8)
[IO.File]::WriteAllText(($Probe+'/supplement-window.mixins.json'), '{"required":true,"package":"dev.rinorsi.editor.registry.supplementmixin","compatibilityLevel":"JAVA_25","client":["RegistrySupplementWindowMixin"],"injectors":{"defaultRequire":1}}', $Utf8)
Copy-Item -LiteralPath ($Root+'/tools/autotest/resources/editor-probe.mixins.json') -Destination $Probe -Force
$ModelDir = $Probe+'/assets/editor_supplement_probe/items/nested'
New-Item -ItemType Directory -Force $ModelDir | Out-Null
[IO.File]::WriteAllText(($ModelDir+'/only_definition.json'), '{"model":{"type":"minecraft:empty"}}', $Utf8)
& ($JavaBin+'/jar.exe') cf ($Run+'/mods/editor-supplement-probe.jar') -C $Probe .
if ($LASTEXITCODE) { throw '探针打包失败' }
$FabricApi = $Runtime | Where-Object { $_ -match 'net.fabricmc.fabric-api.fabric-api' } | Select-Object -First 1
Copy-Item -LiteralPath $FabricApi,($Root+'/libs/oriel-fabric-26.1.2-0.11.0.jar') -Destination ($Run+'/mods') -Force
if (!(Test-Path ($Run+'/saves/Editor-release-test/level.dat'))) { Copy-Item -LiteralPath $World -Destination ($Run+'/saves/Editor-release-test') -Recurse }
[IO.File]::WriteAllLines(($Run+'/options.txt'), @('pauseOnLostFocus:false','fullscreen:false','overrideWidth:640','overrideHeight:480','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0'), $Utf8)
$LaunchCp = @($Runtime | Where-Object { $_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api' -and $_ -notmatch '\\Editor\\libs\\' })
$Jvm = @('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+$Cache+'/26.1.2/minecraft-merged.jar'),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=registry-supplement','-cp',($LaunchCp -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',($Cache+'/assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
$ArgsFile = $Out+'/java.args'
[IO.File]::WriteAllLines($ArgsFile, @($Jvm | ForEach-Object { '"'+$_.Replace('\','\\').Replace('"','\"')+'"' }), $Utf8)
$Info = [Diagnostics.ProcessStartInfo]::new()
$Info.FileName=$JavaBin+'/java.exe'; $Info.Arguments='"@'+$ArgsFile+'"'; $Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false; $Info.CreateNoWindow=$true; $Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
$Started=[DateTime]::UtcNow; $Process=[Diagnostics.Process]::Start($Info)
$Stdout=$Process.StandardOutput.ReadToEndAsync(); $Stderr=$Process.StandardError.ReadToEndAsync()
try {
    while (!$Process.WaitForExit(1000)) { if ([DateTime]::UtcNow -gt $Started.AddMinutes(5)) { throw '独立客户端自测超时' } }
    $Code=$Process.ExitCode
} finally {
    if (!$Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    [IO.File]::WriteAllText(($Out+'/client.log'), $Stdout.Result+[Environment]::NewLine+$Stderr.Result)
    $Process.Dispose()
}
$Receipt = $Run+'/lazy-verification.json'
if ($Code -ne 0 -or !(Test-Path $Receipt) -or (Get-Item $Receipt).LastWriteTimeUtc -lt $Started -or (Get-Content $Receipt | ConvertFrom-Json).status -ne 'PASSED') { throw ('注册表补全自测失败；查看 '+$Out+'/client.log 与 '+$Receipt) }
Write-Output ('PASS lazy catalog live; receipt='+$Receipt)

