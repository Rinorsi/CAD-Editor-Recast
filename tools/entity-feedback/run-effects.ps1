param([Parameter(Mandatory)][string]$Evidence,[switch]$Patched)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$day=[IO.Path]::GetFullPath((Join-Path $root '../Oriel-UI-Workspace/daily/2026-11-09'))
$jdk=$env:USERPROFILE+'/.jdks/jdk-25.0.5+8/bin'
New-Item -ItemType Directory -Force ($Evidence+'/classes')|Out-Null
$jar=$day+'/artifacts/integrated-014-tooltip-six/cadeditor-fabric-26.2-0.99.5.jar'
$runtime=@(Get-Content ($day+'/artifacts/integrated-014-0ec43cec74ab/native-runtime-classpath.json') -Raw|ConvertFrom-Json)
$runtime=@($runtime|Where-Object {$_ -notmatch 'minecraft-merged|oriel-fabric|cadeditor-'})
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($jar)
try{$entry=@($zip.Entries|Where-Object {$_.FullName -match '^META-INF/jars/oriel-.*[.]jar$'})[0];[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,($Evidence+'/oriel-native.jar'),$true)}finally{$zip.Dispose()}
$cp=(@($jar,($day+'/scratch/editor-mod/build/fabric-26.2/classes/java/codecVerification'),($env:USERPROFILE+'/.gradle/caches/fabric-loom/26.2/minecraft-merged.jar'),($Evidence+'/oriel-native.jar'))+$runtime)-join ';'
$sources=@($root+'/common/src/test/java/dev/rinorsi/editor/registry/EffectRetentionTest.java')
if($Patched){$sources+=@(($root+'/common/src/main/java/dev/rinorsi/editor/world/WorldNbt.java'),($root+'/common/src/main/java/dev/rinorsi/editor/world/EffectNbt.java'),($root+'/common/src/main/java/dev/rinorsi/editor/world/EntityWorldEdit.java'))}
& ($jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $cp -d ($Evidence+'/classes') @sources *> ($Evidence+'/compile.log')
if($LASTEXITCODE -ne 0){throw 'effects javac failed; see compile.log'}
$cp=$Evidence+'/classes;'+$cp
& ($jdk+'/java.exe') '-Djava.awt.headless=true' -cp $cp dev.rinorsi.editor.registry.EffectRetentionTest seed ($Evidence+'/seed.json') *> ($Evidence+'/seed.log')
if($LASTEXITCODE -ne 0){throw 'effect seed failed; see seed.log'}
& node ($PSScriptRoot+'/effect-payload.cjs') ($Evidence+'/seed.json') ($Evidence+'/payloads.json') *> ($Evidence+'/ui.log')
if($LASTEXITCODE -ne 0){throw 'effect UI failed; see ui.log'}
& ($jdk+'/java.exe') '-Djava.awt.headless=true' "-Deffects.negative=$($Patched.IsPresent.ToString().ToLowerInvariant())" -cp $cp dev.rinorsi.editor.registry.EffectRetentionTest apply ($Evidence+'/payloads.json') ($Evidence+'/result.json') *> ($Evidence+'/native.log')
if($LASTEXITCODE -ne 0){throw 'effect retention failed; see native.log and result.json'}
Write-Output 'PASS MC26.2 actual effect controls -> native loader -> strict field retention'
