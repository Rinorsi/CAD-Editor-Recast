param([switch]$Memory)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Logs=Join-Path $Root 'logs/search/lazy'
$Main=Join-Path $Root '.search/gate-main'
$Tests=Join-Path $Root '.search/gate-tests'
New-Item -ItemType Directory -Force $Logs,$Main,$Tests | Out-Null
$JavaBin=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$RuntimeFile=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Runtime=@(Get-Content $RuntimeFile | ConvertFrom-Json)
$Mc=(Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\/]26[.]1[.]2[\/]' } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Cp=(@($Mc)+$Runtime) -join ';'
$Sources=@(Get-ChildItem ($Root+'/common/versions/26.1/build/generated/stonecutter/main/java'),($Root+'/fabric/versions/26.1/build/generated/stonecutter/main/java') -Recurse -Filter '*.java' | ForEach-Object FullName)
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d $Main $Sources *> ($Logs+'/compile-main.log')
if($LASTEXITCODE){throw 'Java编译失败：logs/search/lazy/compile-main.log'}
$TestSources=@(Get-ChildItem ($Root+'/common/versions/26.1/build/generated/stonecutter/test/java'),($Root+'/common/versions/26.1/build/generated/stonecutter/testFixtures/java') -Recurse -Filter '*.java' | Where-Object {$_.FullName -notmatch 'test[\/]java[\/]dev[\/]rinorsi[\/]editor[\/]probe[\/]'} | ForEach-Object FullName)
$TestCp=(@($Main,($Root+'/common/src/main/resources'))+$Runtime+@($Mc)) -join ';'
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $TestCp -d $Tests $TestSources *> ($Logs+'/compile-tests.log')
if($LASTEXITCODE){throw '测试编译失败：logs/search/lazy/compile-tests.log'}
$RunCp=$Tests+';'+$TestCp
$Names=@('dev.rinorsi.editor.StackCodecTest','dev.rinorsi.editor.ComplexStackRoundTripTest','dev.rinorsi.editor.BackendDataTest','dev.rinorsi.editor.client.EditorSoundPreviewTest','dev.rinorsi.editor.client.EditorPrefsTest','dev.rinorsi.editor.client.EditorClipboardTest','dev.rinorsi.editor.registry.SpawnerApplyTest','dev.rinorsi.editor.registry.FrontendWiringTest','dev.rinorsi.editor.registry.ResourceIdsTest','dev.rinorsi.editor.registry.EntityDataTest','dev.rinorsi.editor.registry.RegistryStressTest','dev.rinorsi.editor.registry.DraftUtf8CounterTest','dev.rinorsi.editor.registry.RegistryPagesTest','dev.rinorsi.editor.registry.RegistryDeliveryTest')
$Failures=0
Push-Location $Root
try {
    foreach($Name in $Names){
        $Short=$Name.Split('.')[-1];$Log=$Logs+'/'+$Short+'.log'
        & ($JavaBin+'/java.exe') -Xmx1G -cp $RunCp $Name *> $Log
        if($LASTEXITCODE){$Failures++;Write-Output ('FAIL '+$Short+' '+$Log)}else{Write-Output ('PASS '+$Short+' '+$Log)}
    }
    foreach($Name in @('dev.rinorsi.editor.registry.search.SearchTest','dev.rinorsi.editor.registry.LazyCatalogTest')){
        $Short=$Name.Split('.')[-1];$Log=$Logs+'/'+$Short+'.log'
        & ($JavaBin+'/java.exe') -Xmx2G -cp $RunCp $Name ($Root+'/common/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js') *> $Log
        if($LASTEXITCODE){$Failures++;Write-Output ('FAIL '+$Short+' '+$Log)}else{Write-Output ('PASS '+$Short+' '+$Log)}
    }
    if($Memory){
        & ($JavaBin+'/java.exe') -Xmx3G -cp $RunCp dev.rinorsi.editor.registry.CatalogMemoryBench ($Root+'/common/src/main/resources/assets/cadeditor/ui/js/pinyin-data.js') *> ($Logs+'/memory.log')
        if($LASTEXITCODE){$Failures++;Write-Output ('FAIL memory '+$Logs+'/memory.log')}else{Write-Output ('PASS memory '+$Logs+'/memory.log')}
    }
} finally {Pop-Location}
if($Failures){throw ("失败门禁："+$Failures+'；查看 logs/search/lazy/*.log')}
