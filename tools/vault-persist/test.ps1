param([switch]$CompileOnly,[switch]$GlobalOnly)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Logs=Join-Path $Root 'logs/vault-persist'
$Main=Join-Path $Root '.search/vault-persist-main'
$Tests=Join-Path $Root '.search/vault-persist-tests'
New-Item -ItemType Directory -Force $Logs,$Main,$Tests | Out-Null
$JavaBin=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$RuntimeFile=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Runtime=@(Get-Content $RuntimeFile -Raw | ConvertFrom-Json)
$Mc=(Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\/]26[.]1[.]2[\/]' } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$BaseJar=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/build/fabric-26.1.2/libs/cadeditor-fabric-26.1.2-0.99.2.jar') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Cp=(@($Mc,$BaseJar)+$Runtime) -join ';'
$Sources=@(Get-ChildItem ($Root+'/common/versions/26.1/build/generated/stonecutter/main/java'),($Root+'/fabric/versions/26.1/build/generated/stonecutter/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d $Main $Sources *> ($Logs+'/compile-main.log')
if($LASTEXITCODE){Get-Content ($Logs+'/compile-main.log') -Tail 35;throw 'Java编译失败：logs/vault-persist/compile-main.log'}
$TestCp=(@($Main,($Root+'/common/src/main/resources'),$Mc,$BaseJar)+$Runtime) -join ';'
$TestSources=@(Get-ChildItem ($Root+'/common/versions/26.1/build/generated/stonecutter/test/java') -Recurse -Filter '*.java' | ForEach-Object FullName)+@(Get-ChildItem ($Root+'/common/versions/26.1/build/generated/stonecutter/testFixtures/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $TestCp -d $Tests $TestSources *> ($Logs+'/compile-tests.log')
if($LASTEXITCODE){Get-Content ($Logs+'/compile-tests.log') -Tail 35;throw '测试编译失败：logs/vault-persist/compile-tests.log'}
if($GlobalOnly){
  & ($JavaBin+'/java.exe') -Xmx2G -cp ($Tests+';'+$TestCp) dev.rinorsi.editor.vault.VaultGlobalTest *> ($Logs+'/VaultGlobalTest.log')
  if($LASTEXITCODE){Get-Content ($Logs+'/VaultGlobalTest.log') -Tail 25;exit $LASTEXITCODE}
  Write-Output 'PASS VaultGlobalTest; logs/vault-persist/VaultGlobalTest.log'
  exit 0
}
if($CompileOnly){Write-Output 'PASS full-source javac + all test javac';exit 0}
& ($JavaBin+'/java.exe') -Xmx2G -cp ($Tests+';'+$TestCp) dev.rinorsi.editor.vault.VaultTest *> ($Logs+'/tests.log')
if($LASTEXITCODE){Get-Content ($Logs+'/tests.log') -Tail 35;throw '测试失败：logs/vault-persist/tests.log'}
Write-Output 'PASS javac + VaultTest; logs/vault-persist/tests.log'

& ($JavaBin+'/java.exe') -Xmx2G -cp ($Tests+';'+$TestCp) dev.rinorsi.editor.vault.VaultPersistenceTest *> ($Logs+'/persistence-tests.log')
if($LASTEXITCODE){Get-Content ($Logs+'/persistence-tests.log') -Tail 35;throw '测试失败：logs/vault-persist/persistence-tests.log'}
Write-Output 'PASS VaultPersistenceTest; logs/vault-persist/persistence-tests.log'
foreach($name in @('dev.rinorsi.editor.vault.VaultGlobalTest','dev.rinorsi.editor.StackCodecTest','dev.rinorsi.editor.client.EditorPrefsTest')) {
  $short=$name.Split('.')[-1]
  & ($JavaBin+'/java.exe') -Xmx2G -cp ($Tests+';'+$TestCp) $name *> ($Logs+'/'+$short+'.log')
  if($LASTEXITCODE){throw ('相关测试失败：'+$short+'；logs/vault-persist/'+$short+'.log')}
  Write-Output ('PASS '+$short+'; logs/vault-persist/'+$short+'.log')
}
