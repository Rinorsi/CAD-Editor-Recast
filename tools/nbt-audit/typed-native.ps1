param([Parameter(Mandatory)][string]$Evidence,[Parameter(Mandatory)][string]$RuntimeClasspath,[Parameter(Mandatory)][string]$EditorJar)
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence);New-Item -ItemType Directory -Force ($Evidence+'/classes')|Out-Null
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
@{editor=Get-FileHash -LiteralPath $EditorJar -Algorithm SHA256;tools=@(Get-FileHash -LiteralPath ($PSScriptRoot+'/TypedNativeRoundTrip.java'),($PSScriptRoot+'/typed-ui-payload.cjs') -Algorithm SHA256);ui=@(Get-ChildItem -LiteralPath ($Root+'/common/src/main/resources/assets/cadeditor/ui/js') -Filter '*.js' | Get-FileHash -Algorithm SHA256)} | ConvertTo-Json -Depth 5 | Set-Content ($Evidence+'/source-hashes.json')
$Jdk=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Runtime=@((Get-Content $RuntimeClasspath -Raw|ConvertFrom-Json)|ForEach-Object {$_.Replace('\','/')})
$Cp=(@($EditorJar)+$Runtime+(Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar'))-join ';'
& ($Jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d ($Evidence+'/classes') ($PSScriptRoot+'/TypedNativeRoundTrip.java') *> ($Evidence+'/typed-compile.log')
if($LASTEXITCODE -ne 0){throw 'typed javac失败'}
& ($Jdk+'/java.exe') '-Djava.awt.headless=true' -cp ($Evidence+'/classes;'+$Cp) TypedNativeRoundTrip seed ($Evidence+'/typed-seeds.json') *> ($Evidence+'/typed-seeds.log')
if($LASTEXITCODE -ne 0){throw 'typed seed失败'}
& node ($PSScriptRoot+'/typed-ui-payload.cjs') ($Evidence+'/typed-seeds.json') ($Evidence+'/typed-ui-payload.json') *> ($Evidence+'/typed-ui-payload.log')
if($LASTEXITCODE -ne 0){throw 'typed UI payload失败'}
& ($Jdk+'/java.exe') '-Djava.awt.headless=true' -cp ($Evidence+'/classes;'+$Cp) TypedNativeRoundTrip apply ($Evidence+'/typed-ui-payload.json') ($Evidence+'/typed-native-result.json') *> ($Evidence+'/typed-native.log')
if($LASTEXITCODE -ne 0){throw 'typed native失败'}
Write-Output ('PASS typed native UI -> production backend '+$Evidence+'/typed-native-result.json')
