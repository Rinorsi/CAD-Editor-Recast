param([ValidateSet('server','edit','vanilla','live')][string]$Mode = 'server', [switch]$DevPage, [switch]$NativeSource, [switch]$ConfigUi, [switch]$BadConfigUi)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '此静默自测脚本需要 PowerShell 7，请用 pwsh -NoProfile -File tools/autotest/run.ps1。' }
$Editor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Day = Join-Path ([IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace/daily'))) (Get-Date -Format 'yyyy-MM-dd')
$Build = Join-Path $Day 'scratch/editor-mod/build/fabric-26.1.2/libs'
$Run = Join-Path $Day $(if ($Mode -eq 'server') { 'run/editor-011-server' } elseif ($Mode -eq 'live') { 'run/editor-011-live' } else { 'run/editor-011-client' })
if ($DevPage) {
    if ($Mode -ne 'edit') { throw 'DevPage 仅配合 edit 模式' }
    $Run = Join-Path $Day 'run/editor-011-devpage'
}
if ($NativeSource) {
    if ($Mode -ne 'edit' -or $DevPage) { throw 'NativeSource 仅配合 edit，不能与 DevPage 同用' }
    $Run = Join-Path $Day 'run/editor-011-native'
}
if ($ConfigUi -or $BadConfigUi) {
    if ($Mode -ne 'edit' -or $NativeSource -or $DevPage -or ($ConfigUi -and $BadConfigUi)) { throw '配置测试仅配合 edit，开关不能组合' }
    $Run = Join-Path $Day $(if($BadConfigUi){'run/editor-config-bad'}else{'run/editor-config-ui'})
}
$Mods = Join-Path $Run 'mods'
$WatchScript = Join-Path $Editor 'tools/preview/watch-sync.ps1'
$Source = Join-Path $Editor 'fabric/src/main/resources/assets/cadeditor/ui'
if ($Mode -eq 'live' -or $DevPage -or $NativeSource -or $ConfigUi) {
    $SourceRoot = Join-Path $Day ('scratch/editor-mod/' + (Split-Path $Run -Leaf) + '-sources')
    $Snapshot = Join-Path $SourceRoot 'src/main/resources/assets/cadeditor/ui'
    New-Item -ItemType Directory -Force -Path $Snapshot | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Snapshot -Recurse -Force
    $Source = $Snapshot
}
$Fixture = Join-Path $Editor 'tools/preview/preview-stack.js'
$Page = Join-Path $Run 'config/oriel/my-pages/item-editor'
$WatchLog = Join-Path $Day ('logs/' + (Split-Path $Run -Leaf) + '-watch.log')
$Watcher = $null
$CssProbe = "`n/* editor-live-test-begin */`n#ed-live-css { width: 31px; height: 1px; }`n/* editor-live-test-end */`n"
$JsProbe = "`n/* editor-live-test-begin */`nvar EDITOR_LIVE_JS_PROBE = 'ready';`n/* editor-live-test-end */`n"
$CssTouched = $false
$JsTouched = $false
$Java = Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin/java.exe'
$Cache = Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
$Minecraft = Join-Path $Cache '26.1.2/minecraft-merged.jar'
$Runtime = @((Get-Content (Join-Path $Day 'scratch/editor-mod/runtime-classpath.json') | ConvertFrom-Json) | ForEach-Object { $_.Replace([char]92, [char]47) })
$FabricApi = $Runtime | Where-Object { $_ -match 'net.fabricmc.fabric-api/fabric-api/' } | Select-Object -First 1
$Classpath = @($Runtime | Where-Object { $_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api/' })
New-Item -ItemType Directory -Force -Path $Mods | Out-Null
Copy-Item -LiteralPath $FabricApi -Destination $Mods -Force
if ($Mode -eq 'vanilla') {
    # Only these two exact test-install paths are removed; the original libs/build jars remain.
    foreach ($Name in @('oriel-fabric-26.1.2-0.11.0.jar','cadeditor-fabric-26.1.2-0.99.2.jar')) {
        $Installed = Join-Path $Mods $Name
        if (Test-Path -LiteralPath $Installed) {
            $Uninstalled = Join-Path $Run 'uninstalled-mods'
            New-Item -ItemType Directory -Force -Path $Uninstalled | Out-Null
            Move-Item -LiteralPath $Installed -Destination $Uninstalled -Force
        }
    }
} else {
    Copy-Item -LiteralPath (Join-Path $Editor 'libs/oriel-fabric-26.1.2-0.11.0.jar') -Destination $Mods -Force
    Copy-Item -LiteralPath (Join-Path $Build 'cadeditor-fabric-26.1.2-0.99.2.jar') -Destination $Mods -Force
}
$Jvm = @('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath=' + $Minecraft),'-Dfabric.gameVersion=26.1.2','-cp',($Classpath -join ';'))
if ($Mode -eq 'server') {
    $Jvm += ('-Dlog4j.configurationFile=' + (Join-Path $PSScriptRoot 'log4j2.xml'))
    [IO.File]::WriteAllText((Join-Path $Run 'eula.txt'), 'eula=true')
    [IO.File]::WriteAllText((Join-Path $Run 'server.properties'), "online-mode=false`nserver-ip=127.0.0.1`nserver-port=25576`nview-distance=2`nsimulation-distance=2`nspawn-protection=0`nmax-players=1`nlevel-name=editor-server-smoke`n")
    $Jvm += @('net.fabricmc.loader.impl.launch.knot.KnotServer','nogui')
} else {
    if (!(Test-Path (Join-Path $Run 'saves/Editor-release-test/level.dat'))) {
        New-Item -ItemType Directory -Force -Path (Join-Path $Run 'saves') | Out-Null
        $WorldSource = 'run/editor-autotest-client/saves/Editor-release-test'
        Copy-Item -LiteralPath (Join-Path $Day $WorldSource) -Destination (Join-Path $Run 'saves') -Recurse
    }
    if (!$ConfigUi -and !$BadConfigUi) { & $WatchScript -Source $Source -Destination $Page -Fixture $Fixture -Log $WatchLog -Once }
    Copy-Item -LiteralPath (Join-Path $Day 'scratch/editor-mod/autotest-only/editor-backend-probe-0.1.0.jar') -Destination $Mods -Force
    if ($Mode -eq 'live' -or $DevPage -or $NativeSource -or $ConfigUi) {
        if (!$ConfigUi) { & $WatchScript -Source $Source -Destination $Page -Fixture $Fixture -Log $WatchLog -Once }
        $PhasePath = Join-Path $Run 'editor-live-phase.txt'
        if (Test-Path $PhasePath) { [IO.File]::Delete($PhasePath) }
    }
    $Options = Join-Path $Run 'options.txt'
    $Lines = @()
    if (Test-Path $Options) { $Lines = @(Get-Content $Options | Where-Object { $_ -notmatch '^(pauseOnLostFocus|fullscreen|overrideWidth|overrideHeight|guiScale|narrator):' }) }
    $Lines += @('pauseOnLostFocus:false','fullscreen:false','overrideWidth:960','overrideHeight:640','guiScale:2','narrator:0')
    [IO.File]::WriteAllLines($Options, $Lines)
    if ($DevPage) { $Jvm += '-Deditor.devPage=true' }
    if ($NativeSource) {
        $Jvm = @($Jvm | Where-Object { $_ -ne '-Dfabric.development=false' })
        $Jvm += @('-Dfabric.development=true', '-Deditor.nativeSourceTest=true', ('-Doriel.sourceRoot=' + $SourceRoot))
    }
    if ($ConfigUi -or $BadConfigUi) {
        New-Item -ItemType Directory -Force -Path (Join-Path $Run 'config') | Out-Null
        $ConfiguredSource = if ($BadConfigUi) { Join-Path $Run 'nonexistent-ui-directory' } else { $Source }
        @{devUiDir=$ConfiguredSource} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Run 'config/editor-dev.json') -Encoding utf8NoBOM
        $Jvm += $(if($BadConfigUi){'-Deditor.badConfigTest=true'}else{'-Deditor.configUiTest=true'})
    }
    $Jvm += @(('-Deditor.autotest=' + $Mode),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',(Join-Path $Cache 'assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
    # Position only. No activation, foreground changes, keyboard, pointer, or OS input calls.
    Add-Type @'
using System; using System.Runtime.InteropServices;
public static class EditorTestWindow {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x,int y,int w,int height,uint flags);
 public static void HideWithoutActivation(int process) { EnumWindows((h,p) => { uint owner; GetWindowThreadProcessId(h,out owner); if(owner==process) SetWindowPos(h,IntPtr.Zero,-32000,-32000,0,0,0x0010|0x0004|0x0001); return true; },IntPtr.Zero); }
}
'@
}
$ArgsFile = Join-Path $Day ('scratch/editor-mod/' + (Split-Path $Run -Leaf) + '-' + $Mode + '-java.args')
$Escaped = $Jvm | ForEach-Object { '"' + $_.Replace('\','\\').Replace('"','\"') + '"' }
[IO.File]::WriteAllLines($ArgsFile, $Escaped, [Text.UTF8Encoding]::new($false))
$Info = [Diagnostics.ProcessStartInfo]::new()
$Info.FileName = $Java
$Info.Arguments = '"@' + $ArgsFile + '"'
$Info.WorkingDirectory = $Run
$Info.UseShellExecute = $false
$Info.CreateNoWindow = $true
$Info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput = $true
$Info.RedirectStandardError = $true
$Info.RedirectStandardInput = $true
$Info.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
$StartedAt = [DateTime]::UtcNow
$Process = [Diagnostics.Process]::Start($Info)
if ($Mode -eq 'live' -or $DevPage) {
    $WatcherArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $WatchScript + '"'), '-Source', ('"' + $Source + '"'), '-Destination', ('"' + $Page + '"'), '-Fixture', ('"' + $Fixture + '"'), '-Log', ('"' + $WatchLog + '"'), '-ParentProcessId', $Process.Id)
    $Watcher = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList $WatcherArgs
}
$Stdout = $Process.StandardOutput.ReadToEndAsync()
$Stderr = $Process.StandardError.ReadToEndAsync()
$Deadline = [DateTime]::UtcNow.AddMinutes(5)
$Stopped = $false
$Log = Join-Path $Day ('logs/' + (Split-Path $Run -Leaf) + '-' + $Mode + '.log')
try {
    while (!$Process.HasExited) {
        if ([DateTime]::UtcNow -gt $Deadline) { throw '自测超过 5 分钟，停止本次测试进程。' }
        if ($Mode -ne 'server') { [EditorTestWindow]::HideWithoutActivation($Process.Id) }
        if (($Mode -eq 'live' -or $DevPage -or $NativeSource -or $ConfigUi) -and (Test-Path $PhasePath)) {
            $Phase = [IO.File]::ReadAllText($PhasePath).Trim()
            if ($Phase -eq 'css' -and !$CssTouched) {
                [IO.File]::AppendAllText((Join-Path $Source 'editor.css'), $CssProbe, [Text.UTF8Encoding]::new($false)); $CssTouched = $true
            }
            if ($Phase -eq 'js' -and !$JsTouched) {
                [IO.File]::AppendAllText((Join-Path $Source 'js/app.js'), $JsProbe, [Text.UTF8Encoding]::new($false)); $JsTouched = $true
            }
        }
        if ($Mode -eq 'server' -and !$Stopped) {
            $Latest = Join-Path $Run 'logs/latest.log'
            if ((Test-Path $Latest) -and (Get-Item $Latest).LastWriteTimeUtc -ge $StartedAt -and (Select-String -LiteralPath $Latest -Pattern 'Done \(' -Quiet)) {
                $StopBytes = [Text.Encoding]::ASCII.GetBytes("stop`n")
                $Process.StandardInput.BaseStream.Write($StopBytes, 0, $StopBytes.Length)
                $Process.StandardInput.BaseStream.Flush()
                $Stopped = $true
            }
        }
        Start-Sleep -Milliseconds 100
    }
    $ExitCode = $Process.ExitCode
} finally {
    if (!$Process.HasExited) { $Process.Kill(); $Process.WaitForExit() }
    if ($Watcher) {
        if (!$Watcher.WaitForExit(5000)) { $Watcher.Kill(); throw '同步监视器未随游戏退出，已停止测试监视器' }
        if ($Watcher.ExitCode -ne 0) { throw ('同步监视器失败，日志：' + $WatchLog) }
    }
    # Remove only our exact suffix, preserving unrelated concurrent UI edits.
    foreach ($Probe in @(@{Touched=$CssTouched;Path=(Join-Path $Source 'editor.css');Suffix=$CssProbe}, @{Touched=$JsTouched;Path=(Join-Path $Source 'js/app.js');Suffix=$JsProbe})) {
        if ($Probe.Touched) {
            $Current = [IO.File]::ReadAllText($Probe.Path)
            if (!$Current.Contains($Probe.Suffix)) { throw '测试标记被并发修改，请人工核对源文件' }
            [IO.File]::WriteAllText($Probe.Path, $Current.Replace($Probe.Suffix, ''), [Text.UTF8Encoding]::new($false))
        }
    }
    if ($Mode -eq 'live' -or $DevPage -or $NativeSource) { & $WatchScript -Source $Source -Destination $Page -Fixture $Fixture -Log $WatchLog -Once }
    [IO.File]::WriteAllText($Log, $Stdout.Result + "`nSTDERR:`n" + $Stderr.Result)
    $Process.Dispose()
}
if ($ExitCode -ne 0) { throw ('自测退出码 ' + $ExitCode + '，日志：' + $Log) }
if ($Mode -eq 'server') {
    if (!$Stopped) { throw ('专用服务端未完成启动，日志：' + $Log) }
} else {
    $ResultPath = Join-Path $Run ('editor-autotest-' + $Mode + '.json')
    if (!(Test-Path $ResultPath) -or (Get-Item $ResultPath).LastWriteTimeUtc -lt $StartedAt) { throw ('未生成本轮自测回执，日志：' + $Log) }
    $Result = Get-Content $ResultPath | ConvertFrom-Json
    if ($Result.status -ne 'PASSED') { throw ('自测断言失败，日志：' + $Log) }
}
Write-Output ('PASS ' + $Mode + '，日志：' + $Log)
