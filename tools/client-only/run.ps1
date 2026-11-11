param([string]$Evidence,[Parameter(Mandatory)][string]$ProbeJar,[string]$EditorJar,[string]$ExpectedEditorSha256,[string]$RuntimeClasspath,[string]$OrielJar,[switch]$VerifyHotReload,[switch]$VaultSelfDebug,[switch]$PlayerActionsDebug,[switch]$DiagnosticsDebug,[switch]$TextFieldDebug,[switch]$UiInteractionDebug,[switch]$ScaleDebug,[switch]$LayoutDebug,[switch]$LayoutExpectedFixed,[switch]$LayoutPackaged,[ValidateRange(640,2560)][int]$WindowWidth=1280,[ValidateRange(360,1440)][int]$WindowHeight=800,[string]$CasePattern,[ValidateSet('lan','full','extra','notice','inventory','creative','self','expanded','next','backend-single','backend-dual')][string]$Mode='lan')
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Day=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace/daily/2026-11-09'))
if(!$Evidence){$Evidence=Join-Path $Day ('logs/client-only-lan-'+(Get-Date -Format 'HHmmss'))}
$Evidence=[IO.Path]::GetFullPath($Evidence)
if(Test-Path $Evidence){throw '验收目录必须全新，保留以往失败证据'}
$DebugModes=@($DiagnosticsDebug,$TextFieldDebug,$UiInteractionDebug,$ScaleDebug,$LayoutDebug,$VaultSelfDebug,$PlayerActionsDebug)
if(@($DebugModes | Where-Object {$_}).Count -gt 1){throw '一次只能运行一种独立调试验收'}
if($CasePattern){if($Mode -ne 'next'){throw 'CasePattern仅允许next，禁止更改第一批标准'};[regex]::new($CasePattern) | Out-Null}
if($DiagnosticsDebug -and ($Mode -ne 'backend-single' -or $LayoutDebug -or $VaultSelfDebug -or $PlayerActionsDebug -or $VerifyHotReload)){throw 'DiagnosticsDebug仅支持独立backend-single正式包验证'}
if($TextFieldDebug -and ($Mode -ne 'backend-single' -or $VerifyHotReload)){throw 'TextFieldDebug仅支持独立backend-single正式包验证'}
if(($UiInteractionDebug -or $ScaleDebug) -and ($Mode -ne 'backend-single' -or $VerifyHotReload)){throw 'UiInteractionDebug/ScaleDebug仅支持独立backend-single正式包验证'}
if($Mode -in @('next','backend-single','backend-dual')){
 if(!$EditorJar -or $ExpectedEditorSha256 -notmatch '^[0-9a-fA-F]{64}$'){throw '新模式必须显式指定Leader放行EditorJar及ExpectedEditorSha256，禁止猜测旧产物'}
 if((Get-FileHash -LiteralPath $EditorJar -Algorithm SHA256).Hash -ne $ExpectedEditorSha256){throw '生产jar与Leader给定hash不符，未启动游戏'}
}
if(!$EditorJar){$EditorJar=Join-Path $Day 'scratch/editor-mod/build/fabric-26.1.2/libs/cadeditor-fabric-26.1.2-0.99.4.jar'}
$ProbeJar=[IO.Path]::GetFullPath($ProbeJar);$EditorJar=[IO.Path]::GetFullPath($EditorJar)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive=[IO.Compression.ZipFile]::OpenRead($EditorJar)
try { $EmbeddedOriel=@($Archive.Entries | Where-Object {$_.FullName -match '^META-INF/jars/oriel-.*[.]jar$'}).Count -eq 1 } finally {$Archive.Dispose()}
if(!$OrielJar -and !$EmbeddedOriel){$OrielJar=$Root+'/libs/oriel-fabric-26.1.2-0.11.0.jar'}
if($OrielJar){$OrielJar=[IO.Path]::GetFullPath($OrielJar);if(!(Test-Path -LiteralPath $OrielJar)){throw '指定OrielJar不存在'}}
if($Mode -eq 'backend-dual' -and !$OrielJar){throw 'backend-dual旁观端必须显式提供匹配OrielJar'}
if($VerifyHotReload -and $Mode -ne 'backend-single'){throw '热更新隔离验证仅支持backend-single'}
if($ExpectedEditorSha256 -and (Get-FileHash -LiteralPath $EditorJar -Algorithm SHA256).Hash -ne $ExpectedEditorSha256){throw '生产jar与给定hash不符'}
if(!$RuntimeClasspath){$RuntimeClasspath=$Day+'/scratch/editor-mod/runtime-classpath.json'}
$Runtime=@((Get-Content $RuntimeClasspath -Raw | ConvertFrom-Json) | ForEach-Object {$_.Replace('\','/')})
$Api=$Runtime | Where-Object {$_ -match 'net.fabricmc.fabric-api[\/]fabric-api[\/]'} | Select-Object -First 1
$Cp=@($Runtime | Where-Object {$_ -notmatch '[\/]Editor[\/]libs[\/]|net.fabricmc.fabric-api[\/]|mctest|[\/]dev[.]oriel[\/]'})
$Cache=Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
$Java=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin/java.exe'
$Owner=[guid]::NewGuid().ToString('N')
$Port=25781
if($Mode -eq 'backend-single'){$Port=25782}
if($Mode -eq 'backend-dual'){$Port=25783}
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw 'LAN端口已占用，拒绝连接其他实例'}
$Processes=[Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Force $Evidence | Out-Null
if($PlayerActionsDebug -and ($Mode -notin @('backend-single','backend-dual') -or $LayoutDebug -or $VaultSelfDebug -or $VerifyHotReload)){throw 'PlayerActionsDebug仅支持独立backend正式包验证'}
if($VaultSelfDebug -and ($Mode -ne 'backend-single' -or $LayoutDebug -or $VerifyHotReload)){throw 'VaultSelfDebug仅支持独立backend-single正式包验证'}
if($LayoutDebug -and $Mode -ne 'backend-single'){throw '布局调试仅支持隔离backend-single实例'}
if($LayoutPackaged -and (!$LayoutDebug -or $VerifyHotReload)){throw 'LayoutPackaged须与LayoutDebug一起使用且不能开启VerifyHotReload'}
if($VerifyHotReload -or ($LayoutDebug -and !$LayoutPackaged)){
 $DevSourceRoot=$Evidence+'/hotreload-source'
 New-Item -ItemType Directory -Force ($DevSourceRoot+'/src/main/resources/assets') | Out-Null
 Copy-Item -LiteralPath ($Root+'/common/src/main/resources/assets/cadeditor') -Destination ($DevSourceRoot+'/src/main/resources/assets/cadeditor') -Recurse
 $FixturePage=$DevSourceRoot+'/src/main/resources/assets/cadeditor/ui/index.html'
 $PageText=[IO.File]::ReadAllText($FixturePage)
 $PageText=[regex]::Replace($PageText,'<html(?=[ >])','<html data-release-proof="before"',1)
 [IO.File]::WriteAllText($FixturePage,$PageText,[Text.UTF8Encoding]::new($false))
}
@{mode=$Mode;port=$Port;editorJar=$EditorJar;sha256=(Get-FileHash -LiteralPath $EditorJar -Algorithm SHA256).Hash;probeJar=$ProbeJar;runtimeClasspath=$RuntimeClasspath;casePattern=$CasePattern;embeddedOriel=$EmbeddedOriel;orielJar=$OrielJar;devSourceRoot=$DevSourceRoot;diagnosticsDebug=[bool]$DiagnosticsDebug;textFieldDebug=[bool]$TextFieldDebug;uiInteractionDebug=[bool]$UiInteractionDebug;scaleDebug=[bool]$ScaleDebug;playerActionsDebug=[bool]$PlayerActionsDebug;vaultSelfDebug=[bool]$VaultSelfDebug;layoutDebug=[bool]$LayoutDebug;layoutExpectedFixed=[bool]$LayoutExpectedFixed} | ConvertTo-Json | Set-Content ($Evidence+'/configuration.json')
function Launch([string]$Role,[switch]$Restart){
 $Run=Join-Path $Evidence $Role
 if(!$Restart){
 New-Item -ItemType Directory -Force ($Run+'/mods') | Out-Null
 if($DevSourceRoot -and $Role -eq 'host'){
  New-Item -ItemType Directory -Force ($Run+'/config/oriel') | Out-Null
  [IO.File]::WriteAllText(($Run+'/config/oriel/dev-sources.properties'),('cadeditor='+$DevSourceRoot.Replace([char]92,[char]47)+'/src/main/resources/assets/cadeditor'),[Text.UTF8Encoding]::new($false))
 }
 Copy-Item -LiteralPath $Api -Destination ($Run+'/mods')
 Copy-Item -LiteralPath $ProbeJar -Destination ($Run+'/mods')
 if($Role -eq 'joiner' -or ($Role -eq 'host' -and $Mode -in @('backend-single','backend-dual'))){
  Copy-Item -LiteralPath $EditorJar -Destination ($Run+'/mods')
  if(!$EmbeddedOriel){Copy-Item -LiteralPath $OrielJar -Destination ($Run+'/mods')}
 }
 if($Role -eq 'observer' -and $Mode -eq 'backend-dual'){
  # Oriel registers server-synced entries: its real handshake requires the same
  # dependency even on this non-Editor observer. Client-only modes stay bare.
  Copy-Item -LiteralPath $OrielJar -Destination ($Run+'/mods')
 }
 if($Role -eq 'host'){
  $World=Get-ChildItem ($Root+'/../Oriel-UI-Workspace/daily/*/run/editor-autotest-client/saves/Editor-release-test/level.dat') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if(!$World){throw '找不到隔离测试世界模板'}
  New-Item -ItemType Directory ($Run+'/saves') | Out-Null
  Copy-Item -LiteralPath $World.Directory.FullName -Destination ($Run+'/saves/LanFixture') -Recurse
  @{source=$World.Directory.FullName;levelDatSha256=(Get-FileHash -LiteralPath $World.FullName -Algorithm SHA256).Hash;copy=$Run+'/saves/LanFixture'} | ConvertTo-Json | Set-Content ($Run+'/source-world.json')
 }
 @(Get-ChildItem ($Run+'/mods') -Filter '*.jar' | ForEach-Object {@{name=$_.Name;path=$_.FullName;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}}) | ConvertTo-Json -Depth 4 | Set-Content ($Run+'/installed-jars.json')
 [IO.File]::WriteAllLines(($Run+'/options.txt'),@('pauseOnLostFocus:false','fullscreen:false',('overrideWidth:'+$WindowWidth),('overrideHeight:'+$WindowHeight),'guiScale:2','narrator:0','lang:zh_cn','tutorialStep:none','soundCategory_master:0','renderDistance:2','simulationDistance:2'),[Text.UTF8Encoding]::new($false))
 $Jvm=@('-Xmx1536M','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+$Cache+'/26.1.2/minecraft-merged.jar'),'-Dfabric.gameVersion=26.1.2','-Deditor.autotest=client-only-lan',('-Deditor.clientOnly.owner='+$Owner),('-Dcadeditor.vault.dir='+$Run+'/test-vault'),'-cp',($Cp -join ';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username',$(if($Role -eq 'host'){'LanHost'}elseif($Role -eq 'joiner'){'LanEditor'}else{'LanObserver'}),'--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',($Cache+'/assets'),'--assetIndex','26.1.2-30')
 if($Role -eq 'host'){$Jvm+=@('--quickPlaySingleplayer','LanFixture')}else{$Jvm+=@('--quickPlayMultiplayer',('127.0.0.1:'+$Port))}
 $ArgFile=$Run+'/java.args'
 [IO.File]::WriteAllLines($ArgFile,@($Jvm | ForEach-Object {'"'+$_.Replace('\','\\').Replace('"','\"')+'"'}),[Text.UTF8Encoding]::new($false))
 }else{$ArgFile=$Run+'/java.args'}
 $Info=[Diagnostics.ProcessStartInfo]::new();$Info.FileName=$Java;$Info.Arguments='"@'+$ArgFile+'"';$Info.WorkingDirectory=$Run
 $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden';$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
 $P=[Diagnostics.Process]::Start($Info)
 $Processes.Add(@{process=$P;stdout=$P.StandardOutput.ReadToEndAsync();stderr=$P.StandardError.ReadToEndAsync();run=$Run})
 return $P
}
try {
 $HostProcess=Launch 'host'
 if($Mode -eq 'backend-single'){
  & node ($PSScriptRoot+'/backend-driver.mjs') $Evidence $Mode
  if($LASTEXITCODE -ne 0){throw '单人完整后端验收失败，见backend-driver-error.txt'}
  if($UiInteractionDebug -or $ScaleDebug){
   if(!$HostProcess.WaitForExit(30000)){throw '缩放验收后的自有客户端未正常退出，停止重启验证'}
   $First=$Processes[$Processes.Count-1]
   [IO.File]::WriteAllText(($First.run+'/stdout-first.log'),$First.stdout.GetAwaiter().GetResult())
   [IO.File]::WriteAllText(($First.run+'/stderr-first.log'),$First.stderr.GetAwaiter().GetResult())
   $First.restartPhase='first'
   Copy-Item -LiteralPath ($Evidence+'/backend-environment.json') -Destination ($Evidence+'/backend-environment-first.json')
   # A new probe has no previous request ID: never let it replay the old stop RPC.
   foreach($Name in @('request.json','response.json','request.tmp')){
    $Rpc=Join-Path $First.run $Name
    if(Test-Path -LiteralPath $Rpc){Remove-Item -LiteralPath $Rpc}
   }
   $HostProcess=Launch 'host' -Restart
   & node ($PSScriptRoot+'/backend-driver.mjs') $Evidence ui-restart
   if($LASTEXITCODE -ne 0){throw '独立新JVM配置恢复验收失败，见backend-driver-error.txt'}
  }
 }elseif($Mode -eq 'backend-dual'){
  & node ($PSScriptRoot+'/backend-driver.mjs') $Evidence host-ready
  if($LASTEXITCODE -ne 0){throw '双端房主启动失败'}
  $JoinerProcess=Launch 'joiner'
  $ObserverProcess=Launch 'observer'
  & node ($PSScriptRoot+'/backend-driver.mjs') $Evidence $Mode
  if($LASTEXITCODE -ne 0){throw '双端完整后端验收失败，见backend-driver-error.txt'}
 }else{
 & node ($PSScriptRoot+'/driver.mjs') $Evidence host-ready
 if($LASTEXITCODE -ne 0){throw '房主启动或开放LAN失败'}
 $JoinerProcess=Launch 'joiner'
 $ObserverProcess=Launch 'observer'
 & node ($PSScriptRoot+'/driver.mjs') $Evidence $Mode
 if($LASTEXITCODE -ne 0){throw 'LAN验收失败，见driver-error.txt'}
 }
} finally {
 foreach($Record in $Processes){
  $P=$Record.process
  if(!$P.WaitForExit(15000)){$P.Kill();$P.WaitForExit()}
  $Suffix=if($Record.restartPhase -eq 'first'){'-first'}else{''}
  [IO.File]::WriteAllText(($Record.run+'/stdout'+$Suffix+'.log'),$Record.stdout.GetAwaiter().GetResult())
  [IO.File]::WriteAllText(($Record.run+'/stderr'+$Suffix+'.log'),$Record.stderr.GetAwaiter().GetResult())
 }
 @{owner=$Owner;remaining=@($Processes | Where-Object {!$_.process.HasExited} | ForEach-Object {$_.process.Id})} | ConvertTo-Json | Set-Content ($Evidence+'/cleanup.json')
 @{port=$Port;ownedPids=@($Processes | ForEach-Object {$_.process.Id});listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)} | ConvertTo-Json -Depth 4 | Set-Content ($Evidence+'/port-cleanup.json')
}
