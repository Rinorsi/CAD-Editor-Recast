param([Parameter(Mandatory=$true)][string]$ClasspathJson)
$ErrorActionPreference='Stop'
$Editor=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Work=Join-Path $Editor 'logs/block-edit/classes'
$Log=Join-Path $Editor 'logs/block-edit'
New-Item -ItemType Directory -Force $Log,(Join-Path $Work 'main'),(Join-Path $Work 'test') | Out-Null
$Mc=Get-ChildItem (Join-Path $Editor '.gradle/loom-cache/minecraftMaven/net/minecraft') -Recurse -Filter '*.jar' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$Cp=@(Get-Content -LiteralPath $ClasspathJson | ConvertFrom-Json | Where-Object {$_ -notmatch 'minecraft-merged'})+@($Mc.FullName)
$Java=Join-Path $env:JAVA_HOME 'bin/java.exe'
$Javac=Join-Path $env:JAVA_HOME 'bin/javac.exe'
$Sources=@(Get-ChildItem (Join-Path $Editor 'fabric/src/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
& $Javac -proc:none -encoding UTF-8 -cp ($Cp -join ';') -d (Join-Path $Work 'main') @Sources *> (Join-Path $Log 'compile.log')
if($LASTEXITCODE -ne 0){throw '主源编译失败：logs/block-edit/compile.log'}
Write-Output 'PASS javac main; log=logs/block-edit/compile.log'
$Tests=@(Get-ChildItem (Join-Path $Editor 'fabric/src/test/java'),(Join-Path $Editor 'fabric/src/testFixtures/java') -Recurse -Filter '*.java' | Where-Object {$_.FullName -notmatch '[\/]probe[\/]'} | ForEach-Object FullName)
& $Javac -proc:none -encoding UTF-8 -cp ((Join-Path $Work 'main')+';'+($Cp -join ';')) -d (Join-Path $Work 'test') @Tests *> (Join-Path $Log 'compile-test.log')
if($LASTEXITCODE -ne 0){throw '测试编译失败：logs/block-edit/compile-test.log'}
Write-Output 'PASS javac tests; log=logs/block-edit/compile-test.log'
$Runtime=(Join-Path $Work 'test')+';'+(Join-Path $Work 'main')+';'+($Cp -join ';')
foreach($Test in @('dev.rinorsi.editor.registry.WorldEditTest','dev.rinorsi.editor.StackCodecTest','dev.rinorsi.editor.BackendDataTest','dev.rinorsi.editor.ComplexStackRoundTripTest')) {
    $Name=$Test.Substring($Test.LastIndexOf('.')+1)
    & $Java -cp $Runtime $Test *> (Join-Path $Log ($Name+'.log'))
    if($LASTEXITCODE -ne 0){throw ($Name+' 失败：logs/block-edit/'+$Name+'.log')}
    Write-Output ('PASS '+$Name+'; log=logs/block-edit/'+$Name+'.log')
}

