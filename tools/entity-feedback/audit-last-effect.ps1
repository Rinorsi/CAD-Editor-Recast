param([Parameter(Mandatory)][string]$Evidence)
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence)
if($Evidence -notlike '*backend-drafts*lead-live-262*last-effect-8E3E-*'){throw 'Not owned last-effect evidence'}
$Config=Get-Content ($Evidence+'/configuration.json') -Raw | ConvertFrom-Json
$Expected='8e3e30f726b78df4f5e2afee15f723acd9f7db73968f0c369efbb67cfa6c88fd'
$Jar=$Evidence+'/host/mods/cadeditor-fabric-26.2-0.99.5.jar'
$Hash=(Get-FileHash -LiteralPath $Jar -Algorithm SHA256).Hash
if($Hash.ToLowerInvariant() -ne $Expected){throw 'Installed production artifact hash mismatch'}
$Loaded=Get-Content ($Evidence+'/host/mods.json') -Raw | ConvertFrom-Json
$Oriel=@($Loaded | Where-Object {$_.id -eq 'oriel'})
if($Oriel.Count -ne 1 -or $Oriel[0].origin -ne 'NESTED' -or $Oriel[0].version -ne '0.15.0'){throw 'Not one nested Oriel0.15'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Zip=[IO.Compression.ZipFile]::OpenRead($Jar)
try{
 $Entries=@($Zip.Entries | Where-Object {$_.FullName -match '^META-INF/jars/oriel-.*[.]jar$'})
 if($Entries.Count -ne 1){throw 'Unexpected nested Oriel count'}
 $Stream=$Entries[0].Open()
 try{$NestedHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Stream))}finally{$Stream.Dispose()}
}finally{$Zip.Dispose()}
if($NestedHash.ToLowerInvariant() -ne '1d4f66a91fd96b17953779d899879228d147a8aa0337a1272a1211164d85d546'){throw 'Nested Oriel hash mismatch'}
$JvmArgs=Get-Content ($Evidence+'/host/java.args') -Raw
if($JvmArgs -match 'oriel.sourceRoot|dev-sources|oriel-native|oriel-fabric'){throw 'Unexpected standalone/dev Oriel JVM args'}
if(Test-Path -LiteralPath ($Evidence+'/host/config/oriel/dev-sources.properties')){throw 'Unexpected dev sources'}
$Cleanup=Get-Content ($Evidence+'/cleanup.json') -Raw | ConvertFrom-Json
if(@($Cleanup.remaining).Count -ne 0){throw 'Owned cleanup not empty'}
$Owned=@(Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" | Where-Object {$_.CommandLine -like ('*editor.clientOnly.owner='+$Cleanup.owner+'*')} | Select-Object ProcessId,Name,CommandLine)
$Listeners=@(Get-NetTCPConnection -LocalPort 25782 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
if($Owned.Count -ne 0 -or $Listeners.Count -ne 0){throw 'Owned Java or port25782 remains'}
$Exits=@('first') | ForEach-Object {Get-Content ($Evidence+'/'+$_+'-exit.json') -Raw | ConvertFrom-Json}
foreach($Exit in $Exits){if(!$Exit.exited -or $Exit.exitCode -ne 0){throw 'Owned JVM did not exit normally'}}
@{status='PASS';installedEditorSha256=$Hash;nestedOrielSha256=$NestedHash;oriel=$Oriel;owner=$Cleanup.owner;exits=$Exits;remaining=$Owned;listeners=$Listeners;devSources=$false;mods=@(Get-ChildItem -LiteralPath ($Evidence+'/host/mods') -Filter '*.jar' | Select-Object Name)} | ConvertTo-Json -Depth 6 | Tee-Object -FilePath ($Evidence+'/final-audit.json')
