param(
    [Parameter(Mandatory=$true)][string]$Source,
    [Parameter(Mandatory=$true)][string]$Destination,
    [Parameter(Mandatory=$true)][string]$Fixture,
    [Parameter(Mandatory=$true)][string]$Log,
    [int]$ParentProcessId = 0,
    [switch]$Once
)
$ErrorActionPreference = "Stop"
$Source = [IO.Path]::GetFullPath($Source).TrimEnd([char]92, [char]47)
$Destination = [IO.Path]::GetFullPath($Destination).TrimEnd([char]92, [char]47)
if (!(Test-Path -LiteralPath $Source -PathType Container)) { throw "页面源目录不存在" }
if ($Destination -eq $Source -or $Destination.StartsWith($Source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "同步目标不能是源目录或其子目录" }
New-Item -ItemType Directory -Force -Path $Destination, ([IO.Path]::GetDirectoryName($Log)) | Out-Null
$Utf8 = [Text.UTF8Encoding]::new($false)
function Write-SyncLog([string]$Message) {
    [IO.File]::AppendAllText($Log, ([DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + $Message + [Environment]::NewLine), $Utf8)
}
function Source-Files {
    @(Get-ChildItem -LiteralPath $Source -File -Recurse | Where-Object { !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | Sort-Object FullName)
}
function Signature {
    $Files = @(Source-Files) + @(Get-Item -LiteralPath $Fixture)
    $Total = ($Files | Measure-Object Length -Sum).Sum
    $Max = ($Files | ForEach-Object { $_.LastWriteTimeUtc.Ticks } | Measure-Object -Maximum).Maximum
    $PerFile = ($Files | ForEach-Object { $_.FullName + ":" + $_.Length + ":" + $_.LastWriteTimeUtc.Ticks }) -join "|"
    return "$($Files.Count):@{Max}:@{Total}:$PerFile"
}
function Atomic-Write([string]$Target, [byte[]]$Bytes) {
    $Target = [IO.Path]::GetFullPath($Target)
    if (!$Target.StartsWith($Destination + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "文件逃离同步目标" }
    if (Test-Path -LiteralPath $Target -PathType Leaf) {
        if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($Target)) -ceq [Convert]::ToBase64String($Bytes)) { return $false }
    }
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($Target)) | Out-Null
    $Temp = $Target + ".editor-sync-" + [Guid]::NewGuid().ToString("N") + ".tmp"
    try {
        [IO.File]::WriteAllBytes($Temp, $Bytes)
        if (Test-Path -LiteralPath $Target) { [IO.File]::Replace($Temp, $Target, [NullString]::Value) }
        else { [IO.File]::Move($Temp, $Target) }
    } finally { if (Test-Path -LiteralPath $Temp) { [IO.File]::Delete($Temp) } }
    return $true
}
function Sync-Page {
    $BeforeRead = Signature
    $Expected = @{}
    $Changed = [Collections.Generic.List[string]]::new()
    # Read source files completely before publishing; index is always last.
    $Writes = @(Source-Files | ForEach-Object {
        $Relative = $_.FullName.Substring($Source.Length).TrimStart([char]92, [char]47)
        $Expected[$Relative] = $true
        $Rank = switch ($_.Extension.ToLowerInvariant()) { ".css" { 0 }; ".js" { 1 }; ".html" { 3 }; default { 2 } }
        $Bytes = [IO.File]::ReadAllBytes($_.FullName)
        if ($Relative -eq "index.html") {
            $Rank = 9
            $Html = [Text.Encoding]::UTF8.GetString($Bytes).TrimStart([char]0xFEFF)
            $Html = [regex]::Replace($Html, "<script\b[^>]*\bsrc=[`"']preview-stack\.js[`"'][^>]*>\s*</script>\s*", "", "IgnoreCase")
            $Tag = "<script src=`"preview-stack.js`"></script>" + "`n"
            if ($Html -notmatch "<script\b[^>]*\bsrc=[`"']js/app\.js") { throw "index.html缺少js/app.js入口，未发布本次同步" }
            $Html = [regex]::Replace($Html, "(?=<script\b[^>]*\bsrc=[`"']js/app\.js)", [Text.RegularExpressions.MatchEvaluator]{ param($m) $Tag }, "IgnoreCase")
            $Bytes = $Utf8.GetBytes($Html)
        }
        [pscustomobject]@{Relative=$Relative; Rank=$Rank; Bytes=$Bytes}
    })
    $Expected["preview-stack.js"] = $true
    $Writes += [pscustomobject]@{Relative="preview-stack.js"; Rank=1; Bytes=[IO.File]::ReadAllBytes($Fixture)}
    if ((Signature) -cne $BeforeRead) { throw "读取期间源文件变化，等待下一次稳定同步" }
    foreach ($Write in ($Writes | Sort-Object Rank, Relative)) {
        if (Atomic-Write (Join-Path $Destination $Write.Relative) $Write.Bytes) { $Changed.Add($Write.Relative) }
    }
    foreach ($Stale in @(Get-ChildItem -LiteralPath $Destination -File -Recurse)) {
        $Relative = $Stale.FullName.Substring($Destination.Length).TrimStart([char]92, [char]47)
        if (!$Expected.ContainsKey($Relative)) { [IO.File]::Delete($Stale.FullName); $Changed.Add("removed:" + $Relative) }
    }
    if ($Changed.Count) { Write-SyncLog ("SYNC " + ($Changed -join ", ")) }
}
if ($Once) { Sync-Page; return }
if ($ParentProcessId -le 0) { throw "监视模式必须指定父进程PID" }
$Parent = Get-Process -Id $ParentProcessId -ErrorAction Stop
$ParentStart = $Parent.StartTime
$Lock = $null
try {
    $Lock = [IO.File]::Open($Destination + ".editor-watch.lock", [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    Write-SyncLog ("WATCH START pid=" + $PID + " parent=" + $ParentProcessId)
    $Last = Signature
    Sync-Page
    while ($true) {
        Start-Sleep -Milliseconds 400
        $Parent = Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue
        if (!$Parent -or $Parent.StartTime -ne $ParentStart) { break }
        try {
            $Current = Signature
            if ($Current -ceq $Last) { continue }
            Start-Sleep -Milliseconds 150
            $Stable = Signature
            if ($Stable -cne $Current) { continue }
            Sync-Page
            $Last = $Stable
        } catch { Write-SyncLog ("SYNC RETRY " + $_.Exception.Message) }
    }
    Write-SyncLog ("WATCH STOP parent exited pid=" + $PID)
} finally { if ($Lock) { $Lock.Dispose() } }
