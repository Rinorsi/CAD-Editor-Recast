$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Engine=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI'))
$Out=Join-Path $Root 'logs/resize'
New-Item -ItemType Directory -Force ($Out+'/classes') | Out-Null
$Cp=($Root+'/libs/oriel-fabric-26.1.2-0.11.0.jar;'+$Engine+'/preview/build/install/preview/lib/*')
& javac -encoding UTF-8 -cp $Cp -d ($Out+'/classes') ($PSScriptRoot+'/ResizePreviewProbe.java') *> ($Out+'/compile.log')
if($LASTEXITCODE){throw '无头探针编译失败，见 logs/resize/compile.log'}
& java '-Djava.awt.headless=true' -cp ($Out+'/classes;'+$Cp) ResizePreviewProbe $Root $Engine ($env:USERPROFILE+'/.gradle/caches/fabric-loom/26.1.2/minecraft-merged.jar') *> ($Out+'/preview-run.log')
if($LASTEXITCODE){throw '无头探针执行失败，见 logs/resize/preview-run.log'}
Write-Output 'PASS headless resize sweep; logs/resize/preview-run.log'
