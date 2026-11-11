param()
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../baseline-sources.ps1')
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Logs=Join-Path $Root 'logs/tooltip'
$Main=Join-Path $Root '.search/tooltip-main'
$Tests=Join-Path $Root '.search/tooltip-tests'
New-Item -ItemType Directory -Force $Logs,$Main,$Tests | Out-Null
$JavaBin=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$RuntimeFile=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/runtime-classpath.json') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Runtime=@(Get-Content $RuntimeFile | ConvertFrom-Json)
$Mc=(Get-ChildItem (Join-Path $Root '.gradle/loom-cache/minecraftMaven') -Recurse -Filter '*.jar' | Where-Object { $_.FullName -match '[\\/]26[.]1[.]2[\\/]' } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$BaseJar=(Get-ChildItem ($Workspace+'/daily/*/scratch/editor-mod/build/fabric-26.1.2/libs/cadeditor-fabric-26.1.2-0.99.2.jar') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).FullName
$Cp=(@($Mc,$BaseJar)+$Runtime) -join ';'
$Sources=@('registry/TooltipChannel.java','registry/TooltipPreview.java','registry/InlineTextFont.java','StackCodec.java','ComponentValidation.java','registry/SpawnerData.java') | ForEach-Object {Join-Path $Root ("${BaselineCommon}/main/java/dev/rinorsi/editor/"+$_)}
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d $Main $Sources *> ($Logs+'/compile-main.log')
if($LASTEXITCODE){throw 'Java编译失败：logs/tooltip/compile-main.log'}
$TestSources=@("${BaselineCommon}/test/java/dev/rinorsi/editor/registry/TooltipPreviewTest.java","${BaselineCommon}/testFixtures/java/dev/rinorsi/editor/testing/TooltipFixtures.java","${BaselineCommon}/testFixtures/java/dev/rinorsi/editor/testing/TooltipTestRegistries.java","${BaselineCommon}/test/java/dev/rinorsi/editor/StackCodecTest.java","${BaselineCommon}/test/java/dev/rinorsi/editor/EditorSessionsTest.java","${BaselineCommon}/test/java/dev/rinorsi/editor/TestKitTest.java","${BaselineCommon}/test/java/dev/rinorsi/editor/registry/FrontendWiringTest.java") | ForEach-Object {Join-Path $Root $_}
$TestCp=(@($Main,($Root+'/common/src/main/resources'),$Mc,$BaseJar)+$Runtime) -join ';'
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp $TestCp -d $Tests $TestSources *> ($Logs+'/compile-tests.log')
if($LASTEXITCODE){throw '测试编译失败：logs/tooltip/compile-tests.log'}
$ProbeSources=@("${BaselineFabric}/autotest/java/dev/rinorsi/editor/registry/TooltipProbe.java","${BaselineFabric}/autotest/java/dev/rinorsi/editor/registry/supplementmixin/RegistrySupplementWindowMixin.java","${BaselineFabric}/autotest/java/dev/rinorsi/editor/probe/mixin/NoMouseCaptureMixin.java") | ForEach-Object {Join-Path $Root $_}
& ($JavaBin+'/javac.exe') -proc:none -encoding UTF-8 -cp ($Tests+';'+$TestCp) -d $Tests $ProbeSources *> ($Logs+'/compile-probe.log')
if($LASTEXITCODE){throw '探针编译失败：logs/tooltip/compile-probe.log'}
$RunCp=$Tests+';'+$TestCp

$Failures=0
Push-Location $Root
try {
    foreach($Name in @('dev.rinorsi.editor.registry.TooltipPreviewTest','dev.rinorsi.editor.StackCodecTest','dev.rinorsi.editor.registry.FrontendWiringTest')){
        $Short=$Name.Split('.')[-1];$Log=$Logs+'/'+$Short+'.log'
        & ($JavaBin+'/java.exe') -Xmx1G -cp $RunCp $Name *> $Log
        if($LASTEXITCODE){$Failures++;Write-Output ('FAIL '+$Short+' '+$Log)}else{Write-Output ('PASS '+$Short+' '+$Log)}
    }
} finally {Pop-Location}
if($Failures){throw ('失败门禁：'+$Failures+'；查看 logs/tooltip/*.log')}
