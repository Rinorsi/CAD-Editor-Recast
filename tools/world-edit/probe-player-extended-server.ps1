$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location -LiteralPath $Root
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(30)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try {
    New-Item -ItemType Directory -Force (Join-Path $Root 'logs/player-extended') | Out-Null
    & ./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:compileJava :fabric:26.1:compileCodecVerificationJava *> logs/player-extended/probe-build.log
    if($LASTEXITCODE -ne 0){throw '探针源码生成失败：logs/player-extended/probe-build.log'}
    & (Join-Path $PSScriptRoot 'verify-player.ps1') -Tests @('dev.rinorsi.editor.registry.PlayerWorldEditTest')
    & (Join-Path $PSScriptRoot 'probe-player-server.ps1') -Extended
    $Receipt=Get-Content (Join-Path $Root 'logs/player-extended/captured-server.json') -Raw | ConvertFrom-Json
    $Reads=@($Receipt.extended.evidence | Where-Object {$_.request.view -eq 'advancements' -and $_.reply.status -eq 'opened'})
    $RootRead=$Reads | Where-Object {$_.request.query -eq 'minecraft:story/root'} | Select-Object -First 1
    $RootEntry=$RootRead.reply.playerExtended.value.entries | Select-Object -First 1
    if(!$RootEntry.has_display -or $RootEntry.title_key -ne 'advancements.story.root.title'){throw '成就根节点显示元数据断言失败'}
    $RecipeRead=$Reads | Where-Object {$_.request.query -eq 'recipes/' -and $_.request.displayed -eq $false} | Select-Object -First 1
    $RecipeEntry=$RecipeRead.reply.playerExtended.value.entries | Select-Object -First 1
    if(!$RecipeEntry -or $RecipeEntry.has_display -or $RecipeEntry.id -notlike 'minecraft:recipes/*'){throw '内部配方成就断言失败'}
    $Pages=@($Reads | Where-Object {$_.request.displayed -eq $true -and !$_.request.query})
    $Rows=@($Pages | ForEach-Object {$_.reply.playerExtended.value.entries})
    if(!$Pages.Count -or $Rows.Count -ne $Pages[0].reply.playerExtended.total -or @($Rows | Where-Object {!$_.has_display -or $_.id -like 'minecraft:recipes/*'}).Count){throw 'displayed 分页或 total 断言失败'}
    Write-Output 'PASS player server probe; logs/player-extended/captured-server.json'
} finally {Remove-Item -LiteralPath $Lock}
