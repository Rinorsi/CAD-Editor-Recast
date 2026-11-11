param([Parameter(Mandatory=$true)][string]$Evidence,[Parameter(Mandatory=$true)][string]$RuntimeClasspath,[Parameter(Mandatory=$true)][string]$EditorJar)
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence)
New-Item -ItemType Directory -Force ($Evidence+'/classes')|Out-Null
$Jdk=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Runtime=@(Get-Content -LiteralPath $RuntimeClasspath -Raw|ConvertFrom-Json)
$Cp=(@($EditorJar)+$Runtime)-join ';'
& ($Jdk+'/javac.exe') -proc:none -encoding UTF-8 -cp $Cp -d ($Evidence+'/classes') ($PSScriptRoot+'/NativeRoundTrip.java') *> ($Evidence+'/native-compile.log')
if($LASTEXITCODE -ne 0){Write-Output ('FAIL javac NativeRoundTrip | '+$Evidence+'/native-compile.log');Get-Content ($Evidence+'/native-compile.log') -TotalCount 8;exit 2}
Write-Output ('PASS javac NativeRoundTrip | '+$Evidence+'/native-compile.log')
Push-Location $Evidence
try {
  & ($Jdk+'/java.exe') '-Djava.awt.headless=true' -cp ($Evidence+'/classes;'+$Cp) NativeRoundTrip ($Evidence+'/ui-roundtrip.json') ($Evidence+'/native-roundtrip.json') *> ($Evidence+'/native-roundtrip.log')
  $AuditExit=$LASTEXITCODE
} finally {Pop-Location}
if(Test-Path ($Evidence+'/native-roundtrip.json')) {
  $Result=Get-Content ($Evidence+'/native-roundtrip.json') -Raw|ConvertFrom-Json
  Write-Output ('native-roundtrip | exit='+$AuditExit+' pass='+$Result.passed+' fail='+$Result.failed+' harnessErrors='+$Result.harnessErrors+' | '+$Evidence+'/native-roundtrip.log')
} else {Write-Output ('FAIL native-roundtrip未生成结果 | '+$Evidence+'/native-roundtrip.log');Get-Content ($Evidence+'/native-roundtrip.log') -Tail 8}
exit $AuditExit
