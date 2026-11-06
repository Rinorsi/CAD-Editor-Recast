# Editor开发启动器：只配置Oriel原生dev-sources，然后启动自己的Loom。
param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$Editor=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace'))
$Assets=Join-Path $Editor 'fabric/src/main/resources/assets/cadeditor'
$Bash=Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
if(!(Test-Path $Bash)){$Bash=(Get-Command bash -ErrorAction Stop).Source}
foreach($Required in @($Assets,(Join-Path $Editor 'libs/oriel-fabric-26.1.2-0.11.0.jar'),(Join-Path $Editor 'tools/gw.sh'))){if(!(Test-Path -LiteralPath $Required)){throw ('缺少文件：'+$Required)}}
$Day=(& $Bash (Join-Path $Workspace 'tools/new-day.sh')).Trim()
if($LASTEXITCODE -ne 0){throw '无法创建当天运行目录'}
if($Day -match '^/([a-zA-Z])/(.*)$'){$Day=$Matches[1].ToUpper()+':/'+$Matches[2]}
$Day=[IO.Path]::GetFullPath($Day)
$RunRoot=Join-Path $Day 'run/editor-mod-client'
$Log=Join-Path $Day 'logs/editor-release-client-launch.log'
. (Join-Path $PSScriptRoot 'dev-sources-config.ps1')
Set-EditorDevSource -File (Join-Path $RunRoot 'config/oriel/dev-sources.properties') -AssetsDirectory $Assets
Write-Host '[1/3] 原生热更新配置完成：不复制页面、不启动监视器。' -ForegroundColor Green
Write-Host ('源码：'+$Assets)
Write-Host '进世界后手持物品按 I 或 /cade；保存CSS/JS即可刷新真实编辑器。'
Write-Host 'PNG换图仍需重新构建；Java改动仍需重新编译。'
if($CheckOnly){Write-Host 'CHECK PASS：配置已就绪，未启动游戏。';exit 0}
$env:GW_TRIES='1'
Push-Location $Editor
try{
    $ErrorActionPreference='Continue'
    Write-Host '[2/3] 正在启动 Gradle：请保持此窗口开启。'
    $LaunchArgs=@(':fabric:26.1.2:runClient','--no-problems-report')
    if($env:EDITOR_LAUNCHER_DEBUG -eq '1'){$LaunchArgs+='-PeditorLauncherDebug=true'}
    $GameStarting=$false
    & $Bash 'tools/gw.sh' @LaunchArgs 2>&1 | ForEach-Object {
        if(!$GameStarting -and $_.ToString() -match '> Task :fabric:26[.]1[.]2:runClient'){$GameStarting=$true;Write-Host '[3/3] 游戏启动中：Minecraft 窗口即将打开。' -ForegroundColor Green}
        $_
    } | Tee-Object -FilePath $Log
    $Result=$LASTEXITCODE
}finally{Pop-Location}
if($Result -ne 0){Write-Host ('启动失败，退出码 '+$Result+'。日志：'+$Log) -ForegroundColor Red}
exit $Result