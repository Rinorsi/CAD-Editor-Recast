package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.*;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.testing.TooltipFixtures;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.*;

/** Opt-in hidden true Document -> tooltip channel -> vanilla current-world/player comparison. */
public final class TooltipProbe implements ClientModInitializer {
    private OrielScreen screen;private Object proceeded;private boolean sent,finished;private int step;
    private final long started=System.nanoTime();private final JsonObject receipt=new JsonObject();
    private List<Map.Entry<String,ItemStack>> cases;
    public void onInitializeClient(){ClientTickEvents.END_CLIENT_TICK.register(this::tick);}
    private void tick(Minecraft mc){try{
        if(finished){if(mc.level!=null)mc.disconnectWithSavingScreen();else if(mc.getSingleplayerServer()==null)mc.stop();return;}
        if(System.nanoTime()-started>240_000_000_000L)throw new AssertionError("timeout step "+step);
        if(mc.level==null||mc.player==null){if(mc.screen!=null&&mc.screen!=proceeded&&(mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen||mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen))for(var child:mc.screen.children())if(child instanceof net.minecraft.client.gui.components.Button b){String l=b.getMessage().getString();if(l.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())||l.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())){proceeded=mc.screen;b.onPress(null);break;}}return;}
        if(screen==null){if(mc.screen!=null)return;cases=new ArrayList<>(TooltipFixtures.create(mc.level.registryAccess()).entrySet());screen=OrielScreens.openInline("<html><body><script>var results={},events=[];oriel.on('patch',function(p){if(p.key==='tooltip.result'){results[p.value.requestId]=p.value;events.push(p.value);}});</script></body></html>",new JsonObject());RegistryBridge.attach(screen.driver());return;}
        if(screen.driver().document()==null||!screen.driver().settled())return;
        int count=cases.size()*2;String id="tooltip-"+step;
        if(!sent){JsonObject request=new JsonObject();request.addProperty("requestId",id);request.addProperty("view","preview");
            if(step<count){request.add("stack",StackCodec.snapshot(cases.get(step/2).getValue(),mc.level.registryAccess(),new JsonObject(),""));request.addProperty("advanced",step%2==1);}
            else if(step==count){JsonObject invalid=StackCodec.snapshot(new ItemStack(Items.PAPER),mc.level.registryAccess(),new JsonObject(),"");invalid.getAsJsonObject("comps").addProperty("example:not_installed",1);request.add("stack",invalid);}
            else if(step==count+1){request.addProperty("cancel",true);}
            else {request.add("stack",StackCodec.snapshot(new ItemStack(Items.DIAMOND_SWORD),mc.level.registryAccess(),new JsonObject(),""));JsonObject old=request.deepCopy();old.addProperty("requestId","stale");eval("oriel.send('tooltip',"+old+");true");}
            eval("oriel.send('tooltip',"+request+");true");sent=true;return;
        }
        JsonElement value=eval("results["+new JsonPrimitive(id)+"]||null");if(value.isJsonNull())return;JsonObject result=value.getAsJsonObject();receipt.add(id,result);
        if(step<count){check(result.get("ok").getAsBoolean(),"ok_"+id);ItemStack stack=cases.get(step/2).getValue();var vanilla=stack.getTooltipLines(Item.TooltipContext.of(mc.level),mc.player,step%2==1?TooltipFlag.ADVANCED:TooltipFlag.NORMAL);JsonArray lines=result.getAsJsonArray("lines");check(lines.size()==vanilla.size(),"line_count_"+id);for(int i=0;i<vanilla.size();i++){JsonArray actual=lines.get(i).getAsJsonArray();JsonArray expected=TooltipPreview.flatten(vanilla.get(i));check(actual.equals(expected),"visual_runs_"+id+"_"+i);}check(result.toString().length()<=24000,"bound_"+id);}
        else if(step==count)check(result.get("error").getAsString().equals("INVALID_STACK"),"unknown_component_safe");
        else if(step==count+1)check(result.get("cancelled").getAsBoolean(),"cancel_reply");
        else {check(result.get("ok").getAsBoolean(),"latest_result");check(eval("!events.some(function(r){return r.requestId==='stale';})").getAsBoolean(),"latest_wins");check(screen.driver().pageErrorCount()==0,"zero_page_errors");receipt.addProperty("status","PASSED");write(mc);finished=true;return;}
        step++;sent=false;
    }catch(Throwable error){error.printStackTrace();receipt.addProperty("status","FAILED");receipt.addProperty("error",error.toString());write(mc);finished=true;}}
    private JsonElement eval(String js)throws Exception{Object page=((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,js)).orElseThrow();}
    private void check(boolean ok,String key){if(!ok)throw new AssertionError(key);receipt.addProperty(key,true);}
    private void write(Minecraft mc){try{Files.writeString(mc.gameDirectory.toPath().resolve("tooltip-verification.json"),receipt.toString());}catch(Exception e){throw new RuntimeException(e);}}
}
