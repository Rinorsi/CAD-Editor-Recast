param([Parameter(Mandatory)][string]$Evidence,[Parameter(Mandatory)][string]$ClosePacket)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$day=[IO.Path]::GetFullPath((Join-Path $root '../Oriel-UI-Workspace/daily/2026-11-09'))
$jdk=$env:USERPROFILE+'/.jdks/jdk-25.0.5+8/bin'
New-Item -ItemType Directory -Force ($Evidence+'/classes')|Out-Null
$runtime=@(Get-Content ($day+'/logs/user-feedback-entities/environment-26.2/runtime-classpath.json') -Raw|ConvertFrom-Json)
$runtime=@($runtime|Where-Object {$_ -notmatch 'minecraft-merged|oriel|cadeditor-'})
$jar=$day+'/artifacts/feedback-last-effect-262-015/cadeditor-fabric-26.2-0.99.5.jar'
$oriel=$day+'/logs/user-feedback-entities/backend-drafts/live015-prep/oriel-native.jar'
$cp=(@($jar,($env:USERPROFILE+'/.gradle/caches/fabric-loom/26.2/minecraft-merged.jar'),$oriel)+$runtime)-join ';'
$sources=@('client/EditorPrefs.java','client/WorldDraftHost.java','registry/DraftChannel.java','registry/DraftWriteOrder.java','registry/DraftUtf8Counter.java')|ForEach-Object {$root+'/common/src/main/java/dev/rinorsi/editor/'+$_}
$sources+=@('client/WorldDraftPersistenceTest.java','client/ItemDraftPersistenceTest.java','client/EditorPrefsTest.java','client/EditorScalePrefsTest.java','client/EditorUiLogTest.java','client/EditorPageTraceTest.java','registry/DraftWriteOrderTest.java','registry/DraftChannelOwnerTest.java','registry/DraftUtf8CounterTest.java')|ForEach-Object {$root+'/common/src/test/java/dev/rinorsi/editor/'+$_}
@{java=(& ($jdk+'/java.exe') --version 2>&1|Out-String);classpath=$cp;productionSources=$sources;dependencyJar=@(Get-FileHash $jar,$oriel|Select-Object Path,Hash)}|ConvertTo-Json -Depth 5|Set-Content ($Evidence+'/environment.json') -Encoding utf8
& ($jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $cp -d ($Evidence+'/classes') @sources *> ($Evidence+'/compile.log')
if($LASTEXITCODE -ne 0){throw 'item drafts javac failed; compile.log'}
$cp=$Evidence+'/classes;'+$cp
$runs=@(
  @{name='prefs';class='dev.rinorsi.editor.client.EditorPrefsTest';args=@()},
  @{name='order';class='dev.rinorsi.editor.registry.DraftWriteOrderTest';args=@()},
  @{name='owner';class='dev.rinorsi.editor.registry.DraftChannelOwnerTest';args=@($root)},
  @{name='item-write';class='dev.rinorsi.editor.client.ItemDraftPersistenceTest';args=@('write',($Evidence+'/item'),$root)},
  @{name='item-read-new-jvm';class='dev.rinorsi.editor.client.ItemDraftPersistenceTest';args=@('read',($Evidence+'/item'),$root)},
  @{name='world-write';class='dev.rinorsi.editor.client.WorldDraftPersistenceTest';args=@('write',($Evidence+'/world'),$ClosePacket,$root)},
  @{name='world-read-new-jvm';class='dev.rinorsi.editor.client.WorldDraftPersistenceTest';args=@('read',($Evidence+'/world'),$ClosePacket,$root)}
)
New-Item -ItemType Directory -Force ($Evidence+'/world')|Out-Null
foreach($test in $runs){
  $testArgs=$test.args
  & ($jdk+'/java.exe') '-Djava.awt.headless=true' -cp $cp $test.class @testArgs *> ($Evidence+'/'+$test.name+'.log')
  if($LASTEXITCODE -ne 0){throw ($test.name+' failed; '+$Evidence+'/'+$test.name+'.log')}
  Write-Output ('PASS '+$test.name+' | '+$Evidence+'/'+$test.name+'.log')
}
Write-Output 'PASS standalone actual production draft classes + real Oriel Document.close + atomic prefs disk + separate JVM; NOT game/build'
