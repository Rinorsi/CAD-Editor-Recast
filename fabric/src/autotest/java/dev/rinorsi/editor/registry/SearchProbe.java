package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.*;
import java.nio.file.Files;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;

/** Separate hidden-client probe. No system input, clipboard, item edits or visible UI. */
public final class SearchProbe implements ClientModInitializer {
    private OrielScreen screen;private int step;private boolean sent,finished;private Object proceeded;
    private long started=System.nanoTime(),requestTime;private final JsonObject receipt=new JsonObject();
    private final String[] queries={
        "{requestId:'empty',kind:'items',query:'',limit:12}",
        "{requestId:'chinese',kind:'items',query:'钻石剑',limit:12}",
        "{requestId:'pinyin',kind:'items',query:'zuansj',limit:12}",
        "{requestId:'initial',kind:'items',query:'zsj',limit:80}",
        "{requestId:'english',kind:'items',query:'diamond sword',limit:12}",
        "{requestId:'tag',kind:'items',query:'diamond',limit:12,filters:{tags:['minecraft:swords']}}",
        "{requestId:'tags',kind:'tags:item',query:'',limit:12}",
        "{requestId:'models',kind:'item_model',query:'diamond_sword',limit:12}",
        "{requestId:'loot',kind:'loot_table',query:'chests',limit:12}",
        "{requestId:'recipes',kind:'recipe',query:'diamond_sword',limit:12}",
        "{requestId:'latest',view:'cancel-test',kind:'items',query:'diamond_sword',limit:12}",
        "{requestId:'unknown',kind:'nonsense:missing',query:'',limit:12}"
    };
    private final String[] ids={"empty","chinese","pinyin","initial","english","tag","tags","models","loot","recipes","latest","unknown"};
    public void onInitializeClient(){ClientTickEvents.END_CLIENT_TICK.register(this::tick);}
    private void tick(Minecraft mc){try{
        if(finished){if(mc.level!=null)mc.disconnectWithSavingScreen();else if(mc.getSingleplayerServer()==null)mc.stop();return;}
        if(System.nanoTime()-started>240_000_000_000L)throw new AssertionError("timeout step "+step);
        if(mc.level==null||mc.player==null){if(mc.screen!=null&&mc.screen!=proceeded&&(mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen||mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen))for(var child:mc.screen.children())if(child instanceof net.minecraft.client.gui.components.Button b){String l=b.getMessage().getString();if(l.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())||l.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())){proceeded=mc.screen;b.onPress(null);break;}}return;}
        if(screen==null){if(mc.screen!=null)return;screen=OrielScreens.openInline("<html><body><script>var results={},events=[];oriel.on('patch',function(p){if(p.key==='search.result'){events.push(p.value);if(p.value.ready||p.value.error)results[p.value.requestId]=p.value;}});</script></body></html>",new JsonObject());RegistryBridge.attach(screen.driver());return;}
        if(screen.driver().document()==null||!screen.driver().settled())return;
        if(!sent){if(step==10)eval("oriel.send('search',{requestId:'stale',view:'cancel-test',kind:'items',query:'s',limit:80});true");eval("oriel.send('search',"+queries[step]+");true");sent=true;requestTime=System.nanoTime();return;}
        JsonElement value=eval("results["+new JsonPrimitive(ids[step])+"]||null");if(value.isJsonNull())return;JsonObject result=value.getAsJsonObject();
        receipt.add(ids[step],result.deepCopy());
        if(step==11)check(result.has("error")&&result.get("error").getAsString().equals("UNKNOWN_KIND"),"unknown_kind_error");
        else{
            check(result.get("ready").getAsBoolean()&&!result.has("error"),ids[step]+"_ready");check(!result.getAsJsonArray("entries").isEmpty(),ids[step]+"_nonempty");
            check(result.getAsJsonArray("entries").size()<=(step==3?80:12)&&result.toString().length()<=24000,ids[step]+"_bounded");
            if(step>=1&&step<=5||step==10)check(result.getAsJsonArray("entries").toString().contains("minecraft:diamond_sword"),ids[step]+"_diamond_sword");
        }
        JsonObject observation=result.deepCopy();observation.addProperty("wall_ms",(System.nanoTime()-requestTime)/1e6);receipt.add(ids[step],observation);
        step++;sent=false;if(step<queries.length)return;
        check(eval("!events.some(function(e){return e.requestId==='stale'&&e.ready;})").getAsBoolean(),"superseded_response_suppressed");
        check(eval("events.some(function(e){return e.ready===false&&!e.error;})").getAsBoolean(),"not_ready_acknowledged");
        check(screen.driver().pageErrorCount()==0,"page_errors_zero");receipt.addProperty("status","PASSED");write(mc);finished=true;
    }catch(Throwable error){error.printStackTrace();receipt.addProperty("status","FAILED");receipt.addProperty("error",error.toString());write(mc);finished=true;}}
    private JsonElement eval(String js)throws Exception{Object page=((java.util.Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((java.util.Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,js)).orElseThrow();}
    private void check(boolean ok,String name){if(!ok)throw new AssertionError(name);receipt.addProperty(name,true);}
    private void write(Minecraft mc){try{Files.writeString(mc.gameDirectory.toPath().resolve("search-verification.json"),receipt.toString());}catch(Exception e){throw new RuntimeException(e);}}
}
