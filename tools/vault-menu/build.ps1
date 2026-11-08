$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Log=Join-Path $Root 'logs/vault-menu'
New-Item -ItemType Directory -Force $Log | Out-Null
$Owned=$false
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
try {
    $Deadline=[DateTime]::UtcNow.AddMinutes(20)
    while(!$Owned){
        try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null;$Owned=$true}
        catch{if(!(Test-Path -LiteralPath $Lock)){throw};if([DateTime]::UtcNow -ge $Deadline){throw '等待Gradle锁超过20分钟'};Start-Sleep -Seconds 2}
    }
    Push-Location $Root
    try { & ./gradlew.bat --console=plain --max-workers=2 :fabric:26.1:vaultTest :fabric:26.1:build *> ($Log+'/gradle-build.log');if($LASTEXITCODE){throw ('Gradle失败，exit='+$LASTEXITCODE)} }
    finally {Pop-Location}
    Write-Output 'PASS vaultTest + build; logs/vault-menu/gradle-build.log'
} catch {
    $_.Exception.Message | Add-Content ($Log+'/gradle-build.log')
    Write-Output ('构建未完成：'+$_.Exception.Message+'；日志 logs/vault-menu/gradle-build.log')
    exit 2
} finally {if($Owned){Remove-Item -LiteralPath $Lock}}

