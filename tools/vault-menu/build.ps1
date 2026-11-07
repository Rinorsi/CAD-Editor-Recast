$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Log=Join-Path $Root 'logs/vault-menu'
New-Item -ItemType Directory -Force $Log | Out-Null
function Assert-NoUserGame {
    $Games=@(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {$_.CommandLine -match 'KnotClient|runClient|net.minecraft.client.main.Main' })
    if($Games.Count){$Games | Select-Object ProcessId | ConvertTo-Json | Set-Content ($Log+'/user-game-processes.json');throw ('real-client run pending: user game running; PID='+($Games.ProcessId -join ','))}
}
$Owned=$false
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
try {
    Assert-NoUserGame
    $Deadline=[DateTime]::UtcNow.AddMinutes(20)
    while(!$Owned){
        try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;$Owned=$true}
        catch{if(!(Test-Path -LiteralPath $Lock)){throw};if([DateTime]::UtcNow -ge $Deadline){throw '等待Gradle锁超过20分钟'};Start-Sleep -Seconds 2}
    }
    Assert-NoUserGame
    Push-Location $Root
    try { & bash tools/gw.sh :fabric:26.1.2:vaultTest :fabric:26.1.2:vaultButtonLayoutTest :fabric:26.1.2:build --no-problems-report *> ($Log+'/gradle-build.log');if($LASTEXITCODE){throw ('Gradle失败，exit='+$LASTEXITCODE)} }
    finally {Pop-Location}
    Write-Output 'PASS vaultTest + vaultButtonLayoutTest + build; logs/vault-menu/gradle-build.log'
} catch {
    $_.Exception.Message | Add-Content ($Log+'/gradle-build.log')
    Write-Output ('构建未完成：'+$_.Exception.Message+'；日志 logs/vault-menu/gradle-build.log')
    exit 2
} finally {if($Owned){Remove-Item -LiteralPath $Lock}}

