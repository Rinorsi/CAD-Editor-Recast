package dev.rinorsi.editor.registry;
import com.google.gson.*;
import java.nio.file.Files;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import dev.oriel.mod.client.*;
public final class TimelineProbe implements ClientModInitializer {
 private long start=System.nanoTime(),phaseStart; private OrielScreen screen; private int stage; private boolean finished; private Object proceeded;
 private final JsonObject receipt=new JsonObject();
 public void onInitializeClient(){ClientTickEvents.END_CLIENT_TICK.register(this::tick);}
 private void tick(Minecraft mc){try {
  if(finished){if(mc.level!=null)mc.disconnectWithSavingScreen();else if(mc.getSingleplayerServer()==null)mc.stop();return;}
  if(System.nanoTime()-start>260_000_000_000L)throw new IllegalStateException("timeout stage="+stage);
  if(mc.level==null||mc.player==null){if(mc.screen!=null&&mc.screen!=proceeded&&(mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen||mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen)){for(var child:mc.screen.children())if(child instanceof net.minecraft.client.gui.components.Button b){String l=b.getMessage().getString();if(l.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())||l.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())){proceeded=mc.screen;b.onPress(null);break;}}}return;}
  if(stage==0){TimelineTrace.event("world_observed","");stage=1;}
  if(stage==1){if(mc.screen!=null)return; TimelineTrace.event("open","");JsonObject data=new JsonObject();data.add("stack",dev.rinorsi.editor.StackCodec.snapshot(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.CHEST),mc.level.registryAccess(),new JsonObject(),"probe"));screen=OrielScreens.open("cadeditor:ui/index.html",data);RegistryBridge.attach(screen.driver());stage=2;phaseStart=System.nanoTime();return;}
  if(stage==6){if(System.nanoTime()-phaseStart<1_000_000_000L)return;TimelineTrace.event("reopen","");JsonObject data=new JsonObject();data.add("stack",dev.rinorsi.editor.StackCodec.snapshot(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.CHEST),mc.level.registryAccess(),new JsonObject(),"probe"));screen=OrielScreens.open("cadeditor:ui/index.html",data);RegistryBridge.attach(screen.driver());stage=7;phaseStart=System.nanoTime();return;}
  if(screen.driver().document()==null||!screen.driver().settled())return;
  if(stage==7){if(!eval("Reg.meta&&TL.pages.length>20&&Object.keys(Reg.meta.counts).every(function(k){var r=Reg.kinds[k];return r&&r.done&&r.entries.filter(Boolean).length===Reg.meta.counts[k];})").getAsBoolean())return;var last=TimelineTrace.events.get(TimelineTrace.events.size()-1).getAsJsonObject();if((System.nanoTime()-TimelineTrace.start)/1e6-last.get("t_ms").getAsDouble()<1800)return;receipt.add("reopen",eval("JSON.parse(JSON.stringify(TL))"));receipt.add("final_performance",RegistryBridge.performance());receipt.addProperty("page_errors",screen.driver().pageErrorCount());receipt.addProperty("status","PASSED");write(mc);finished=true;return;}
  if(stage==2){if(!RegistryBridge.performance().get("complete").getAsBoolean())return;if(!receipt.has("warmup")){receipt.add("warmup",RegistryBridge.performance());TimelineTrace.event("warmup_observed_complete","");}if(System.nanoTime()-phaseStart<8_000_000_000L)return;
   if(!eval("Reg.meta&&TL.pages.length>20&&Object.keys(Reg.meta.counts).every(function(k){var r=Reg.kinds[k];return r&&r.done&&r.entries.filter(Boolean).length===Reg.meta.counts[k];})").getAsBoolean())return;
   var last=TimelineTrace.events.isEmpty()?null:TimelineTrace.events.get(TimelineTrace.events.size()-1).getAsJsonObject();if(last!=null&&(System.nanoTime()-TimelineTrace.start)/1e6-last.get("t_ms").getAsDouble()<1800)return;
   receipt.add("boot",eval("JSON.parse(JSON.stringify(TL))"));TimelineTrace.event("interaction_world","");eval("TL.phase='world';UI.tab='u-world';drawTabbar();drawTabBody();true");stage=3;phaseStart=System.nanoTime();return;}
  if(System.nanoTime()-phaseStart<4_000_000_000L)return;
  if(stage==3){receipt.add("world",eval("JSON.parse(JSON.stringify(TL))"));eval("TL.phase='sound';openSoundPicker({current:'',onConfirm:function(){}});true");TimelineTrace.event("interaction_sound","");stage=4;phaseStart=System.nanoTime();return;}
  if(stage==4){receipt.add("sound",eval("JSON.parse(JSON.stringify(TL))"));eval("closeModal();TL.phase='item';openRegPick({reg:'item',onPick:function(){}});true");TimelineTrace.event("interaction_item","");stage=5;phaseStart=System.nanoTime();return;}
  if(stage==5){receipt.add("page",eval("JSON.parse(JSON.stringify(TL))"));eval("closeModal();TL.phase='demand_probe';Reg.blockProps('minecraft:oak_log');Reg.options('loot_table');Reg.options('recipe');true");stage=8;phaseStart=System.nanoTime();return;}
  if(stage==8){receipt.add("demand",eval("JSON.parse(JSON.stringify(TL))"));receipt.addProperty("first_page_errors",screen.driver().pageErrorCount());mc.setScreen(null);screen=null;stage=6;phaseStart=System.nanoTime();return;}
 }catch(Throwable e){e.printStackTrace();receipt.addProperty("status","FAILED");receipt.addProperty("error",e.toString());write(mc);finished=true;}}
 private JsonElement eval(String s)throws Exception{Object page=((java.util.Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((java.util.Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,s)).orElseThrow();}
 private void write(Minecraft mc){try{TimelineTrace.finish();receipt.add("events",TimelineTrace.events);receipt.add("sources",TimelineTrace.sources);Files.writeString(mc.gameDirectory.toPath().resolve("registry-timeline.json"),receipt.toString());}catch(Exception e){throw new RuntimeException(e);}}
}
