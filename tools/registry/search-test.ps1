param([switch]$Bench)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../baseline-sources.ps1')
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$JavaBin=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Out=Join-Path $Root '.search/classes'
$Logs=Join-Path $Root 'logs/search'
New-Item -ItemType Directory -Force $Out,$Logs | Out-Null
$Sources=@(Get-ChildItem ($Root+"/${BaselineCommon}/main/java/dev/rinorsi/editor/registry/search/*.java") | ForEach-Object FullName)+@(Get-ChildItem ($Root+"/${BaselineCommon}/test/java/dev/rinorsi/editor/registry/search/*.java") | ForEach-Object FullName)
& ($JavaBin+'/javac.exe') -encoding UTF-8 -d $Out $Sources *> ($Logs+'/compile-pure.log')
if($LASTEXITCODE){throw '纯JVM编译失败：logs/search/compile-pure.log'}
$Pinyin=Join-Path $Root 'common/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js'
& ($JavaBin+'/java.exe') -Xmx2G -cp $Out dev.rinorsi.editor.registry.search.SearchTest $Pinyin *> ($Logs+'/tests.log')
if($LASTEXITCODE){throw '搜索测试失败：logs/search/tests.log'}
if($Bench){& ($JavaBin+'/java.exe') -Xmx2G -cp $Out dev.rinorsi.editor.registry.search.SearchBench $Pinyin *> ($Logs+'/bench.log');if($LASTEXITCODE){throw '合成负载测量失败：logs/search/bench.log'}}
Write-Output 'PASS host search tests; logs/search/tests.log'
