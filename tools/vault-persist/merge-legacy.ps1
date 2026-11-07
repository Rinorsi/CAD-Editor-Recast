param(
  [Parameter(Position=0)][string[]]$Paths,
  [string]$Glob,
  [string]$OutputDirectory
)
$ErrorActionPreference='Stop'
try {
  if($IsWindows){
    $Games=@(Get-CimInstance Win32_Process -Filter "Name='java.exe' OR Name='javaw.exe'" | Where-Object {$_.CommandLine -match 'KnotClient|runClient|net.minecraft.client.main.Main'})
  } else {
    $Games=@(& /bin/ps -ax -o pid=,comm=,args= | ForEach-Object {if($_ -match '^s*(d+)s+(S+)s+(.*)$'){$processNumber=$Matches[1];$commandName=$Matches[2];$argumentsText=$Matches[3];if($commandName -match 'java(w)?$' -and $argumentsText -match 'KnotClient|runClient|net.minecraft.client.main.Main'){[pscustomobject]@{ProcessId=$processNumber}}}})
  }
  if($Games.Count){throw ('请先关闭Minecraft再合并保险库；未修改文件，也不会结束游戏进程。PID='+($Games.ProcessId -join ','))}
  if(!$OutputDirectory){
    if($IsWindows){$base=$env:APPDATA;if(!$base){$base=Join-Path $HOME 'AppData/Roaming'}}
    elseif($IsMacOS){$base=Join-Path $HOME 'Library/Application Support'}
    else{$base=$env:XDG_DATA_HOME;if(!$base){$base=Join-Path $HOME '.local/share'}}
    $OutputDirectory=Join-Path $base 'cadeditor'
  }
  $OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
  $output=Join-Path $OutputDirectory 'vault.json'
  $sources=[Collections.Generic.List[string]]::new()
  foreach($path in $Paths){$sources.Add((Get-Item -LiteralPath $path -ErrorAction Stop).FullName)}
  if($Glob){foreach($file in Get-ChildItem -Path $Glob -File -ErrorAction Stop){$sources.Add($file.FullName)}}
  if(!$Paths -and !$Glob){throw '请用 -Paths 或 -Glob 指定旧保险库文件'}
  $files=@($sources | Select-Object -Unique)
  if(!$files.Count){throw '没有找到要合并的保险库文件'}
  Add-Type -Path (Join-Path $PSScriptRoot 'VaultLegacyMerge.cs')
  # All input JSON, schema and quotas are validated before any destination write.
  $text=[VaultLegacyMerge]::Merge($output,[string[]]$files)
  $count=([System.Text.Json.Nodes.JsonNode]::Parse($text)['entries']).Count
  Write-Output ('PASS 已合并 '+$files.Count+' 个文件，共 '+$count+' 条；目标 '+$output+'；原目标备份为 vault.json.bak')
} catch {
  Write-Error ('合并未完成：'+$_.Exception.Message+'；请修正原因后重试，旧文件均保留。') -ErrorAction Continue
  exit 2
}
