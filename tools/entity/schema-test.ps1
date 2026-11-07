param([string]$RuntimeClasspath)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $Root
if(!$RuntimeClasspath){$RuntimeClasspath=Join-Path $Root ('../Oriel-UI-Workspace/daily/'+(Get-Date -Format yyyy-MM-dd)+'/scratch/editor-mod/runtime-classpath.json')}
if(!(Test-Path -LiteralPath $RuntimeClasspath)){throw ('需要已有依赖classpath；不自动启动Gradle: '+$RuntimeClasspath)}
$Out=Join-Path $Root 'logs/entity-schema'
New-Item -ItemType Directory -Force ($Out+'/classes') | Out-Null
$Paths=@((Get-Content -LiteralPath $RuntimeClasspath | ConvertFrom-Json) | ForEach-Object { $_.Replace([char]92,[char]47) })
$Paths+=Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar'
$Cp=$Paths -join ';'
$Sources=@(Get-ChildItem -LiteralPath ($Root+'/fabric/src/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
$Sources+=@('EntitySchemaTestLevel','EntitySchemaTest','SpawnerApplyTest') | ForEach-Object { $Root+'/fabric/src/test/java/dev/rinorsi/editor/registry/'+$_+'.java' }
& javac -encoding UTF-8 -cp $Cp -d ($Out+'/classes') $Sources *> ($Out+'/compile-main.log')
if($LASTEXITCODE){throw '实体schema编译失败，见 logs/entity-schema/compile-main.log'}
Write-Output 'javac all production Java + entity tests -> PASS -> logs/entity-schema/compile-main.log'
foreach($Side in @('client','server')){
    $Client=if($Side -eq 'client'){'true'}else{'false'}
    & java '-Djava.awt.headless=true' '--enable-native-access=ALL-UNNAMED' ('-Dcadeditor.schema.client='+$Client) -cp ($Out+'/classes;'+$Cp) dev.rinorsi.editor.registry.EntitySchemaTest ($Out+'/captured-'+$Side+'.json') *> ($Out+'/tests-'+$Side+'.log')
    if($LASTEXITCODE){throw ('实体schema '+$Side+' JVM验证失败，见 logs/entity-schema/tests-'+$Side+'.log')}
    Write-Output ('EntitySchemaTest '+$Side+' -> PASS -> logs/entity-schema/tests-'+$Side+'.log')
}
& java '-Djava.awt.headless=true' '--enable-native-access=ALL-UNNAMED' -cp ($Out+'/classes;'+$Cp) dev.rinorsi.editor.registry.SpawnerApplyTest *> ($Out+'/spawner-apply.log')
if($LASTEXITCODE){throw '刷怪器既有回归失败，见 logs/entity-schema/spawner-apply.log'}
Write-Output 'SpawnerApplyTest -> PASS -> logs/entity-schema/spawner-apply.log'
