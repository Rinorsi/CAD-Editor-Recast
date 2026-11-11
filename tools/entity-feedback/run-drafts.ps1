param([Parameter(Mandatory)][string]$Evidence,[Parameter(Mandatory)][string]$ClosePacket,[Parameter(Mandatory)][string]$NativeEvidence)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$day=[IO.Path]::GetFullPath((Join-Path $root '../Oriel-UI-Workspace/daily/2026-11-09'))
$jdk=$env:USERPROFILE+'/.jdks/jdk-25.0.5+8/bin'
New-Item -ItemType Directory -Force ($Evidence+'/classes')|Out-Null
$runtime=@(Get-Content ($day+'/artifacts/integrated-014-0ec43cec74ab/native-runtime-classpath.json') -Raw|ConvertFrom-Json)
$runtime=@($runtime|Where-Object {$_ -notmatch 'minecraft-merged|oriel-fabric|cadeditor-'})
$cp=(@(($day+'/artifacts/integrated-014-tooltip-six/cadeditor-fabric-26.2-0.99.5.jar'),($day+'/scratch/editor-mod/build/fabric-26.2/classes/java/codecVerification'),($env:USERPROFILE+'/.gradle/caches/fabric-loom/26.2/minecraft-merged.jar'),($NativeEvidence+'/oriel-native.jar'))+$runtime)-join ';'
$sources=@('client/EditorPrefs.java','client/WorldDraftHost.java','registry/DraftChannel.java','registry/DraftUtf8Counter.java')|ForEach-Object {$root+'/common/src/main/java/dev/rinorsi/editor/'+$_}
$sources+=@(($root+'/common/src/test/java/dev/rinorsi/editor/client/WorldDraftPersistenceTest.java'),($root+'/common/src/test/java/dev/rinorsi/editor/client/EditorPrefsTest.java'))
& ($jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $cp -d ($Evidence+'/classes') @sources *> ($Evidence+'/compile.log')
if($LASTEXITCODE -ne 0){throw 'drafts javac failed; compile.log'}
$cp=$Evidence+'/classes;'+$cp
& ($jdk+'/java.exe') '-Djava.awt.headless=true' -cp $cp dev.rinorsi.editor.client.EditorPrefsTest *> ($Evidence+'/prefs-existing.log')
if($LASTEXITCODE -ne 0){throw 'existing EditorPrefsTest failed'}
& ($jdk+'/java.exe') '-Djava.awt.headless=true' -cp $cp dev.rinorsi.editor.client.WorldDraftPersistenceTest write $Evidence $ClosePacket $root *> ($Evidence+'/write-close.log')
if($LASTEXITCODE -ne 0){throw 'native close/persistence failed; write-close.log'}
& ($jdk+'/java.exe') '-Djava.awt.headless=true' -cp $cp dev.rinorsi.editor.client.WorldDraftPersistenceTest read $Evidence $ClosePacket $root *> ($Evidence+'/read-new-jvm.log')
if($LASTEXITCODE -ne 0){throw 'separate JVM restoration failed; read-new-jvm.log'}
Write-Output 'PASS native Oriel pagehide -> full world snapshot -> atomic existing prefs file -> separate JVM exact restoration'
