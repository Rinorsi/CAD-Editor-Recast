param(
    [string]$ArtifactDir,
    [switch]$GitHub,
    [string]$BuildRunId,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Repo = 'Rinorsi/CAD-Editor-Recast'
Push-Location -LiteralPath $Root
try {
    if ($GitHub) {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw '需要安装并登录 GitHub CLI（gh）。' }
        $Revision = (git rev-parse HEAD).Trim()
        if ($LASTEXITCODE) { throw '无法读取当前 Git 提交。' }
        if (-not $BuildRunId) {
            $Runs = gh run list --repo $Repo --workflow build.yml --commit $Revision --status success --limit 1 --json databaseId | ConvertFrom-Json
            if ($LASTEXITCODE -or -not $Runs) { throw '当前提交尚无通过的六目标 CI。请等待 Build and release 成功后重试。' }
            $BuildRunId = [string]$Runs[0].databaseId
        }
        if ($BuildRunId -notmatch '^[0-9]+$') { throw 'BuildRunId 必须是数字。' }
        Write-Output "复用 GitHub MODRINTH Secret；上传 CI 构建 $BuildRunId 的六个包，仅创建原项目草稿。"
        if ($DryRun) { return }
        gh workflow run modrinth-draft.yml --repo $Repo --ref main -f "build_run_id=$BuildRunId"
        if ($LASTEXITCODE) { throw '无法启动草稿上传工作流。' }
        Write-Output "查看上传回执：https://github.com/$Repo/actions/workflows/modrinth-draft.yml"
        return
    }
    if (-not $ArtifactDir) {
        $Version = ((Get-Content gradle.properties | Where-Object { $_ -match '^version=' }) -split '=',2)[1].Trim()
        $Dist = Join-Path $Root '../Oriel-UI-Workspace/dist'
        $Candidate = Get-ChildItem -LiteralPath $Dist -Directory |
            Where-Object { $_.Name.StartsWith("editor-$Version-") -and (Test-Path -LiteralPath (Join-Path $_.FullName 'SHA256SUMS.txt')) } |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if (-not $Candidate) { throw '未找到交付包目录，请用 -ArtifactDir 指定包含六个 JAR 的目录。' }
        $ArtifactDir = $Candidate.FullName
    }
    Write-Output "本机直传：$ArtifactDir"
    $UploadArgs = @('tools/modrinth-draft.py', '--artifact-dir', $ArtifactDir)
    if (-not $DryRun) { $UploadArgs += @('--apply', '--prompt-token') }
    python @UploadArgs
    if ($LASTEXITCODE) { throw '草稿上传未完成，请按上方错误处理；不要手工重复创建版本。' }
} finally { Pop-Location }
