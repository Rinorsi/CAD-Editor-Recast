param([string]$ClasspathJson,[string[]]$Tests=@('dev.rinorsi.editor.registry.WorldRevisionTest','dev.rinorsi.editor.registry.WorldMergeTest','dev.rinorsi.editor.registry.EditDispatchTest','dev.rinorsi.editor.registry.EntityWorldEditTest','dev.rinorsi.editor.registry.WorldEditTest','dev.rinorsi.editor.registry.EntitySchemaTest','dev.rinorsi.editor.registry.EntitySchemaDetailsTest'))
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Log=Join-Path $Root 'logs/world-merge2'
$Work=Join-Path $Root '.world-merge2'
New-Item -ItemType Directory -Force $Log,(Join-Path $Work 'main'),(Join-Path $Work 'test') | Out-Null
$Entries=if($ClasspathJson){@(Get-Content -LiteralPath $ClasspathJson -Raw | ConvertFrom-Json)}else{@((Get-Content (Join-Path $Root 'logs/entity-schema/classpath.txt') -Raw).Trim() -split ';')}
$Mc=Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\\/]26[.]1[.]2[\\/]' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$Cp=(@($Entries | Where-Object {$_ -notmatch 'minecraft-merged.*[.]jar$' -and $_ -notmatch 'classes.java.main$'})+@($Mc.FullName)) -join ';'
Set-Content (Join-Path $Log 'classpath.txt') $Cp
$Sources=Get-ChildItem (Join-Path $Root 'common/versions/26.1/build/generated/stonecutter/main/java'),(Join-Path $Root 'fabric/versions/26.1/build/generated/stonecutter/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName
& "$env:JAVA_HOME/bin/javac.exe" -proc:none -encoding UTF-8 -cp $Cp -d (Join-Path $Work 'main') @Sources *> (Join-Path $Log 'compile.log')
if($LASTEXITCODE -ne 0){throw 'javac失败：logs/world-merge2/compile.log'}
Write-Output 'PASS javac; logs/world-merge2/compile.log'
$Sources=Get-ChildItem (Join-Path $Root 'common/versions/26.1/build/generated/stonecutter/test/java'),(Join-Path $Root 'fabric/versions/26.1/build/generated/stonecutter/test/java'),(Join-Path $Root 'common/versions/26.1/build/generated/stonecutter/testFixtures/java') -Recurse -Filter '*.java' | Where-Object {$_.FullName -notmatch '[\\/]probe[\\/]'} | ForEach-Object FullName
& "$env:JAVA_HOME/bin/javac.exe" -proc:none -encoding UTF-8 -cp ((Join-Path $Work 'main')+';'+$Cp) -d (Join-Path $Work 'test') @Sources *> (Join-Path $Log 'compile-tests.log')
if($LASTEXITCODE -ne 0){throw '测试编译失败：logs/world-merge2/compile-tests.log'}
Write-Output 'PASS javac tests; logs/world-merge2/compile-tests.log'
$Runtime=(Join-Path $Work 'test')+';'+(Join-Path $Work 'main')+';'+$Cp
foreach($Test in $Tests){
 $Name=$Test.Substring($Test.LastIndexOf('.')+1)
 & "$env:JAVA_HOME/bin/java.exe" '-Djava.awt.headless=true' -cp $Runtime $Test *> (Join-Path $Log ($Name+'.log'))
 if($LASTEXITCODE -ne 0){throw ($Name+'失败：logs/world-merge2/'+$Name+'.log')}
 Write-Output ('PASS '+$Name+'; logs/world-merge2/'+$Name+'.log')
}
