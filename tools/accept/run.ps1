param([string]$ClasspathFile, [string]$BaseJar, [string]$World, [switch]$UseReleaseJar, [switch]$CompileOnly, [switch]$WorldOnly, [string[]]$OnlyComponents, [string]$EvidenceRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../baseline-sources.ps1')
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
function Get-GameProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {
        $command=$_.CommandLine
        if ($command -match 'agent[.]jar|GradleDaemon') { return $false }
        $game=$command -match 'KnotClient|runClient|net.minecraft.client.main.Main'
        if(!$game -and $command -match '"@([^"]+)"|@"([^"]+)"|@([^ ]+)'){
            $argPath=if($Matches[1]){$Matches[1]}elseif($Matches[2]){$Matches[2]}else{$Matches[3]}
            if(Test-Path -LiteralPath $argPath -PathType Leaf){$game=(Get-Content -LiteralPath $argPath -Raw) -match 'KnotClient|runClient|net.minecraft.client.main.Main'}
        }
        $game -and $Run -and $command.Contains($Run)
    })
}
$Games=Get-GameProcesses
if($Games.Count -and !$CompileOnly){
    $LogRoot=if($EvidenceRoot){Join-Path ([IO.Path]::GetFullPath($EvidenceRoot)) 'accept-blocked'}else{Join-Path $Root 'logs/accept'}
    New-Item -ItemType Directory -Force $LogRoot | Out-Null
    $Games | Select-Object ProcessId | ConvertTo-Json | Set-Content ($LogRoot+'/user-game-processes.json')
    if($EvidenceRoot){ & ($Root+'/tools/accept/report.ps1') -Pending 'real-client run pending: user game running' -OutputDirectory (Join-Path $LogRoot 'report') }
    else { & ($Root+'/tools/accept/report.ps1') -Pending 'real-client run pending: user game running' }
    Write-Output ('real-client run pending: user game running; PID='+($Games.ProcessId -join ',')+'; logs/accept/user-game-processes.json; 稍后运行 pwsh -NoProfile -File tools/accept/run.ps1')
    exit 2
}
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace = [IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Out = Join-Path $Root ('daily/' + (Get-Date -Format 'yyyy-MM-dd') + '/accept/'+(Get-Date -Format 'HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8))
if ($EvidenceRoot) { $Out = Join-Path ([IO.Path]::GetFullPath($EvidenceRoot)) ('accept/'+(Get-Date -Format 'HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)) }
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
$CompileMc = (Get-ChildItem ($Root+'/.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\\/]26[.]1[.]2[\\/]' } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Runtime = @(Get-Content $ClasspathFile | ConvertFrom-Json)
$Cp = (@($BaseJar,$CompileMc,$Mc) + $Runtime) -join ';'
$Sources = @(Get-ChildItem ($Root+"/${BaselineCommon}/main/java"),($Root+"/${BaselineFabric}/main/java") -Recurse -Filter '*.java' | ForEach-Object FullName)
function Invoke-AcceptJava([string]$Tool, [string[]]$Arguments, [string]$Log) {
    $ArgumentsFile = $Log + '.args'
    [IO.File]::WriteAllLines($ArgumentsFile, @($Arguments | ForEach-Object { '"'+$_.Replace('\','\\').Replace('"','\"')+'"' }), [Text.UTF8Encoding]::new($false))
    & ($JavaBin+'/'+$Tool+'.exe') ('@'+$ArgumentsFile) 2>&1 | Out-File $Log
    if ($LASTEXITCODE) { throw ($Tool+' failed; see '+$Log) }
}
# Use argument files: the full source list and classpath exceed the Windows command-line limit.
if (!$UseReleaseJar) {
    Invoke-AcceptJava javac (@('-proc:none','-encoding','UTF-8','-cp',$Cp,'-d',$Classes)+$Sources) ($Out+'/compile.log')
}
$EditorJar = Join-Path $Run 'mods/editor-supplement-under-test.jar'
Copy-Item -LiteralPath $BaseJar -Destination $EditorJar -Force
if (!$UseReleaseJar) {
    & ($JavaBin+'/jar.exe') uf $EditorJar -C $Classes . -C ($Root+'/common/src/main/resources') assets
    if ($LASTEXITCODE) { throw '测试副本打包失败' }
} elseif ((Get-FileHash -LiteralPath $EditorJar).Hash -ne (Get-FileHash -LiteralPath $BaseJar).Hash) { throw '发行jar复制后哈希不一致' }
$Manifest=[ordered]@{baseJar=$BaseJar;baseSha256=(Get-FileHash -LiteralPath $BaseJar).Hash;testedJar=$EditorJar;testedSha256=(Get-FileHash -LiteralPath $EditorJar).Hash;sourceOverlay=(!$UseReleaseJar);sourceFiles=@($Sources | ForEach-Object { [ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath $_).Hash} })}
$Manifest | ConvertTo-Json -Depth 5 | Set-Content ($Out+'/build-manifest.json')
$TestSources = @('registry/AcceptanceProbe.java', 'registry/AcceptanceWorldProbe.java', 'registry/AcceptanceCodecTest.java', 'accept/mixin/AcceptanceClientMixin.java', 'registry/supplementmixin/RegistrySupplementWindowMixin.java', 'probe/mixin/NoMouseCaptureMixin.java') | ForEach-Object { $Root+"/${BaselineFabric}/autotest/java/dev/rinorsi/editor/"+$_ }
$ProbeCp = if ($UseReleaseJar) { $Cp } else { $Classes+';'+$Cp }
Invoke-AcceptJava javac (@('-proc:none','-encoding','UTF-8','-cp',$ProbeCp,'-d',$Probe)+$TestSources) ($Out+'/probe-compile.log')
Invoke-AcceptJava java @('-Xmx1G','-cp',($Probe+';'+$ProbeCp),'dev.rinorsi.editor.registry.AcceptanceCodecTest') ($Out+'/codec-boundaries.log')
$Utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText(($Probe+'/fabric.mod.json'), '{"schemaVersion":1,"id":"editor_supplement_probe","version":"1.0.0","environment":"client","entrypoints":{"client":["dev.rinorsi.editor.registry.AcceptanceProbe"]},"mixins":["supplement-window.mixins.json","editor-probe.mixins.json","acceptance.mixins.json"],"depends":{"fabricloader":">=0.19.5","fabric-api":"*","minecraft":"26.1.2","cadeditor":"*"}}', $Utf8)
[IO.File]::WriteAllText(($Probe+'/supplement-window.mixins.json'), '{"required":true,"package":"dev.rinorsi.editor.registry.supplementmixin","compatibilityLevel":"JAVA_25","client":["RegistrySupplementWindowMixin"],"injectors":{"defaultRequire":1}}', $Utf8)
Copy-Item -LiteralPath ($Root+'/tools/autotest/resources/editor-probe.mixins.json') -Destination $Probe -Force
[IO.File]::WriteAllText(($Probe+'/acceptance.mixins.json'), '{"required":true,"package":"dev.rinorsi.editor.accept.mixin","compatibilityLevel":"JAVA_25","client":["AcceptanceClientMixin"],"injectors":{"defaultRequire":1}}', $Utf8)
$ModelDir = $Probe+'/assets/editor_supplement_probe/items/nested'
New-Item -ItemType Directory -Force $ModelDir | Out-Null
[IO.File]::WriteAllText(($ModelDir+'/only_definition.json'), '{"model":{"type":"minecraft:empty"}}', $Utf8)
& ($JavaBin+'/jar.exe') cf ($Run+'/mods/editor-supplement-probe.jar') -C $Probe .
if ($LASTEXITCODE) { throw '探针打包失败' }
if ($CompileOnly) { Write-Output ('PASS acceptance javac; '+$Out+'/probe-compile.log'); exit 0 }
$Games=Get-GameProcesses
if($Games.Count){Write-Output 'real-client run pending: user game running';exit 2}
$FabricApi = $Runtime | Where-Object { $_ -match 'net.fabricmc.fabric-api.fabric-api' } | Select-Object -First 1
Copy-Item -LiteralPath $FabricApi,($Root+'/libs/oriel-fabric-26.1.2-0.11.0.jar') -Destination ($Run+'/mods') -Force
# New isolated test world on every invocation.
$WorldName='Acceptance-'+[Guid]::NewGuid().ToString('N')
Copy-Item -LiteralPath $World -Destination ($Run+'/saves/'+$WorldName) -Recurse
[IO.File]::WriteAllLines(($Run+'/options.txt'), @('pauseOnLostFocus:false','fullscreen:false','overrideWidth:640','overrideHeight:480','guiScale:2','narrator:0','lang:zh_cn','soundCategory_master:0'), $Utf8)
$LaunchCp = @($Runtime | Where-Object { $_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api' -and $_ -notmatch '\\Editor\\libs\\' })
$Jvm = @('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+$Cache+'/26.1.2/minecraft-merged.jar'),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=registry-supplement','-cp',($LaunchCp -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',($Cache+'/assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer',$WorldName)
$ArgsFile = $Out+'/java.args'
$Jvm=@('-Dcadeditor.vault.dir='+$Run+'/test-vault')+$Jvm
if($WorldOnly){$Jvm=@('-Deditor.accept.worldOnly=true')+$Jvm}
if($OnlyComponents){$Jvm=@('-Deditor.accept.only='+($OnlyComponents -join ','))+$Jvm}
[IO.File]::WriteAllLines($ArgsFile, @($Jvm | ForEach-Object { '"'+$_.Replace('\','\\').Replace('"','\"')+'"' }), $Utf8)
$Info = [Diagnostics.ProcessStartInfo]::new()
$Info.FileName=$JavaBin+'/java.exe'; $Info.Arguments='"@'+$ArgsFile+'"'; $Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false; $Info.CreateNoWindow=$true; $Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
$Games=Get-GameProcesses
if($Games.Count){Write-Output 'real-client run pending: user game running';exit 2}
$Started=[DateTime]::UtcNow; $Process=[Diagnostics.Process]::Start($Info)
[IO.File]::WriteAllText(($Out+'/owned-client-pid.txt'),[string]$Process.Id)
$Stdout=$Process.StandardOutput.ReadToEndAsync(); $Stderr=$Process.StandardError.ReadToEndAsync()
try {
    while (!$Process.WaitForExit(1000)) { if ([DateTime]::UtcNow -gt $Started.AddMinutes(30)) { throw '独立客户端自测超时' } }
    $Code=$Process.ExitCode
} finally {
    if (!$Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    [IO.File]::WriteAllText(($Out+'/client.log'), $Stdout.Result+[Environment]::NewLine+$Stderr.Result)
    $Process.Dispose()
}
$Receipt = $Run+'/acceptance.json'
if(Test-Path -LiteralPath $Receipt){
    $Evidence=Get-Content -LiteralPath $Receipt -Raw | ConvertFrom-Json
    $Evidence | Add-Member -NotePropertyName build -NotePropertyValue $Manifest -Force
    $Evidence | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $Receipt
}
if ($EvidenceRoot) { & ($Root+'/tools/accept/report.ps1') -Receipt $Receipt -OutputDirectory (Join-Path $Out 'report') }
else { & ($Root+'/tools/accept/report.ps1') -Receipt $Receipt }
if ($Code -ne 0 -or !(Test-Path $Receipt) -or (Get-Item $Receipt).LastWriteTimeUtc -lt $Started -or (Get-Content $Receipt | ConvertFrom-Json).status -ne 'COMPLETE') { throw ('注册表补全自测失败；查看 '+$Out+'/client.log 与 '+$Receipt) }
$Result=Get-Content -LiteralPath $Receipt -Raw | ConvertFrom-Json
$Failed=@($Result.attempts | Where-Object { !$_.applied_ok -or !$_.reopen_equal -or !$_.typed_fidelity -or !$_.validate_ok })
$WorldFailed=@($Result.world | Where-Object { !$_.applied_ok -or !$_.reopen_equal -or !$_.typed_fidelity })
$Expected=if($WorldOnly){0}elseif($OnlyComponents){$OnlyComponents.Count*3}else{$Result.registry_components*3}
if($Failed.Count -or $WorldFailed.Count -or @($Result.attempts).Count -ne $Expected -or @($Result.world).Count -ne 12){
    Write-Output ('FAIL acceptance; component rounds='+$Failed.Count+'; world rounds='+$WorldFailed.Count+'; receipt='+$Receipt)
    exit 1
}
Write-Output ('PASS acceptance; receipt='+$Receipt)




