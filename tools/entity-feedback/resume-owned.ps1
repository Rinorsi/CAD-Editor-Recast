param([Parameter(Mandatory)][string]$Evidence)
$ErrorActionPreference='Stop'
$Evidence=[IO.Path]::GetFullPath($Evidence)
if($Evidence -notlike '*user-feedback-entities*backend-drafts*lead-live-262*'){throw 'Not an owned effects/drafts evidence directory'}
$Run=Join-Path $Evidence 'host'
$Old=Get-Content ($Evidence+'/active-process.json') -Raw | ConvertFrom-Json
if(Get-Process -Id $Old.pid -ErrorAction SilentlyContinue){throw 'Previous owned JVM is still alive'}
if(Get-NetTCPConnection -LocalPort 25782 -State Listen -ErrorAction SilentlyContinue){throw 'Port 25782 occupied'}
# A fresh probe has no remembered id: archive old RPC to prevent replay of stop.
$Archive=Join-Path $Evidence 'restart-rpc-archive'
New-Item -ItemType Directory $Archive | Out-Null
foreach($Name in @('request.json','response.json','request.tmp')){
 if(Test-Path -LiteralPath ($Run+'/'+$Name)){Move-Item -LiteralPath ($Run+'/'+$Name) -Destination ($Archive+'/'+$Name)}
}
$Java=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin/java.exe'
$Info=[Diagnostics.ProcessStartInfo]::new()
$Info.FileName=$Java;$Info.Arguments='"@'+$Run+'/java.args"';$Info.WorkingDirectory=$Run
$Info.UseShellExecute=$false;$Info.CreateNoWindow=$true;$Info.WindowStyle='Hidden';$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
$P=[Diagnostics.Process]::Start($Info)
$Stdout=$P.StandardOutput.ReadToEndAsync();$Stderr=$P.StandardError.ReadToEndAsync()
@{owner=$Old.owner;pid=$P.Id;phase='second';run=$Run;startup=3} | ConvertTo-Json | Set-Content ($Evidence+'/active-process.json')
try{
 $Deadline=[DateTime]::UtcNow.AddMinutes(12)
 while(!(Test-Path -LiteralPath ($Evidence+'/second.complete'))){
  if($P.HasExited){throw 'Third owned JVM exited before completion'}
  if([DateTime]::UtcNow -gt $Deadline){throw 'Third owned JVM bounded timeout'}
  Start-Sleep -Milliseconds 300
 }
 if(!$P.WaitForExit(45000)){throw 'Third owned JVM did not stop normally'}
 @{phase='second';startup=3;pid=$P.Id;exited=$P.HasExited;exitCode=$P.ExitCode} | ConvertTo-Json | Set-Content ($Evidence+'/second-exit.json')
}finally{
 if(!$P.WaitForExit(15000)){$P.Kill();$P.WaitForExit()}
 [IO.File]::WriteAllText(($Run+'/third-stdout.log'),$Stdout.GetAwaiter().GetResult())
 [IO.File]::WriteAllText(($Run+'/third-stderr.log'),$Stderr.GetAwaiter().GetResult())
 @{owner=$Old.owner;startup=3;remaining=@(if(!$P.HasExited){$P.Id})} | ConvertTo-Json | Set-Content ($Evidence+'/cleanup-third.json')
 @{port=25782;ownedPids=@($Old.pid,$P.Id);listeners=@(Get-NetTCPConnection -LocalPort 25782 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)} | ConvertTo-Json -Depth 4 | Set-Content ($Evidence+'/port-cleanup-third.json')
}
