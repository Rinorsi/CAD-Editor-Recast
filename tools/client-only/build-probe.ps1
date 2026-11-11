param([Parameter(Mandatory)][string]$Evidence)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Evidence=[IO.Path]::GetFullPath($Evidence)
if(Test-Path -LiteralPath $Evidence){throw '探针构建目录必须全新，避免旧class和日志混入'}
New-Item -ItemType Directory -Force $Evidence | Out-Null
$Jdk=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Runtime=@((Get-Content (Join-Path $Root '../Oriel-UI-Workspace/daily/2026-11-09/scratch/editor-mod/runtime-classpath.json') -Raw | ConvertFrom-Json) | ForEach-Object {$_.Replace('\','/')})
$Minecraft=Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar'
$Classes=Join-Path $Evidence 'probe-classes'
New-Item -ItemType Directory -Force $Classes | Out-Null
$Sources=@(Get-ChildItem (Join-Path $Root 'fabric/src/autotest/java/dev/rinorsi/editor/clientonly') -Filter '*.java' -Recurse | ForEach-Object FullName)
# This standalone path uses exactly the already exported Fabric 26.1.2 compile inputs;
# it avoids acquiring Gradle while the production worker owns it.
& ($Jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp ((@($Runtime)+$Minecraft) -join ';') -d $Classes @Sources *> ($Evidence+'/javac.log')
if($LASTEXITCODE -ne 0){throw ('探针编译失败：'+$Evidence+'/javac.log')}
Copy-Item ($PSScriptRoot+'/resources/*') $Classes -Force
& ($Jdk+'/jar.exe') --create --file ($Evidence+'/client-only-lan-instrumentation.jar') -C $Classes . *> ($Evidence+'/jar.log')
if($LASTEXITCODE -ne 0){throw ('探针打包失败：'+$Evidence+'/jar.log')}
Write-Output ('build-probe PASS '+$Evidence+'/javac.log')
