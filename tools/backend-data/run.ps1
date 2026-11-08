param([Parameter(Mandatory=$true)][string]$ClasspathJson, [Parameter(Mandatory=$true)][string]$TestWorld)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../baseline-sources.ps1')
$Editor=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Work=Join-Path $Editor '.backend-b'
$Log=Join-Path $Editor 'logs/backend-b'
$Run=Join-Path $Work 'run'
$Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
$Javac=Join-Path $env:JAVA_HOME 'bin/javac.exe'
$Jar=Join-Path $env:JAVA_HOME 'bin/jar.exe'
$Runtime=@(Get-Content -LiteralPath $ClasspathJson | ConvertFrom-Json)
$Mc=Get-ChildItem (Join-Path $Editor '.gradle/loom-cache/minecraftMaven/net/minecraft') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\\/]26[.]1[.]2[\\/]' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$Cp=@($Runtime | Where-Object {$_ -notmatch 'minecraft-merged'})+@($Mc.FullName)
foreach($Dir in @('main','probe','test','jar-main','jar-probe','run/mods','run/saves')){New-Item -ItemType Directory -Force (Join-Path $Work $Dir) | Out-Null}
New-Item -ItemType Directory -Force $Log | Out-Null
$Sources=@(Get-ChildItem (Join-Path $Editor "${BaselineCommon}/main/java"),(Join-Path $Editor "${BaselineFabric}/main/java") -Recurse -Filter '*.java' | ForEach-Object FullName)
& $Javac -proc:none -encoding UTF-8 -cp ($Cp -join ';') -d (Join-Path $Work 'main') @Sources *> (Join-Path $Log 'compile-all.log')
if($LASTEXITCODE -ne 0){throw 'Java 编译失败：logs/backend-b/compile-all.log'}
$Probe=@('BackendDataProbe.java','mixin/NoMouseCaptureMixin.java','mixin/BackendProbeWindowMixin.java') | ForEach-Object {Join-Path $Editor ("${BaselineFabric}/autotest/java/dev/rinorsi/editor/probe/"+$_)}
$Probe+=@(Get-ChildItem (Join-Path $Editor "${BaselineCommon}/testFixtures/java") -Recurse -Filter '*.java' | ForEach-Object FullName)
& $Javac -proc:none -encoding UTF-8 -cp ((Join-Path $Work 'main')+';'+($Cp -join ';')) -d (Join-Path $Work 'probe') @Probe *> (Join-Path $Log 'compile-probe.log')
if($LASTEXITCODE -ne 0){throw '探针编译失败：logs/backend-b/compile-probe.log'}
& $Javac -proc:none -encoding UTF-8 -cp ((Join-Path $Work 'main')+';'+(Join-Path $Work 'probe')+';'+($Cp -join ';')) -d (Join-Path $Work 'test') (Join-Path $Editor "${BaselineCommon}/test/java/dev/rinorsi/editor/BackendDataTest.java") (Join-Path $Editor "${BaselineCommon}/test/java/dev/rinorsi/editor/ComplexStackRoundTripTest.java") *> (Join-Path $Log 'compile-test.log')
if($LASTEXITCODE -ne 0){throw '测试编译失败：logs/backend-b/compile-test.log'}
& $Java -cp ((Join-Path $Work 'test')+';'+(Join-Path $Work 'main')+';'+($Cp -join ';')) dev.rinorsi.editor.BackendDataTest $Log *> (Join-Path $Log 'codec.log')
if($LASTEXITCODE -ne 0){throw 'Codec 测试失败：logs/backend-b/codec.log'}
& $Java -cp ((Join-Path $Work 'test')+';'+(Join-Path $Work 'probe')+';'+(Join-Path $Work 'main')+';'+($Cp -join ';')) dev.rinorsi.editor.ComplexStackRoundTripTest *> (Join-Path $Log 'complex-after.log')
if($LASTEXITCODE -ne 0){throw '复杂物品回归失败：logs/backend-b/complex-after.log'}
Copy-Item -Path (Join-Path $Work 'main/*') -Destination (Join-Path $Work 'jar-main') -Recurse -Force
Copy-Item -Path (Join-Path $Editor 'common/src/main/resources/*') -Destination (Join-Path $Work 'jar-main') -Recurse -Force
$Meta=Join-Path $Work 'jar-main/fabric.mod.json'
[IO.File]::WriteAllText($Meta,[IO.File]::ReadAllText($Meta).Replace('${version}','0.1.0'),[Text.UTF8Encoding]::new($false))
Copy-Item -Path (Join-Path $Work 'probe/*') -Destination (Join-Path $Work 'jar-probe') -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot 'resources/*') -Destination (Join-Path $Work 'jar-probe') -Recurse -Force
& $Jar --create --file (Join-Path $Run 'mods/editor-data-test.jar') -C (Join-Path $Work 'jar-main') .
if($LASTEXITCODE -ne 0){throw '主模组测试包生成失败'}
& $Jar --create --file (Join-Path $Run 'mods/editor-data-probe.jar') -C (Join-Path $Work 'jar-probe') .
if($LASTEXITCODE -ne 0){throw '探针测试包生成失败'}
$Api=$Runtime | Where-Object {$_ -match 'net.fabricmc.fabric-api.fabric-api'} | Select-Object -First 1
Copy-Item -LiteralPath $Api,(Join-Path $Editor 'libs/oriel-fabric-26.1.2-0.11.0.jar') -Destination (Join-Path $Run 'mods') -Force
if(!(Test-Path (Join-Path $Run 'saves/Editor-release-test/level.dat'))){Copy-Item -LiteralPath $TestWorld -Destination (Join-Path $Run 'saves/Editor-release-test') -Recurse}
[IO.File]::WriteAllLines((Join-Path $Run 'options.txt'),@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:640','overrideHeight:480','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0.0'),[Text.UTF8Encoding]::new($false))
$Cache=Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
$RuntimeCp=@($Runtime | Where-Object {$_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api|minecraft-merged' -and $_ -notmatch 'Editor.libs'})+@(Join-Path $Cache '26.1.2/minecraft-merged.jar')
$Jvm=@('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+(Join-Path $Cache '26.1.2/minecraft-merged.jar')),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=backend-data','-Deditor.backendDataProbe=true','-cp',($RuntimeCp -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',(Join-Path $Cache 'assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
$ArgsFile=Join-Path $Work 'client.args'
$Escaped=$Jvm | ForEach-Object {'"'+$_.Replace([string][char]92,([string][char]92+[char]92)).Replace('"',([string][char]92+'"'))+'"'}
[IO.File]::WriteAllLines($ArgsFile,$Escaped,[Text.UTF8Encoding]::new($false))
$Info=[Diagnostics.ProcessStartInfo]::new();$Info.FileName=$Java;$Info.Arguments='"@'+$ArgsFile+'"';$Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
$Started=[DateTime]::UtcNow;$Process=[Diagnostics.Process]::Start($Info)
$Out=$Process.StandardOutput.ReadToEndAsync();$Err=$Process.StandardError.ReadToEndAsync()
try{
    while(!$Process.HasExited){if([DateTime]::UtcNow -gt $Started.AddMinutes(7)){throw '离屏测试超时'};Start-Sleep -Milliseconds 100}
    $ExitCode=$Process.ExitCode
}finally{
    if(!$Process.HasExited){$Process.Kill();$Process.WaitForExit()}
    [IO.File]::WriteAllText((Join-Path $Log 'client.log'),$Out.Result+[Environment]::NewLine+$Err.Result)
    $Process.Dispose()
}
$Receipt=Join-Path $Run 'backend-data-e2e.json'
if($ExitCode -ne 0 -or !(Test-Path $Receipt) -or (Get-Item $Receipt).LastWriteTimeUtc -lt $Started -or (Get-Content $Receipt | ConvertFrom-Json).status -ne 'PASSED'){throw '离屏测试未通过：logs/backend-b/client.log 与 .backend-b/run/backend-data-e2e.json'}
Copy-Item -LiteralPath $Receipt -Destination $Log -Force
Write-Output ('PASS backend data live e2e; receipt='+$Receipt)
