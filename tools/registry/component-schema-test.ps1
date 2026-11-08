param([string]$ClasspathFile, [switch]$UpdateSnapshot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../baseline-sources.ps1')
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace = [IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Out = Join-Path $Root 'logs/backend-g'
$Classes = Join-Path $Out 'schema-classes'
New-Item -ItemType Directory -Force $Classes | Out-Null
if (!$ClasspathFile) {
    $ClasspathFile = (Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
}
if (!$ClasspathFile) { throw '缺少已导出的 runtime-classpath.json；本脚本不会启动Gradle获取依赖。' }
$Runtime = @(Get-Content -LiteralPath $ClasspathFile | ConvertFrom-Json)
$Cp = $Runtime -join ';'
$Sources = @('ComponentSchema.java','ComponentSchemaChannel.java','ComponentSchemaValidation.java','RegistryPages.java','SpawnerData.java') | ForEach-Object {Join-Path $Root ("${BaselineCommon}/main/java/dev/rinorsi/editor/registry/"+$_)}
$Sources += @('ComponentValidation.java','StackCodec.java') | ForEach-Object {Join-Path $Root ("${BaselineCommon}/main/java/dev/rinorsi/editor/"+$_)}
$Sources += Join-Path $Root "${BaselineCommon}/test/java/dev/rinorsi/editor/registry/ComponentSchemaTest.java"
Push-Location $Root
try {
    & javac -proc:none -encoding UTF-8 -cp $Cp -d $Classes @Sources *> ($Out+'/schema-compile.log')
    if ($LASTEXITCODE) { throw ('组件结构编译失败；查看 '+$Out+'/schema-compile.log') }
    $TestArgs = @()
    if ($UpdateSnapshot) { $TestArgs = @('--write-snapshot', ($Out+'/schema-path-errors.json')) }
    & java -cp ($Classes+';'+$Cp) dev.rinorsi.editor.registry.ComponentSchemaTest @TestArgs *> ($Out+'/schema-test.log')
    if ($LASTEXITCODE) { throw ('组件结构/快照漂移检查失败；查看 '+$Out+'/schema-test.log') }
    Write-Output ('PASS ComponentSchemaTest; log='+$Out+'/schema-test.log')
} finally { Pop-Location }
