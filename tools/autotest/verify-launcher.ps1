$ErrorActionPreference = 'Stop'
$Editor = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Day = Join-Path ([IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace/daily'))) (Get-Date -Format 'yyyy-MM-dd')
$Run = Join-Path $Day 'run/editor-mod-client'
if (Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -like '*Editor*' -and $_.CommandLine -like '*devlaunchinjector.Main*' }) {
    throw 'Editor 客户端正在运行；为避免打扰用户，本轮验证未启动。请先正常关闭已有客户端。'
}
$Jdk = Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Options = Join-Path $Run 'options.txt'
$OldOptions = if(Test-Path $Options) { [IO.File]::ReadAllBytes($Options) } else { $null }
$Lines = @()
if (Test-Path $Options) { $Lines = @(Get-Content $Options | Where-Object { $_ -notmatch '^(pauseOnLostFocus|fullscreen):' }) }
[IO.File]::WriteAllLines($Options, $Lines + @('pauseOnLostFocus:false','fullscreen:false'))
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class LauncherCheckWindow {
 public delegate bool Callback(IntPtr h, IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(Callback c, IntPtr p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after,int x,int y,int w,int height,uint f);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags);
 public struct Rect { public int Left,Top,Right,Bottom; }
 public static IntPtr Hide(int process) { IntPtr found=IntPtr.Zero; EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==process){SetWindowPos(h,IntPtr.Zero,-32000,-32000,0,0,0x0010|0x0004|0x0001);found=h;}return true;},IntPtr.Zero);return found; }
}
'@
Add-Type -AssemblyName System.Drawing
$env:EDITOR_LAUNCHER_DEBUG='1'
$Start = Get-Date
$PhasePath = Join-Path $Run 'launcher-debug-phase.txt'
if(Test-Path $PhasePath){Remove-Item -LiteralPath $PhasePath}
$Launcher = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + (Join-Path $Editor 'tools/preview/start.ps1') + '"')) -RedirectStandardOutput (Join-Path $Day 'logs/editor-launcher-verification.log') -RedirectStandardError (Join-Path $Day 'logs/editor-launcher-verification-error.log')
Remove-Item Env:EDITOR_LAUNCHER_DEBUG
$Debugger = Start-Process (Join-Path $Jdk 'java.exe') -WindowStyle Hidden -PassThru -ArgumentList @('--add-modules','jdk.jdi','-cp',(Join-Path $Day 'scratch/editor-mod/launcher-debugger'),'LauncherDebugger',$Run) -RedirectStandardOutput (Join-Path $Day 'logs/editor-launcher-debugger.log') -RedirectStandardError (Join-Path $Day 'logs/editor-launcher-debugger-error.log')
$Game = $null
$Captured = @{}
$Deadline = [DateTime]::UtcNow.AddMinutes(4)
try {
 while (!$Debugger.HasExited -or !$Launcher.HasExited) {
    if([DateTime]::UtcNow -gt $Deadline){throw '真实启动器验证超时'}
    if(!$Game){ $Game = Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CreationDate -ge $Start -and $_.CommandLine -like '*address=127.0.0.1:5007*' -and $_.CommandLine -like '*devlaunchinjector.Main*' } | Select-Object -First 1 }
    if($Game){
        $Handle=[LauncherCheckWindow]::Hide($Game.ProcessId)
        $PhaseFile=Join-Path $Run 'launcher-debug-phase.txt'
        if($Handle -ne [IntPtr]::Zero -and (Test-Path $PhaseFile)){
            $Phase=[IO.File]::ReadAllText($PhaseFile).Trim()
            if(!$Captured[$Phase]){
                $Rect=New-Object LauncherCheckWindow+Rect
                [void][LauncherCheckWindow]::GetWindowRect($Handle,[ref]$Rect)
                $Bitmap=[Drawing.Bitmap]::new($Rect.Right-$Rect.Left,$Rect.Bottom-$Rect.Top)
                $Graphics=[Drawing.Graphics]::FromImage($Bitmap); $Dc=$Graphics.GetHdc()
                [void][LauncherCheckWindow]::PrintWindow($Handle,$Dc,2);$Graphics.ReleaseHdc($Dc)
                $Out=Join-Path $Day ('screenshots/editor-launcher-'+$Phase+'.png')
                $Bitmap.Save($Out,[Drawing.Imaging.ImageFormat]::Png);$Graphics.Dispose();$Bitmap.Dispose();$Captured[$Phase]=$true
            }
        }
    }
    Start-Sleep -Milliseconds 100
 }
 if($Debugger.ExitCode -ne 0 -or $Launcher.ExitCode -ne 0){throw '真实启动器/外部调试验证失败，请看日志'}
 if(!$Captured['title'] -or !$Captured['page']){throw '缺少标题界面或页面截图'}
 Write-Output 'PASS real start.ps1 without CheckOnly; title and folder page; no probe in game'
} finally {
 if(!$Debugger.HasExited){$Debugger.Kill()}
 if($Game -and (Get-Process -Id $Game.ProcessId -ErrorAction SilentlyContinue)){Stop-Process -Id $Game.ProcessId}
 if(!$Launcher.HasExited){$Launcher.WaitForExit(5000)|Out-Null}
 if(!$Launcher.HasExited){$Launcher.Kill()}
 if($OldOptions){[IO.File]::WriteAllBytes($Options,$OldOptions)}
}
