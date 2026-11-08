param([string]$Date = (Get-Date -Format 'yyyyMMdd'), [switch]$Offline, [switch]$DryRun, [ValidateRange(1,120)][int]$LockWaitMinutes=30)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Workspace = [IO.Path]::GetFullPath((Join-Path $Root '../Oriel-UI-Workspace'))
$Version = ((Get-Content (Join-Path $Root 'gradle.properties') | Where-Object { $_ -match '^version=' }) -split '=',2)[1].Trim()
if ($Date -notmatch '^\d{8}$') { throw 'Date must be yyyyMMdd' }
$Day = Get-Date -Format 'yyyy-MM-dd'
$Logs = Join-Path $Workspace ('daily/' + $Day + '/logs/editor-matrix')
$Destination = Join-Path $Workspace ('dist/editor-' + $Version + '-' + $Date)
if ($DryRun) {
    Write-Output ('DRY RUN: build/check six targets including Codec; version='+$Version+'; distribution='+$Destination+'; wait for owned Gradle lock; no writes or processes')
    exit 0
}
New-Item -ItemType Directory -Force $Logs | Out-Null
$Lock = Join-Path $Root 'logs/.gradle.lock.d'
$Owner = [guid]::NewGuid().ToString('N')
$OwnerFile = Join-Path $Lock ('build-all-'+$Owner+'.owner')
$Held = $false
$Deadline = (Get-Date).AddMinutes($LockWaitMinutes)
while (!$Held) {
    try { New-Item -ItemType Directory $Lock -ErrorAction Stop | Out-Null; $Held=$true }
    catch { if ((Get-Date) -gt $Deadline) { throw '等待共享 Gradle 锁超时；未停止任何已有进程，请稍后重试' }; Start-Sleep 5 }
}
[IO.File]::WriteAllText($OwnerFile,$Owner)
Push-Location -LiteralPath $Root
try {
    $Arguments = @('build', '--console=plain', '--max-workers=2', '-PmcTest=false', '--no-problems-report')
    if ($Offline) { $Arguments += '--offline' }
    $Info = [Diagnostics.ProcessStartInfo]::new()
    $Info.FileName=$env:ComSpec
    $Info.Arguments='/d /s /c ""'+(Join-Path $Root 'gradlew.bat')+'" '+($Arguments -join ' ')+'"'
    $Info.WorkingDirectory=$Root; $Info.UseShellExecute=$false; $Info.CreateNoWindow=$true; $Info.WindowStyle='Hidden'
    $Info.RedirectStandardOutput=$true; $Info.RedirectStandardError=$true
    $Process=[Diagnostics.Process]::Start($Info)
    $Stdout=$Process.StandardOutput.ReadToEndAsync(); $Stderr=$Process.StandardError.ReadToEndAsync()
    $Process.WaitForExit()
    [IO.File]::WriteAllText((Join-Path $Logs 'build-all.log'),$Stdout.Result+[Environment]::NewLine+$Stderr.Result)
    $Code=$Process.ExitCode; $Process.Dispose()
    if ($Code) { throw ('Matrix build failed; see ' + (Join-Path $Logs 'build-all.log')) }
    $Jars = foreach ($Loader in @('fabric','neoforge')) {
        foreach ($MC in @('26.1.2','26.2','26.3')) {
            $Name = 'cadeditor-' + $Loader + '-' + $MC + '-' + $Version + '.jar'
            $Source = Join-Path $Workspace ('daily/' + $Day + '/scratch/editor-mod/build/' + $Loader + '-' + $MC + '/libs/' + $Name)
            if (!(Test-Path -LiteralPath $Source)) { throw ('Missing target: ' + $Source) }
            Get-Item -LiteralPath $Source
        }
    }
    # Verify the complete set before publishing anything into the local distribution directory.
    New-Item -ItemType Directory -Force $Destination | Out-Null
    foreach ($Jar in $Jars) { Copy-Item -LiteralPath $Jar.FullName -Destination $Destination -Force }
    $Jars | Sort-Object Name | ForEach-Object {
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Destination $_.Name)).Hash.ToLowerInvariant() + '  ' + $_.Name
    } | Set-Content -LiteralPath (Join-Path $Destination 'SHA256SUMS.txt') -Encoding utf8NoBOM
    @(('# CAD Editor ' + $Version), '',
      'Choose the jar matching both Minecraft and your loader. Install the corresponding Oriel 0.11.0 jar; Fabric also requires Fabric API.',
      '', 'Targets: Fabric / NeoForge x Minecraft 26.1.2, 26.2, 26.3.',
      'Build and headless checks passed. Runtime acceptance results are recorded separately in docs/MULTIVERSION.md.') |
      Set-Content -LiteralPath (Join-Path $Destination 'README.md') -Encoding utf8NoBOM
    Write-Output ('PASS: six jars and SHA256SUMS.txt in ' + $Destination)
} finally {
    Pop-Location
    if ($Held -and (Test-Path -LiteralPath $OwnerFile) -and (Get-Content -LiteralPath $OwnerFile -Raw) -eq $Owner) {
        Remove-Item -LiteralPath $OwnerFile
        [IO.Directory]::Delete($Lock,$false)
    }
}
