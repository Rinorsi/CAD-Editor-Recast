$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Log=Join-Path $Root 'logs/entity-schema'
New-Item -ItemType Directory -Force $Log | Out-Null
function Assert-NoUserGame {
    $Games=@(Get-CimInstance Win32_Process -Filter "Name = 'java.exe' OR Name = 'javaw.exe'" | Where-Object {$_.CommandLine -match 'KnotClient|runClient|net.minecraft.client.main.Main|devlaunchinjector.Main'})
    if($Games.Count){$Games | Select-Object ProcessId | ConvertTo-Json | Set-Content ($Log+'/user-game-processes.json');throw ('real-client run pending: 用户游戏正在运行；PID='+($Games.ProcessId -join ','))}
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
    try { & bash tools/gw.sh :fabric:26.1.2:build --no-problems-report *> ($Log+'/gradle-final.log');if($LASTEXITCODE){throw ('Gradle失败，exit='+$LASTEXITCODE)} }
    finally {Pop-Location}
    Write-Output 'PASS Gradle build (including existing and new entity JVM tests); logs/entity-schema/gradle-final.log'
} catch {
    $_.Exception.Message | Add-Content ($Log+'/gradle-final.log')
    Write-Output ('构建未完成：'+$_.Exception.Message+'；日志 logs/entity-schema/gradle-final.log')
    exit 2
} finally {if($Owned){Remove-Item -LiteralPath $Lock}}
