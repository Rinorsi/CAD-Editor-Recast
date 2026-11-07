param()
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Logs=Join-Path $Root 'logs/vault'
$Main=Join-Path $Root '.search/vault-main'
$Tests=Join-Path $Root '.search/vault-tests'
New-Item -ItemType Directory -Force $Logs,$Main,$Tests | Out-Null
$JavaBin=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$RuntimeFile=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Runtime=@(Get-Content $RuntimeFile -Raw | ConvertFrom-Json)
$Mc=(Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$BaseJar=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/build/fabric-26.1.2/libs/cadeditor-fabric-26.1.2-0.99.1.jar') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Cp=(@($Mc,$BaseJar)+$Runtime) -join ';'
$Sources=@('registry/VaultChannel.java','registry/RegistryBridge.java','vault/VaultStore.java','vault/VaultStacks.java','registry/search/Pinyin.java','StackCodec.java','ComponentValidation.java','registry/SpawnerData.java') | ForEach-Object {Join-Path $Root ('fabric/src/main/java/dev/rinorsi/editor/'+$_)}
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d $Main $Sources *> ($Logs+'/compile-main.log')
if($LASTEXITCODE){Get-Content ($Logs+'/compile-main.log') -Tail 35;throw 'Java编译失败：logs/vault/compile-main.log'}
$TestCp=(@($Main,($Root+'/fabric/src/main/resources'),$Mc,$BaseJar)+$Runtime) -join ';'
$TestSources=@('fabric/src/test/java/dev/rinorsi/editor/vault/VaultTest.java','fabric/src/testFixtures/java/dev/rinorsi/editor/testing/TooltipFixtures.java') | ForEach-Object {Join-Path $Root $_}
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $TestCp -d $Tests $TestSources *> ($Logs+'/compile-tests.log')
if($LASTEXITCODE){Get-Content ($Logs+'/compile-tests.log') -Tail 35;throw '测试编译失败：logs/vault/compile-tests.log'}
& ($JavaBin+'/java.exe') -Xmx2G -cp ($Tests+';'+$TestCp) dev.rinorsi.editor.vault.VaultTest *> ($Logs+'/tests.log')
if($LASTEXITCODE){Get-Content ($Logs+'/tests.log') -Tail 35;throw '测试失败：logs/vault/tests.log'}
Write-Output 'PASS javac + VaultTest; logs/vault/tests.log'

