param([ValidateSet('server','edit','vanilla','live')][string]$Mode='server', [switch]$AssetsRoot)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw '请用 PowerShell 7 执行静默自测。'}
$Editor=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$EditorVersion=((Get-Content (Join-Path $Editor 'gradle.properties') | Where-Object { $_ -match '^version=' }) -split '=',2)[1].Trim()
$Day=Join-Path ([IO.Path]::GetFullPath((Join-Path $Editor '../Oriel-UI-Workspace/daily'))) (Get-Date -Format 'yyyy-MM-dd')
$Build=Join-Path $Day 'scratch/editor-mod/build/fabric-26.1.2/libs'
$RunName=if($Mode -eq 'server'){'editor-ds-server'}elseif($Mode -eq 'live'){if($AssetsRoot){'editor-ds-assets'}else{'editor-ds-namespace'}}else{'editor-ds-client'}
$Run=Join-Path $Day ('run/'+$RunName)
$Mods=Join-Path $Run 'mods'
$Java=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin/java.exe'
$Cache=Join-Path $env:USERPROFILE '.gradle/caches/fabric-loom'
$Minecraft=Join-Path $Cache '26.1.2/minecraft-merged.jar'
$Runtime=@((Get-Content (Join-Path $Day 'scratch/editor-mod/runtime-classpath.json') | ConvertFrom-Json) | ForEach-Object {$_.Replace([char]92,[char]47)})
$FabricApi=$Runtime | Where-Object {$_ -match 'net.fabricmc.fabric-api/fabric-api/'} | Select-Object -First 1
$Classpath=@($Runtime | Where-Object {$_ -notmatch '/Editor/libs/|net.fabricmc.fabric-api/'})
New-Item -ItemType Directory -Force -Path $Mods | Out-Null
Copy-Item -LiteralPath $FabricApi -Destination $Mods -Force
foreach($Name in @('oriel-fabric-26.1.2-0.11.0.jar','cadeditor-fabric-26.1.2-0.99.2.jar')){
    if($Mode -eq 'vanilla'){
        $Installed=Join-Path $Mods $Name
        if(Test-Path $Installed){$Backup=Join-Path $Run 'uninstalled-mods';New-Item -ItemType Directory -Force -Path $Backup | Out-Null;Move-Item -LiteralPath $Installed -Destination $Backup -Force}
    }else{
        $From=if($Name.StartsWith('oriel-')){Join-Path $Editor ('libs/'+$Name)}else{Join-Path $Build $Name}
        Copy-Item -LiteralPath $From -Destination $Mods -Force
    }
}
$Jvm=@('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Dfabric.development=false','-Dfabric.defaultModDistributionNamespace=official',('-Dfabric.gameJarPath='+$Minecraft),'-Dfabric.gameVersion=26.1.2','-cp',($Classpath -join ';'))
$CssProbe="`n/* editor-live-test-begin */`n#ed-live-css { width: 31px; height: 1px; }`n/* editor-live-test-end */`n"
$JsProbe="`n/* editor-live-test-begin */`nvar EDITOR_LIVE_JS_PROBE = 'ready';`n/* editor-live-test-end */`n"
$CssTouched=$false;$JsTouched=$false
$Jvm=@('-Dcadeditor.vault.dir='+$Run+'/test-vault')+$Jvm
if($Mode -eq 'server'){
    $Jvm+=('-Dlog4j.configurationFile='+(Join-Path $PSScriptRoot 'log4j2.xml'))
    [IO.File]::WriteAllText((Join-Path $Run 'eula.txt'),'eula=true')
    [IO.File]::WriteAllText((Join-Path $Run 'server.properties'),"online-mode=false`nserver-ip=127.0.0.1`nserver-port=25577`nview-distance=2`nsimulation-distance=2`nspawn-protection=0`nmax-players=1`nlevel-name=editor-server-smoke`n")
    $Jvm+=@('net.fabricmc.loader.impl.launch.knot.KnotServer','nogui')
}else{
    if(!(Test-Path (Join-Path $Run 'saves/Editor-release-test/level.dat'))){
        New-Item -ItemType Directory -Force -Path (Join-Path $Run 'saves') | Out-Null
        $Fixture=Get-ChildItem (Join-Path $Editor '../Oriel-UI-Workspace/daily/*/run/editor-autotest-client/saves/Editor-release-test/level.dat') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
        if(!$Fixture){throw '缺少独立测试世界 Editor-release-test；请按 docs/TESTING.md 准备。'}
        Copy-Item -LiteralPath $Fixture.Directory.FullName -Destination (Join-Path $Run 'saves') -Recurse
    }
    Copy-Item -LiteralPath (Join-Path $Day ('scratch/editor-mod/autotest-only/editor-backend-probe-'+$EditorVersion+'.jar')) -Destination $Mods -Force
    if($Mode -eq 'live'){
        $NsRoot=Join-Path $Day ('scratch/editor-mod/'+$RunName+'-sources/assets/cadeditor')
        $Source=Join-Path $NsRoot 'ui'
        New-Item -ItemType Directory -Force -Path $Source,(Join-Path $Run 'config/oriel') | Out-Null
        Copy-Item -Path (Join-Path $Editor 'common/src/main/resources/assets/cadeditor/ui/*') -Destination $Source -Recurse -Force
        $Mapped=if($AssetsRoot){Split-Path $NsRoot -Parent}else{$NsRoot}
        [IO.File]::WriteAllText((Join-Path $Run 'config/oriel/dev-sources.properties'),('editor='+$Mapped.Replace([char]92,[char]47)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
        $PhasePath=Join-Path $Run 'editor-live-phase.txt'
        if(Test-Path $PhasePath){[IO.File]::Delete($PhasePath)}
    }
    $Options=Join-Path $Run 'options.txt';$Lines=@()
    if(Test-Path $Options){$Lines=@(Get-Content $Options | Where-Object {$_ -notmatch '^(pauseOnLostFocus|fullscreen|overrideWidth|overrideHeight|guiScale|narrator):'})}
    [IO.File]::WriteAllLines($Options,$Lines+@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:960','overrideHeight:640','guiScale:2','narrator:0'))
    $Jvm+=@(('-Deditor.autotest='+$Mode),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username','Player13','--accessToken','0','--version','26.1.2','--gameDir',$Run,'--assetsDir',(Join-Path $Cache 'assets'),'--assetIndex','26.1.2-30','--quickPlaySingleplayer','Editor-release-test')
    Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;
public static class EditorTestWindow {
public delegate bool Callback(IntPtr h,IntPtr p);
[DllImport("user32.dll")]public static extern bool EnumWindows(Callback c,IntPtr p);
[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
public static void HideWithoutActivation(int process){EnumWindows((h,p)=>{uint owner;GetWindowThreadProcessId(h,out owner);if(owner==process)SetWindowPos(h,IntPtr.Zero,-32000,-32000,0,0,0x0010|0x0004|0x0001);return true;},IntPtr.Zero);}}
'
}
$ArgsFile=Join-Path $Day ('scratch/editor-mod/'+$RunName+'-'+$Mode+'-java.args')
$Escaped=$Jvm | ForEach-Object {'"'+$_.Replace('\','\\').Replace('"','\"')+'"'}
[IO.File]::WriteAllLines($ArgsFile,$Escaped,[Text.UTF8Encoding]::new($false))
$Info=[Diagnostics.ProcessStartInfo]::new();$Info.FileName=$Java;$Info.Arguments='"@'+$ArgsFile+'"';$Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true;$Info.RedirectStandardInput=$true;$Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
$StartedAt=[DateTime]::UtcNow;$Process=[Diagnostics.Process]::Start($Info)
$Stdout=$Process.StandardOutput.ReadToEndAsync();$Stderr=$Process.StandardError.ReadToEndAsync();$Deadline=[DateTime]::UtcNow.AddMinutes(5);$Stopped=$false
$Log=Join-Path $Day ('logs/'+$RunName+'-'+$Mode+'.log')
try{
    while(!$Process.HasExited){
        if([DateTime]::UtcNow -gt $Deadline){throw '自测超时；只停止本次测试进程。'}
        if($Mode -ne 'server'){[EditorTestWindow]::HideWithoutActivation($Process.Id)}
        if($Mode -eq 'live' -and (Test-Path $PhasePath)){
            $Phase=[IO.File]::ReadAllText($PhasePath).Trim()
            if($Phase -eq 'css' -and !$CssTouched){[IO.File]::AppendAllText((Join-Path $Source 'editor.css'),$CssProbe,[Text.UTF8Encoding]::new($false));$CssTouched=$true}
            if($Phase -eq 'js' -and !$JsTouched){[IO.File]::AppendAllText((Join-Path $Source 'js/app.js'),$JsProbe,[Text.UTF8Encoding]::new($false));$JsTouched=$true}
        }
        if($Mode -eq 'server' -and !$Stopped){
            $Latest=Join-Path $Run 'logs/latest.log'
            if((Test-Path $Latest) -and (Get-Item $Latest).LastWriteTimeUtc -ge $StartedAt -and (Select-String -LiteralPath $Latest -Pattern 'Done \(' -Quiet)){$Process.StandardInput.WriteLine('stop');$Process.StandardInput.Flush();$Stopped=$true}
        }
        Start-Sleep -Milliseconds 100
    }
    $ExitCode=$Process.ExitCode
}finally{
    if(!$Process.HasExited){$Process.Kill();$Process.WaitForExit()}
    foreach($Probe in @(@{Touched=$CssTouched;Path=(Join-Path $(if($Source){$Source}else{$Run}) 'editor.css');Suffix=$CssProbe},@{Touched=$JsTouched;Path=(Join-Path $(if($Source){$Source}else{$Run}) 'js/app.js');Suffix=$JsProbe})){
        if($Probe.Touched){$Current=[IO.File]::ReadAllText($Probe.Path);if(!$Current.Contains($Probe.Suffix)){throw '测试标记被修改，请核对独立测试副本'};[IO.File]::WriteAllText($Probe.Path,$Current.Replace($Probe.Suffix,''),[Text.UTF8Encoding]::new($false))}
    }
    [IO.File]::WriteAllText($Log,$Stdout.Result+"`nSTDERR:`n"+$Stderr.Result);$Process.Dispose()
}
if($ExitCode -ne 0){throw ('自测退出码 '+$ExitCode+'，日志：'+$Log)}
if($Mode -eq 'server'){if(!$Stopped){throw '服务端未完成启动'}}else{
    $ResultPath=Join-Path $Run ('editor-autotest-'+$Mode+'.json')
    if(!(Test-Path $ResultPath) -or (Get-Item $ResultPath).LastWriteTimeUtc -lt $StartedAt){throw ('缺少本轮回执，日志：'+$Log)}
    if((Get-Content $ResultPath | ConvertFrom-Json).status -ne 'PASSED'){throw ('断言失败，日志：'+$Log)}
}
Write-Output ('PASS '+$Mode+'，日志：'+$Log)
