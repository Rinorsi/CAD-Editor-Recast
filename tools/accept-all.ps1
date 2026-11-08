param(
    [switch]$Quick,
    [switch]$Full,
    [switch]$SkipGame,
    [switch]$FailFast,
    [switch]$WhatIf,
    [ValidateSet('ui','java','world','accept','smoke','effects','pages')][string]$Only
)
$ErrorActionPreference = 'Stop'
if ($Quick -and $Full) { throw '-Quick and -Full are mutually exclusive' }
$Tier = if ($Full) { 'full' } else { 'quick' }
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $Root
$Out = Join-Path $Root ('logs/accept-all/' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$Build = [IO.Path]::GetFullPath((Join-Path $Root ('../Oriel-UI-Workspace/daily/' + (Get-Date -Format 'yyyy-MM-dd') + '/scratch/editor-mod/build/fabric-26.1.2')))
$Stages = @(
    @{id='ui'; seconds=600; game=$false},
    @{id='java'; seconds=3600; game=$false},
    @{id='world'; seconds=1200; game=$true},
    @{id='accept'; seconds=2400; game=$true},
    @{id='smoke'; seconds=2400; game=$true},
    @{id='effects'; seconds=1800; game=$true},
    @{id='pages'; seconds=1800; game=$true}
)
function Get-UiScripts {
    Get-ChildItem (Join-Path $Root 'tools/ui-*.cjs') | Sort-Object @{Expression={ if ($_.BaseName -eq 'ui-lint') { 2 } elseif ($_.BaseName -eq 'ui-snapshot') { 1 } else { 0 } }}, Name
}
function Get-Commands([string]$Id) {
    switch ($Id) {
        ui {
            Get-UiScripts | ForEach-Object { 'node tools/' + $_.Name }
            Get-ChildItem (Join-Path $Root 'fabric/src/main/resources/assets/cadeditor/ui/js/*.js') | Sort-Object Name | ForEach-Object { 'node --check "' + $_.FullName + '"' }
        }
        java {
            'gradlew.bat --console=plain --max-workers=2 -PmcTest=false :fabric:26.1.2:build'
            'gradlew.bat --console=plain --max-workers=2 -PmcTest=false :fabric:26.1.2:check --rerun-tasks :fabric:26.1.2:autotestClasses :fabric:26.1.2:exportAutotestClasspath'
            'Inspect current release jar: gradle.properties version; no test/probe/evidence entries (including nested jars)'
        }
        world { 'pwsh -NoProfile -File tools/live-test/world-gates.ps1 -EvidenceRoot "' + $Out + '/world" -BuildDirectory "' + $Build + '"' }
        accept { 'pwsh -NoProfile -File tools/accept/run.ps1 -EvidenceRoot "' + $Out + '/accept"' }
        smoke { 'pwsh -NoProfile -File tools/live-test/run.ps1 -EvidenceRoot "' + $Out + '/smoke"' }
        effects { 'pwsh -NoProfile -File tools/live-test/effects.ps1 -Tier quick -EvidenceRoot "' + $Out + '/effects"' }
        pages { 'pwsh -NoProfile -File tools/live-test/pages.ps1 -EvidenceRoot "' + $Out + '/pages"' }
    }
}
if ($WhatIf) {
    Write-Output ('WHATIF tier=' + $Tier + '; no commands, process checks, locks or reports will be executed/written')
    Write-Output 'Safety: check user Minecraft at start and before each game stage; sticky SKIP all game stages if found. Never kill preexisting Java; reuse silent launchers.'
    foreach ($Stage in $Stages) {
        $Reason = if ($Only -and $Stage.id -ne $Only) { '-Only ' + $Only } elseif ($Stage.game -and $SkipGame) { '-SkipGame' } elseif ($Stage.id -eq 'accept' -and !$Full) { 'requires -Full' } elseif ($Stage.id -eq 'effects' -and !(Test-Path tools/live-test/effects.ps1)) { 'script not yet provided' }
        Write-Output ($Stage.id + ' [' + $(if ($Reason) { 'SKIP: ' + $Reason } else { 'RUN' }) + '] timeout=' + $Stage.seconds + 's')
        Get-Commands $Stage.id | ForEach-Object { Write-Output ('  ' + $_) }
    }
    Write-Output ('Reports: ' + $Out + '/report.md and report.json')
    exit 0
}
New-Item -ItemType Directory -Path $Out | Out-Null
$Results = [Collections.Generic.List[object]]::new()
$Blocked = $null
$Stopped = $false
function Test-UserGame {
    # Read argument files too: Java launchers commonly hide KnotClient behind @java.args.
    $Games = @(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {
        $Command = $_.CommandLine
        if ($Command -match 'agent[.]jar|GradleDaemon') { return $false }
        foreach ($Match in [regex]::Matches($Command, '"@([^"]+)"|@"([^"]+)"|@([^\s]+)')) {
            $ArgPath = @($Match.Groups[1].Value, $Match.Groups[2].Value, $Match.Groups[3].Value) | Where-Object { $_ } | Select-Object -First 1
            if (Test-Path -LiteralPath $ArgPath -PathType Leaf) { $Command += ' ' + (Get-Content -LiteralPath $ArgPath -Raw) }
        }
        $Command -notmatch 'agent[.]jar|GradleDaemon' -and $Command -match 'KnotClient|runClient|net[.]minecraft[.]client[.]main[.]Main'
    })
    if ($Games.Count) {
        $Games | Select-Object ProcessId, CommandLine | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Out 'blocked-processes.json')
        $script:Blocked = 'User Minecraft detected (PID ' + ($Games.ProcessId -join ',') + '); all game stages skipped; no existing process touched'
    }
}
function Stop-OwnedTree([Diagnostics.Process]$Process) {
    if ($Process.HasExited) { return }
    # Snapshot descendants of this exact launch only. Never stop a global java/javaw list,
    # and leave Cindy and Gradle daemons alone even if spawned during this invocation.
    $All = @(Get-CimInstance Win32_Process)
    $Ids = [Collections.Generic.List[int]]::new()
    $Ids.Add($Process.Id)
    for ($i=0; $i -lt $Ids.Count; $i++) {
        foreach ($Child in $All | Where-Object { $_.ParentProcessId -eq $Ids[$i] -and $_.CommandLine -notmatch 'agent[.]jar|GradleDaemon' }) {
            if (!$Ids.Contains([int]$Child.ProcessId)) { $Ids.Add([int]$Child.ProcessId) }
        }
    }
    for ($i=$Ids.Count-1; $i -ge 0; $i--) {
        $Candidate = Get-Process -Id $Ids[$i] -ErrorAction SilentlyContinue
        if ($Candidate -and $Candidate.StartTime -ge $Process.StartTime) { $Candidate.Kill() }
    }
}
function Invoke-CommandLog([string]$Exe, [string[]]$Arguments, [string]$Log) {
    $Remaining = [int][math]::Floor(($script:Deadline - [datetime]::UtcNow).TotalSeconds)
    if ($Remaining -le 0) { throw 'Stage timeout' }
    $Info = [Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$Exe; $Info.WorkingDirectory=$Root
    $Info.UseShellExecute=$false; $Info.CreateNoWindow=$true
    $Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
    if ($Exe -eq $env:ComSpec) { $Info.Arguments=$Arguments -join ' ' }
    else { foreach ($Argument in $Arguments) { $Info.ArgumentList.Add($Argument) } }
    $Process = [Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync(); $Stderr=$Process.StandardError.ReadToEndAsync()
    try {
        if (!$Process.WaitForExit($Remaining * 1000)) { Stop-OwnedTree $Process; throw ('Stage timeout: ' + $Exe) }
        if ($Process.ExitCode -ne 0) {
            $Failure=[Exception]::new('Exit ' + $Process.ExitCode + ': ' + $Exe + '; see ' + $Log)
            $Failure.Data['exitCode']=$Process.ExitCode
            throw $Failure
        }
    } finally {
        if (!$Process.HasExited) { Stop-OwnedTree $Process }
        # A surviving shared daemon must not make output collection wait forever.
        if ($Stdout.Wait(5000) -and $Stderr.Wait(5000)) { [IO.File]::WriteAllText($Log, $Stdout.Result + [Environment]::NewLine + $Stderr.Result) }
        else { [IO.File]::WriteAllText($Log, 'Output pipes did not close after owned launcher exit.') }
        $Process.Dispose()
    }
}
function Assert-CleanArchive([IO.Compression.ZipArchive]$Archive, [string]$Label) {
    foreach ($Entry in $Archive.Entries) {
        if ($Entry.FullName -match '(?i)mctest|autotest|livetest|probe|acceptance|evidence|(^|/)[^/]*receipt[^/]*\.(json|jsonl|md|txt)$|screenshots|(^|/)(logs|daily|testFixtures|codecVerification)(/|$)|\.(log|args|jsonl|hprof|jfr)$|(^|/)(report\.(json|md)|page-(request|response)\.(json|tmp)|owned-[^/]+|captured-[^/]+)|探针|证据') {
            throw ('Forbidden release entry: ' + $Label + '!/' + $Entry.FullName)
        }
        if ($Entry.FullName -match '(?i)\.(json|mf)$') {
            $Reader = [IO.StreamReader]::new($Entry.Open())
            try { $Text=$Reader.ReadToEnd() } finally { $Reader.Dispose() }
            if ($Text -match '(?i)mctest|autotest|livetest|dev[./]rinorsi[./]editor[./].*probe') { throw ('Test reference in release metadata: ' + $Entry.FullName) }
        }
        if ($Entry.FullName -match '(?i)\.jar$') {
            $Stream = [IO.MemoryStream]::new()
            $Source=$Entry.Open()
            try { $Source.CopyTo($Stream); $Stream.Position=0; $Nested=[IO.Compression.ZipArchive]::new($Stream, 'Read', $true)
                try { Assert-CleanArchive $Nested ($Label + '!/' + $Entry.FullName) } finally { $Nested.Dispose() }
            } finally { $Source.Dispose(); $Stream.Dispose() }
        }
    }
}
function Invoke-JavaStage([string]$Evidence) {
    $Lock=Join-Path $Root 'logs/.gradle.lock.d'
    $Held=$false
    $Token=[guid]::NewGuid().ToString('N')
    $OwnerFile=Join-Path $Lock ('accept-all-' + $Token + '.owner')
    try {
        $WaitUntil=[datetime]::UtcNow.AddMinutes(20)
        while (!$Held) {
            if ([datetime]::UtcNow -ge $WaitUntil -or [datetime]::UtcNow -ge $script:Deadline) { throw 'Gradle lock wait timed out; existing lock left untouched' }
            try { New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null; $Held=$true }
            catch { if (!(Test-Path -LiteralPath $Lock)) { throw }; Start-Sleep -Seconds 2 }
        }
        [IO.File]::WriteAllText($OwnerFile, $Token)
        foreach ($Task in @('build','check')) {
            $Tasks = if ($Task -eq 'build') { ':fabric:26.1.2:build' } else { ':fabric:26.1.2:check --rerun-tasks :fabric:26.1.2:autotestClasses :fabric:26.1.2:exportAutotestClasspath' }
            Invoke-CommandLog $env:ComSpec @('/d','/s','/c', ('""' + (Join-Path $Root 'gradlew.bat') + '" --console=plain --max-workers=2 -PmcTest=false ' + $Tasks + '"')) (Join-Path $Evidence ($Task + '.log'))
        }
        $VersionLine = Get-Content (Join-Path $Root 'gradle.properties') | Where-Object { $_ -match '^version\s*=' } | Select-Object -First 1
        if (!$VersionLine) { throw 'No version in gradle.properties' }
        $Version=($VersionLine -split '=',2)[1].Trim()
        $Jar=Join-Path $Build ('libs/cadeditor-fabric-26.1.2-' + $Version + '.jar')
        $Archive=[IO.Compression.ZipFile]::OpenRead($Jar)
        try {
            $Meta=$Archive.GetEntry('fabric.mod.json')
            if (!$Meta) { throw 'Missing fabric.mod.json' }
            $Reader=[IO.StreamReader]::new($Meta.Open())
            try { $Actual=($Reader.ReadToEnd() | ConvertFrom-Json).version } finally { $Reader.Dispose() }
            if ($Actual -ne $Version) { throw ('Release version mismatch: ' + $Actual + ' != ' + $Version) }
            Assert-CleanArchive $Archive $Jar
        } finally { $Archive.Dispose() }
        @{jar=$Jar; version=$Version; sha256=(Get-FileHash -LiteralPath $Jar).Hash; status='PASS'} | ConvertTo-Json | Set-Content (Join-Path $Evidence 'release-jar.json')
    } finally {
        # Remove only our own marker and empty directory, never somebody else's lock.
        if ($Held -and (Test-Path -LiteralPath $OwnerFile) -and (Get-Content -LiteralPath $OwnerFile -Raw) -eq $Token) {
            Remove-Item -LiteralPath $OwnerFile
            [IO.Directory]::Delete($Lock, $false)
        }
    }
}
try { Test-UserGame } catch { $Blocked='Process safety check failed; game stages skipped: ' + $_.Exception.Message }
foreach ($Stage in $Stages) {
    $Start=[datetime]::UtcNow
    $Evidence=Join-Path $Out $Stage.id
    New-Item -ItemType Directory -Path $Evidence | Out-Null
    $Status='SKIP'; $Reason=''; $Commands=@(Get-Commands $Stage.id)
    try {
        if ($Stopped) { $Reason='Stopped after previous failure (-FailFast)' }
        elseif ($Only -and $Stage.id -ne $Only) { $Reason='Not selected (-Only ' + $Only + ')' }
        elseif ($Stage.game -and $SkipGame) { $Reason='Disabled by -SkipGame' }
        elseif ($Stage.id -eq 'accept' -and !$Full) { $Reason='Quick tier: hidden acceptance requires -Full' }
        elseif ($Stage.id -eq 'effects' -and !(Test-Path tools/live-test/effects.ps1)) { $Reason='Script not yet provided (脚本尚未提供)' }
        else {
            if ($Stage.game -and !$Blocked) {
                try { Test-UserGame } catch { $Blocked='Process safety check failed; game stages skipped: ' + $_.Exception.Message }
            }
            if ($Stage.game -and $Blocked) { $Reason=$Blocked }
            else {
                $script:Deadline=$Start.AddSeconds($Stage.seconds)
                switch ($Stage.id) {
                    ui {
                        $Failures=[Collections.Generic.List[string]]::new()
                        foreach ($File in Get-UiScripts) {
                            try { Invoke-CommandLog 'node' @($File.FullName) (Join-Path $Evidence ($File.BaseName + '.log')) }
                            catch { $Failures.Add($_.Exception.Message); if ($FailFast) { break } }
                        }
                        if (!$FailFast -or !$Failures.Count) {
                            foreach ($File in Get-ChildItem (Join-Path $Root 'fabric/src/main/resources/assets/cadeditor/ui/js/*.js') | Sort-Object Name) {
                                try { Invoke-CommandLog 'node' @('--check',$File.FullName) (Join-Path $Evidence ('syntax-' + $File.Name + '.log')) }
                                catch { $Failures.Add($_.Exception.Message); if ($FailFast) { break } }
                            }
                        }
                        if ($Failures.Count) { throw ($Failures -join '; ') }
                    }
                    java { Invoke-JavaStage $Evidence }
                    world { Invoke-CommandLog 'pwsh' @('-NoProfile','-File','tools/live-test/world-gates.ps1','-EvidenceRoot',$Evidence,'-BuildDirectory',$Build) (Join-Path $Evidence 'stage.log') }
                    accept { Invoke-CommandLog 'pwsh' @('-NoProfile','-File','tools/accept/run.ps1','-EvidenceRoot',$Evidence) (Join-Path $Evidence 'stage.log') }
                    smoke { Invoke-CommandLog 'pwsh' @('-NoProfile','-File','tools/live-test/run.ps1','-EvidenceRoot',$Evidence) (Join-Path $Evidence 'stage.log') }
                    effects { Invoke-CommandLog 'pwsh' @('-NoProfile','-File','tools/live-test/effects.ps1','-Tier','quick','-EvidenceRoot',$Evidence) (Join-Path $Evidence 'stage.log') }
                    pages { Invoke-CommandLog 'pwsh' @('-NoProfile','-File','tools/live-test/pages.ps1','-EvidenceRoot',$Evidence) (Join-Path $Evidence 'stage.log') }
                }
                $Status='PASS'; $Reason='Completed'
            }
        }
    } catch {
        $Status='FAIL'; $Reason=$_.Exception.Message
        if ($Stage.game -and $_.Exception.Data['exitCode'] -eq 2) {
            try { Test-UserGame } catch { $Blocked='Process safety check failed; remaining game stages skipped: ' + $_.Exception.Message }
            if ($Blocked) { $Status='SKIP'; $Reason=$Blocked + '; launcher result: ' + $Reason }
        }
        if ($Status -eq 'FAIL' -and $FailFast) { $Stopped=$true }
    }
    $Results.Add([ordered]@{stage=$Stage.id; status=$Status; seconds=[math]::Round(([datetime]::UtcNow-$Start).TotalSeconds,2); reason=$Reason; evidence=$Evidence; commands=$Commands})
    Write-Output ($Stage.id + ': ' + $Status + ' - ' + $Reason)
    $Failed=@($Results | Where-Object { $_.status -eq 'FAIL' }).Count
    $Overall=if ($Failed) { 'FAIL' } elseif (@($Results | Where-Object { $_.status -eq 'SKIP' }).Count) { 'PASS_WITH_SKIPS' } else { 'PASS' }
    $Report=[ordered]@{status=$Overall; exitCode=[int]($Failed -gt 0); tier=$Tier; complete=($Results.Count -eq $Stages.Count); safetyBlock=$Blocked; results=@($Results.ToArray())}
    $Report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Out 'report.json')
    $Lines=@('# Acceptance Summary', '', ('Result: **' + $Overall + '**; exit code: ' + $Report.exitCode + '; tier: ' + $Tier), '', 'Failures continue to later stages unless -FailFast is set. SKIP is not full acceptance.', '', '| Stage | Status | Seconds | Reason | Evidence |', '| --- | --- | ---: | --- | --- |')
    foreach ($Result in $Results) { $Lines += '| ' + $Result.stage + ' | ' + $Result.status + ' | ' + $Result.seconds + ' | ' + ($Result.reason -replace '[\r\n|]',' ') + ' | [' + $Result.stage + '](./' + $Result.stage + '/) |' }
    $Lines += @('', '## Evidence Index', '', 'Stage directories include command logs and receipts; the effects driver may also write its own default evidence path (see effects/stage.log).')
    Get-ChildItem $Out -Recurse -File | Where-Object { $_.Extension -in '.png','.jpg','.json','.md' -and $_.Name -notin 'report.json','report.md' } | Sort-Object FullName | ForEach-Object { $Relative=[IO.Path]::GetRelativePath($Out,$_.FullName).Replace('\','/'); $Lines += '- [' + $Relative + '](./' + $Relative + ')' }
    $Lines | Set-Content (Join-Path $Out 'report.md')
}
Write-Output ('Reports: ' + $Out + '/report.md and report.json')
exit $Report.exitCode
