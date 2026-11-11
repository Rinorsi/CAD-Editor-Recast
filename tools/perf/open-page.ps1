param(
  [Parameter(Mandatory=$true)][string]$EditorJar,
  [Parameter(Mandatory=$true)][string]$Evidence,
  [string]$UiRoot = '-',
  [ValidateRange(2,30)][int]$Repeats = 6,
  [switch]$PreStyle
)
$ErrorActionPreference = 'Stop'
$EditorJar = (Resolve-Path -LiteralPath $EditorJar).Path
$Evidence = [IO.Path]::GetFullPath($Evidence)
if ($UiRoot -ne '-') { $UiRoot = (Resolve-Path -LiteralPath $UiRoot).Path }
New-Item -ItemType Directory -Force ($Evidence+'/classes'),($Evidence+'/nested') | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$jars = [Collections.Generic.List[string]]::new()
$jars.Add($EditorJar)
# Extract only nested jars, to our own flat paths (never archive-supplied target paths).
for ($i=0; $i -lt $jars.Count; $i++) {
  $zip = [IO.Compression.ZipFile]::OpenRead($jars[$i])
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName.EndsWith('.jar') -and $entry.FullName.StartsWith('META-INF/')) {
        $target = Join-Path $Evidence ('nested/'+$jars.Count+'.jar')
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true)
        $jars.Add($target)
      }
    }
  } finally { $zip.Dispose() }
}
$jars | Set-Content -Encoding utf8 ($Evidence+'/jars.txt')
@($jars | ForEach-Object { Get-FileHash -LiteralPath $_ -Algorithm SHA256 }) | ConvertTo-Json | Set-Content -Encoding utf8 ($Evidence+'/jar-hashes.json')
$cp = $jars -join ';'
$jdk = Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
& ($jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $cp -d ($Evidence+'/classes') ($PSScriptRoot+'/OpenPageProfile.java') *> ($Evidence+'/compile.log')
if ($LASTEXITCODE -ne 0) { Write-Output ('FAIL | javac OpenPageProfile | '+$Evidence+'/compile.log'); exit 1 }
$javaOptions = @('-Djava.awt.headless=true')
if ($PreStyle) { $javaOptions += '-Deditor.profile.preStyle=true' }
& ($jdk+'/java.exe') @javaOptions -cp ($Evidence+'/classes;'+$cp) OpenPageProfile ($Evidence+'/profile.json') $UiRoot $Repeats ($Evidence+'/jars.txt') *> ($Evidence+'/profile.log')
$code = $LASTEXITCODE
Write-Output ((@{0='PASS';1='FAIL'}[$code])+' | OpenPageProfile（原生引擎CPU诊断，非实机帧率） | '+$Evidence+'/profile.log')
exit $code
