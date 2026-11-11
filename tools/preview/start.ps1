# Editor开发启动器：只配置Oriel原生dev-sources，然后启动自己的Loom。
param(
    [switch]$CheckOnly,
    [switch]$Menu,
    [switch]$PlanOnly,
    [ValidateSet('fabric','neoforge')][string]$Loader='fabric',
    [ValidateSet('26.1','26.1.2','26.2','26.3')][string]$Minecraft='26.1.2'
)
$ErrorActionPreference='Stop'
$Editor=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace'))
$Assets=Join-Path $Editor 'common/src/main/resources/assets/cadeditor'
if($Menu -and !$CheckOnly -and !$PlanOnly){
    $Targets=@(
        @('fabric','26.1.2'),@('fabric','26.2'),@('fabric','26.3'),
        @('neoforge','26.1.2'),@('neoforge','26.2'),@('neoforge','26.3')
    )
    Write-Host '选择 CAD Editor 开发启动方案（包含源码热更新）' -ForegroundColor Cyan
    for($i=0;$i -lt $Targets.Count;$i++){
        Write-Host ('  {0}. {1} / Minecraft {2}' -f ($i+1),$Targets[$i][0],$Targets[$i][1])
    }
    Write-Host '  Q. 退出'
    do {
        $Choice=(Read-Host '输入 1–6，或 Q 退出').Trim()
        if($Choice -match '^[qQ]$'){exit 0}
        if($Choice -match '^[1-6]$'){break}
        Write-Host '请输入 1–6 或 Q。' -ForegroundColor Yellow
    } while($true)
    $Loader=$Targets[[int]$Choice-1][0]
    $Minecraft=$Targets[[int]$Choice-1][1]
}
if($Minecraft -eq '26.1'){$Minecraft='26.1.2'}
$ProjectVersion=if($Minecraft -eq '26.1.2'){'26.1'}else{$Minecraft}
$Task=':'+ $Loader + ':' + $ProjectVersion + ':runClient'
$RunName=if($Loader -eq 'fabric' -and $Minecraft -eq '26.1.2'){'editor-mod-client'}else{'editor-'+$Loader+'-'+$Minecraft+'-client'}
$LaunchArgs=@($Task,'-PmcTest=false','--no-problems-report')
if($PlanOnly){
    [pscustomobject]@{loader=$Loader;minecraft=$Minecraft;task=$Task;runDirectory=(Join-Path $Workspace ('daily/'+(Get-Date -Format 'yyyy-MM-dd')+'/run/'+$RunName));arguments=$LaunchArgs} | ConvertTo-Json -Depth 3
    exit 0
}
$Bash=Join-Path $env:ProgramFiles 'Git/bin/bash.exe'
if(!(Test-Path $Bash)){$Bash=(Get-Command bash -ErrorAction Stop).Source}
foreach($Required in @($Assets,(Join-Path $Editor 'tools/gw.sh'))){if(!(Test-Path -LiteralPath $Required)){throw ('缺少文件：'+$Required)}}
# Oriel 版本和 Maven 来源由 Gradle 解析，开发入口不依赖历史独立整包。
$Day=(& $Bash (Join-Path $Workspace 'tools/new-day.sh')).Trim()
if($LASTEXITCODE -ne 0){throw '无法创建当天运行目录'}
if($Day -match '^/([a-zA-Z])/(.*)$'){$Day=$Matches[1].ToUpper()+':/'+$Matches[2]}
$Day=[IO.Path]::GetFullPath($Day)
$RunRoot=Join-Path $Day ('run/'+$RunName)
$Log=Join-Path $Day ('logs/editor-'+$Loader+'-'+$Minecraft+'-launch-'+(Get-Date -Format 'HHmmss')+'.log')
Write-Host ('启动方案：'+$Loader+' / Minecraft '+$Minecraft) -ForegroundColor Cyan
Write-Host ('运行目录：'+$RunRoot)
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
    if($env:EDITOR_LAUNCHER_DEBUG -eq '1'){$LaunchArgs+='-PeditorLauncherDebug=true'}
    $GameStarting=$false
    & $Bash 'tools/gw.sh' @LaunchArgs 2>&1 | ForEach-Object {
        # Windows PowerShell wraps native stderr in ErrorRecord, even for javac notes.
        # Forward its text, keep all diagnostics in the log, and use the native exit code below.
        $Line=$_.ToString()
        if(!$GameStarting -and $Line.Contains('> Task '+$Task)){$GameStarting=$true;Write-Host '[3/3] 游戏启动中：Minecraft 窗口即将打开。' -ForegroundColor Green}
        Write-Output $Line
    } | Tee-Object -FilePath $Log
    $Result=$LASTEXITCODE
}finally{Pop-Location}
if($Result -ne 0){Write-Host ('启动失败，退出码 '+$Result+'。日志：'+$Log) -ForegroundColor Red}
exit $Result
