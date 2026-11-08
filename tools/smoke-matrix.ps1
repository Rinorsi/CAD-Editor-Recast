param([string[]]$Targets=@('fabric:26.2','fabric:26.3','neoforge:26.1','neoforge:26.2','neoforge:26.3'),[string]$World)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Workspace=[IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Day=Get-Date -Format 'yyyy-MM-dd'
$Out=Join-Path $Workspace ('daily/'+$Day+'/logs/editor-smoke-'+(Get-Date -Format 'HHmmss'))
New-Item -ItemType Directory -Force $Out | Out-Null
if(!$World){$World=(Get-ChildItem ($Workspace+'/daily/*/run/editor-autotest-client/saves/Editor-release-test/level.dat') | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).Directory.FullName}
if(!(Test-Path -LiteralPath (Join-Path $World 'level.dat'))){throw 'Missing isolated baseline test world'}
$env:JAVA_HOME=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8'
$Results=@()
foreach($Target in $Targets){
    if($Target -notmatch '^(fabric|neoforge):26[.][123]$'){throw ('Invalid target '+$Target)}
    $Name=$Target.Replace(':','-')
    $Evidence=Join-Path $Out $Name
    $Run=Join-Path $Workspace ('daily/'+$Day+'/scratch/editor-smoke/'+[guid]::NewGuid().ToString('N')+'/'+$Name)
    New-Item -ItemType Directory -Force $Evidence,(Join-Path $Run 'saves') | Out-Null
    Copy-Item -LiteralPath $World -Destination (Join-Path $Run 'saves/MatrixSmoke') -Recurse
    [IO.File]::WriteAllLines((Join-Path $Run 'options.txt'),@('pauseOnLostFocus:false','fullscreen:false','overrideWidth:1280','overrideHeight:800','guiScale:2','narrator:0','soundCategory_master:0'),[Text.UTF8Encoding]::new($false))
    $Info=[Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$env:ComSpec
    $Info.Arguments='/d /s /c ""'+(Join-Path $Root 'gradlew.bat')+'" --console=plain --max-workers=2 --no-problems-report -PmcTest=false "-PeditorSmokeRun='+$Run+'" :'+$Target+':runClient"'
    $Info.WorkingDirectory=$Root;$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden'
    $Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Process=[Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync();$Stderr=$Process.StandardError.ReadToEndAsync()
    $TimedOut=$false
    $Deadline=[datetime]::UtcNow.AddMinutes(6)
    while(!$Process.WaitForExit(1000)){
        if([datetime]::UtcNow -gt $Deadline){$TimedOut=$true;break}
    }
    if($TimedOut){
        # Only descendants of this exact launcher; never enumerate-and-kill unrelated Java clients.
        $All=@(Get-CimInstance Win32_Process);$Ids=[Collections.Generic.List[int]]::new();$Ids.Add($Process.Id)
        for($i=0;$i -lt $Ids.Count;$i++){foreach($Child in $All | Where-Object {$_.ParentProcessId -eq $Ids[$i] -and $_.CommandLine -notmatch 'GradleDaemon|agent[.]jar'}){$Ids.Add([int]$Child.ProcessId)}}
        for($i=$Ids.Count-1;$i -ge 0;$i--){$Owned=Get-Process -Id $Ids[$i] -ErrorAction SilentlyContinue;if($Owned -and $Owned.StartTime -ge $Process.StartTime){$Owned.Kill()}}
        $Process.WaitForExit()
    }
    [IO.File]::WriteAllText((Join-Path $Evidence 'stdout.log'),$Stdout.GetAwaiter().GetResult())
    [IO.File]::WriteAllText((Join-Path $Evidence 'stderr.log'),$Stderr.GetAwaiter().GetResult())
    $ReceiptPath=Join-Path $Run 'matrix-smoke.json';$Receipt=$null
    if(Test-Path -LiteralPath $ReceiptPath){Copy-Item -LiteralPath $ReceiptPath -Destination $Evidence;$Receipt=Get-Content -LiteralPath $ReceiptPath -Raw | ConvertFrom-Json}
    $Result=[ordered]@{target=$Target;status=if(!$TimedOut -and $Process.ExitCode -eq 0 -and $Receipt.status -eq 'PASSED'){'PASSED'}else{'FAILED'};exitCode=$Process.ExitCode;timeout=$TimedOut;run=$Run;evidence=$Evidence}
    $Results+=$Result;$Results | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Out 'results.json')
    Write-Output ($Target+' '+$Result.status+' '+$Evidence)
}
if(@($Results | Where-Object {$_.status -ne 'PASSED'}).Count){exit 1}
