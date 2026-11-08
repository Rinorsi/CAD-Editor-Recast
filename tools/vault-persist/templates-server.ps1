$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Daily=[IO.Path]::GetFullPath((Join-Path $Root ('../Oriel-UI-Workspace/daily/'+(Get-Date -Format yyyy-MM-dd))))
$Log=Join-Path $Daily 'logs/vault-templates'
$Info=Get-Content (Join-Path $Log 'probe-classpath.json') -Raw | ConvertFrom-Json
$Work=Join-Path $Daily ('scratch/vault-template-server-'+(Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $Work,(Join-Path $Work 'mods'),(Join-Path $Work 'metadata'),(Join-Path $Work 'adapter') | Out-Null
Set-Content (Join-Path $Work 'eula.txt') 'eula=true'
Set-Content (Join-Path $Work 'server.properties') @('online-mode=false','server-ip=127.0.0.1','server-port=0','view-distance=2','simulation-distance=2','level-type=minecraft:flat','generate-structures=false','spawn-protection=0','pause-when-empty-seconds=-1','max-tick-time=120000')
@"
package dev.rinorsi.editor.vaultprobe;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.network.*;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.*;
import com.mojang.authlib.GameProfile;
import com.google.gson.*;
import java.util.*;
import java.nio.file.*;
public final class TemplateProbe implements ModInitializer {
 public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(this::run);}
 private void run(MinecraftServer server){JsonObject result=new JsonObject();try{
  var mapField=net.minecraft.server.players.PlayerList.class.getDeclaredField("playersByUUID");mapField.setAccessible(true);
  @SuppressWarnings("unchecked") var players=(Map<UUID,ServerPlayer>)mapField.get(server.getPlayerList());
  var actor=create(server,"VaultActor");var target=create(server,"VaultTarget");
  players.put(actor.getUUID(),actor);players.put(target.getUUID(),target);server.getPlayerList().getPlayers().add(actor);server.getPlayerList().getPlayers().add(target);
  try{result=new dev.rinorsi.editor.vault.VaultTemplateServerChecks().run(server,actor,target);}finally{players.remove(actor.getUUID());players.remove(target.getUUID());server.getPlayerList().getPlayers().remove(actor);server.getPlayerList().getPlayers().remove(target);}
 }catch(Throwable error){error.printStackTrace();result.addProperty("passed",false);result.addProperty("error",error.toString());}
 finally{try{Files.writeString(Path.of(System.getProperty("cadeditor.vault.probe.receipt")),new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(result));}catch(Exception e){throw new RuntimeException(e);}finally{server.halt(false);}}}
 private ServerPlayer create(MinecraftServer server,String name){var profile=new GameProfile(UUID.randomUUID(),name);var p=new ServerPlayer(server,server.overworld(),profile,ClientInformation.createDefault());p.connection=new RecordingListener(server,p,profile);return p;}
 private static class RecordingListener extends ServerGamePacketListenerImpl {
  RecordingListener(MinecraftServer server,ServerPlayer p,GameProfile profile){super(server,new Connection(PacketFlow.SERVERBOUND),p,CommonListenerCookie.createInitial(profile,false));}
  @Override public void send(Packet<?> packet){}
  @Override public void send(Packet<?> packet,io.netty.channel.ChannelFutureListener listener){}
 }
}
"@ | Set-Content (Join-Path $Work 'adapter/TemplateProbe.java')
$Meta=@{schemaVersion=1;id='cadeditor_vault_template_probe';version='1.0.0';environment='server';entrypoints=@{main=@('dev.rinorsi.editor.vaultprobe.TemplateProbe')};depends=@{fabricloader='>=0.19.5';'fabric-api'='*';minecraft='26.1.2';java='>=25'}}
[IO.File]::WriteAllText((Join-Path $Work 'metadata/fabric.mod.json'),($Meta|ConvertTo-Json -Depth 5))
$Java=Join-Path $env:USERPROFILE '.jdks/jdk-25.0.5+8/bin'
$Cp=($Info.runtime | Where-Object {$_ -notmatch 'mctest.*[.]jar$'}) -join ';'
$CompileArgs=@('-proc:none','-encoding','UTF-8','-cp',$Cp,'-d',(Join-Path $Work 'adapter'),(Join-Path $Work 'adapter/TemplateProbe.java'))
[IO.File]::WriteAllLines((Join-Path $Work 'compile.args'),@($CompileArgs|ForEach-Object {'"'+$_.Replace('\','\\').Replace('"','\"')+'"'}))
& "$Java/javac.exe" ('@'+(Join-Path $Work 'compile.args')) *> (Join-Path $Log 'server-adapter-compile.log')
if($LASTEXITCODE){throw '服务端探针适配器编译失败；server-adapter-compile.log'}
& "$Java/jar.exe" cf (Join-Path $Work 'mods/template-probe.jar') -C (Join-Path $Work 'metadata') fabric.mod.json -C $Info.main dev -C $Info.tests dev -C (Join-Path $Root 'fabric/src/main/resources') META-INF/services -C (Join-Path $Work 'adapter') dev
if($LASTEXITCODE){throw '服务端探针打包失败'}
$Mc=$Info.runtime | Where-Object {$_ -match 'minecraft-merged.*[.]jar$'} | Select-Object -First 1
if(!$Mc){throw '未找到已编译的26.1.2游戏依赖'}
$Receipt=Join-Path $Log 'server-receipt.json'
$JavaArgs=@('-Xmx2G','--enable-native-access=ALL-UNNAMED','-Djava.awt.headless=true','-Dfabric.development=true',('-Dfabric.gameJarPath='+$Mc),('-Dcadeditor.vault.probe.receipt='+$Receipt),'-cp',$Cp,'net.fabricmc.loader.impl.launch.knot.KnotServer','--nogui')
[IO.File]::WriteAllLines((Join-Path $Work 'java.args'),@($JavaArgs|ForEach-Object {'"'+$_.Replace('\','\\').Replace('"','\"')+'"'}))
$Lock=Join-Path $Root 'logs/.gradle.lock.d'
$Deadline=(Get-Date).AddMinutes(40)
while($true){try{New-Item -ItemType Directory -Path $Lock -ErrorAction Stop|Out-Null;break}catch{if(!(Test-Path -LiteralPath $Lock) -or (Get-Date) -gt $Deadline){throw};Start-Sleep -Seconds 5}}
try{Push-Location $Work;& "$Java/java.exe" ('@'+(Join-Path $Work 'java.args')) *> (Join-Path $Log 'server.log');if($LASTEXITCODE){throw '服务端探针未完成；server.log'}}finally{Pop-Location;Remove-Item -LiteralPath $Lock}
if(!(Test-Path $Receipt) -or !(Get-Content $Receipt -Raw|ConvertFrom-Json).passed){throw '服务端探针断言失败；server-receipt.json'}
Write-Output ('PASS authoritative vault template server probe; '+$Receipt)
