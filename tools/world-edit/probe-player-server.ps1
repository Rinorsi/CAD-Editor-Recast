param()
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
# Independent scratch server, loopback ephemeral port; does not touch the running client.
$Work=Join-Path $Root '.world-player'
$Log=Join-Path $Root 'logs/world-player'
$Server=Join-Path $Work ('server-'+(Get-Date -Format yyyyMMdd-HHmmss))
if(Test-Path -LiteralPath $Server){throw '探针目录已存在；不覆盖'}
New-Item -ItemType Directory -Path $Server,(Join-Path $Server 'mods'),(Join-Path $Server 'metadata') | Out-Null
Set-Content (Join-Path $Server 'eula.txt') 'eula=true'
Set-Content (Join-Path $Server 'server.properties') @('online-mode=false','server-ip=127.0.0.1','server-port=0','view-distance=2','simulation-distance=2','level-type=minecraft:flat','generate-structures=false','spawn-protection=0','pause-when-empty-seconds=-1','max-tick-time=120000')
$Meta=@{schemaVersion=1;id='cadeditor_player_server_probe';version='1.0.0';environment='server';entrypoints=@{main=@('dev.rinorsi.editor.registry.PlayerWorldEditServerProbe')};depends=@{fabricloader='>=0.19.5';'fabric-api'='*';minecraft='26.1.2';java='>=25'}}
[IO.File]::WriteAllText((Join-Path $Server 'metadata/fabric.mod.json'),($Meta|ConvertTo-Json -Depth 5))
& "$env:JAVA_HOME/bin/jar.exe" cf (Join-Path $Server 'mods/player-probe.jar') -C (Join-Path $Server 'metadata') fabric.mod.json -C (Join-Path $Work 'main') dev -C (Join-Path $Work 'test') dev/rinorsi/editor/registry/PlayerWorldEditServerProbe.class -C (Join-Path $Work 'test') 'dev/rinorsi/editor/registry/PlayerWorldEditServerProbe$RecordingListener.class'
if($LASTEXITCODE -ne 0){throw '服务端探针打包失败'}
$Cp=(Get-Content (Join-Path $Log 'classpath.txt') -Raw).Trim()
$Mc=($Cp -split ';' | Where-Object {$_ -match 'minecraft-merged.*[.]jar$'} | Select-Object -First 1)
$Receipt=Join-Path $Log 'captured-server.json'
$ArgsFile=Join-Path $Server 'java.args'
$JavaArgs=@('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Djava.awt.headless=true','-Dfabric.development=true',('-Dfabric.gameJarPath='+$Mc),('-Dcadeditor.player.receipt='+$Receipt),'-cp',$Cp,'net.fabricmc.loader.impl.launch.knot.KnotServer','--nogui')
[IO.File]::WriteAllLines($ArgsFile,@($JavaArgs | ForEach-Object {'"'+$_.Replace('\','\\').Replace('"','\"')+'"'}))
Push-Location -LiteralPath $Server
try { & "$env:JAVA_HOME/bin/java.exe" ('@'+$ArgsFile) *> (Join-Path $Log 'server-probe.log'); if($LASTEXITCODE -ne 0){throw '服务端探针失败：logs/world-player/server-probe.log'} } finally {Pop-Location}
if(!(Test-Path -LiteralPath $Receipt) -or !(Get-Content $Receipt -Raw | ConvertFrom-Json).passed){throw '服务端探针未通过：logs/world-player/captured-server.json'}
Write-Output 'PASS real ServerLevel detached player probe; logs/world-player/server-probe.log; captured-server.json'
