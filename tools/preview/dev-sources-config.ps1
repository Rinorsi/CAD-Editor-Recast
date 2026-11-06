function Set-EditorDevSource {
    param([Parameter(Mandatory=$true)][string]$File, [Parameter(Mandatory=$true)][string]$AssetsDirectory)
    $File = [IO.Path]::GetFullPath($File)
    $AssetsDirectory = [IO.Path]::GetFullPath($AssetsDirectory)
    if (!(Test-Path -LiteralPath $AssetsDirectory -PathType Container)) { throw 'Editor源码assets目录不存在' }
    $Value = $AssetsDirectory.Replace([char]92, [char]47)
    $Value = [regex]::Replace($Value, '[^\x20-\x7e]', [Text.RegularExpressions.MatchEvaluator]{param($m) '\u' + ([int][char]$m.Value).ToString('x4')})
    $Lines = @(if (Test-Path -LiteralPath $File) { [IO.File]::ReadAllLines($File) })   # 外层 @() 保证单行文件也是数组，否则 $Lines[$i] 会变成单个字符
    $Keep = [Collections.Generic.List[string]]::new()
    for ($Index = 0; $Index -lt $Lines.Count; $Index++) {
        $Group = [Collections.Generic.List[string]]::new()
        $First = $Lines[$Index]
        $IsComment = $First -match '^\s*[#!]'
        do {
            $Line = $Lines[$Index]; $Group.Add($Line)
            $Slashes = $Line.Length - $Line.TrimEnd([char]92).Length
            $Continued = !$IsComment -and ($Slashes % 2 -eq 1) -and ($Index + 1 -lt $Lines.Count)
            if ($Continued) { $Index++ }
        } while ($Continued)
        if ($First -notmatch '^\s*(?:cad)?editor(?:\s*[:=]|\s+)') { $Keep.AddRange($Group) }
    }
    $Lines = @($Keep)
    $Text = ($Lines + @('cadeditor=' + $Value)) -join [Environment]::NewLine
    $Text += [Environment]::NewLine
    if ((Test-Path -LiteralPath $File) -and [IO.File]::ReadAllText($File) -ceq $Text) { return }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($File)) | Out-Null
    $Temp = $File + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($Temp, $Text, [Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $File) { [IO.File]::Replace($Temp, $File, [NullString]::Value) }
        else { [IO.File]::Move($Temp, $File) }
    } finally { if (Test-Path -LiteralPath $Temp) { [IO.File]::Delete($Temp) } }
}
