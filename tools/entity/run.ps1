$ErrorActionPreference = 'Stop'
$Editor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace = [IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace'))
$Day = Join-Path $Workspace ('daily/' + (Get-Date -Format 'yyyy-MM-dd'))
$Build = Join-Path $Day 'scratch/editor-mod/build/fabric-26.1.2'
$Run = Join-Path $Editor 'run/entity-data-probe'
$Mods = Join-Path $Run 'mods'
New-Item -ItemType Directory -Force $Mods,(Join-Path $Run 'saves'),(Join-Path $Editor 'logs') | Out-Null
if (!(Test-Path (Join-Path $Run 'saves/Editor-release-test/level.dat'))) {
    $SeedWorld = Join-Path $Workspace 'daily/2026-11-06/run/editor-autotest-client/saves/Editor-release-test'
    Copy-Item -LiteralPath $SeedWorld -Destination (Join-Path $Run 'saves') -Recurse
}
$Runtime = @((Get-Content (Join-Path $Day 'scratch/editor-mod/runtime-classpath.json') | ConvertFrom-Json) | ForEach-Object { $_.Replace([char]92,[char]47) })
$FabricApi = $Runtime | Where-Object { $_ -match 'net.fabricmc.fabric-api.fabric-api' } | Select-Object -First 1
Copy-Item -LiteralPath $FabricApi,(Join-Path $Editor 'libs/oriel-fabric-26.1.2-0.11.0.jar'),(Join-Path $Build 'libs/cadeditor-fabric-26.1.2-0.99.2.jar'),(Join-Path $Build 'entity-probe/editor-entity-probe.jar') -Destination $Mods -Force
$Classpath = @($Runtime | Where-Object { $_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api' })
$Cache = Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
[IO.File]::WriteAllLines((Join-Path $Run 'options.txt'),@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:640','overrideHeight:480','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0'),[Text.UTF8Encoding]::new($false))
$Jvm = @('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+(Join-Path $Cache '26.1.2/minecraft-merged.jar')),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=entity','-cp',($Classpath -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',(Join-Path $Cache 'assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
$ArgsFile = Join-Path $Run 'java.args'
[IO.File]::WriteAllLines($ArgsFile,($Jvm | ForEach-Object { '"' + $_.Replace('\','\\').Replace('"','\"') + '"' }),[Text.UTF8Encoding]::new($false))
$Info = [Diagnostics.ProcessStartInfo]::new()
$Info.FileName=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin/java.exe'
$Info.Arguments='"@'+$ArgsFile+'"'; $Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false; $Info.CreateNoWindow=$true; $Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
$Started=[DateTime]::UtcNow; $Process=[Diagnostics.Process]::Start($Info)
$Out=$Process.StandardOutput.ReadToEndAsync(); $Err=$Process.StandardError.ReadToEndAsync()
try {
    while (!$Process.HasExited) {
        if ([DateTime]::UtcNow -gt $Started.AddMinutes(4)) { throw '实体数据独立客户端自测超时' }
        Start-Sleep -Milliseconds 200
    }
    $ExitCode=$Process.ExitCode
} finally {
    if (!$Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    [IO.File]::WriteAllText((Join-Path $Editor 'logs/entity-client.log'),$Out.Result+[Environment]::NewLine+'STDERR:'+[Environment]::NewLine+$Err.Result)
    $Process.Dispose()
}
$Receipt=Join-Path $Run 'entity-data-verification.json'
if ($ExitCode -ne 0 -or !(Test-Path $Receipt) -or (Get-Item $Receipt).LastWriteTimeUtc -lt $Started -or (Get-Content $Receipt | ConvertFrom-Json).status -ne 'PASSED') { throw '实体数据自测失败；见 logs/entity-client.log 和 run/entity-data-probe/entity-data-verification.json' }
Write-Output ('PASS independent hidden entity client; receipt='+$Receipt)
