package dev.rinorsi.editor.registry;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.*;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.StackCodec;
import java.util.*;
import net.minecraft.client.Minecraft;

/** Local read-only preview. Coalesce before decode, run vanilla on the client, never mutate inventory. */
public final class TooltipChannel {
    private static final Map<DocumentDriver,State> STATES=new WeakHashMap<>();
    private static boolean initialized;
    private static final class State {Object document;long second;int requests;final LinkedHashMap<String,Pending> views=new LinkedHashMap<>();}
    private record Pending(String id,JsonObject stack,boolean advanced,Object level,boolean cancel){}
    private TooltipChannel(){}
    public static void attach(DocumentDriver driver){
        if(driver.serverSession()||STATES.containsKey(driver))return;
        STATES.put(driver,new State());driver.onMessage("tooltip",value->accept(driver,value));driver.onClose(()->STATES.remove(driver));
        if(!initialized){initialized=true;ClientPlatform.get().onTick(mc->tick());}
    }
    private static void accept(DocumentDriver driver,JsonElement value){
        var mc=Minecraft.getInstance();
        // The local message dispatcher normally invokes on the client. Preserve ownership if that changes.
        if(!mc.isSameThread()){mc.execute(()->accept(driver,value));return;}
        State state=STATES.get(driver);if(state==null||driver.serverSession())return;
        if(state.document!=driver.document()){state.document=driver.document();state.views.clear();state.requests=0;}
        String id="";
        try{
            if(value==null||!value.isJsonObject()||value.toString().length()>8192)throw new IllegalArgumentException("BAD_REQUEST");
            JsonObject request=value.getAsJsonObject();id=text(request,"requestId",null);String view=text(request,"view","tooltip");
            if(id==null||id.isEmpty()||id.length()>128||view.isEmpty()||view.length()>128)throw new IllegalArgumentException("BAD_REQUEST");
            for(String field:List.of("advanced","cancel"))if(request.has(field)&&(!request.get(field).isJsonPrimitive()||!request.getAsJsonPrimitive(field).isBoolean()))throw new IllegalArgumentException("BAD_REQUEST");
            if(!state.views.containsKey(view)&&state.views.size()>=8){error(driver,id,"BUSY","最多使用8个固定tooltip view");return;}
            long second=System.nanoTime()/1_000_000_000L;if(state.second!=second){state.second=second;state.requests=0;}
            // A newer request cancels the old view even if the new request is rejected by rate limits.
            state.views.put(view,null);
            if(request.has("cancel")&&request.get("cancel").getAsBoolean()){state.views.put(view,new Pending(id,null,false,mc.level,true));return;}
            if(++state.requests>20){error(driver,id,"BUSY","每秒最多20次tooltip请求，请稍后重试");return;}
            if(mc.level==null||mc.player==null){error(driver,id,"UNAVAILABLE","当前未进入世界");return;}
            if(!request.has("stack")||!request.get("stack").isJsonObject())throw new IllegalArgumentException("BAD_REQUEST");
            state.views.put(view,new Pending(id,request.getAsJsonObject("stack").deepCopy(),request.has("advanced")&&request.get("advanced").getAsBoolean(),mc.level,false));
        }catch(RuntimeException invalid){error(driver,id,"BAD_REQUEST","tooltip请求字段或大小无效");}
    }
    private static String text(JsonObject request,String name,String fallback){
        if(!request.has(name))return fallback;var value=request.get(name);if(!value.isJsonPrimitive()||!value.getAsJsonPrimitive().isString())throw new IllegalArgumentException("BAD_REQUEST");return value.getAsString();
    }
    private static void tick(){
        var mc=Minecraft.getInstance();int delivered=0;
        for(var entry:List.copyOf(STATES.entrySet())){var driver=entry.getKey();var state=entry.getValue();
            if(STATES.get(driver)!=state)continue;
            if(state.document!=driver.document()){state.views.clear();state.document=driver.document();state.requests=0;continue;}
            for(var view:new ArrayList<>(state.views.entrySet())){
                Pending pending=view.getValue();if(pending==null)continue;if(delivered>=2)return;
                Object document=state.document;delivered++;
                // Retain identity while vanilla runs; mod callbacks may enqueue a newer request.
                if(pending.cancel()){state.views.put(view.getKey(),null);JsonObject result=base(pending.id());result.addProperty("ok",true);result.addProperty("cancelled",true);driver.patch("tooltip.result",result);continue;}
                if(mc.level==null||mc.player==null||mc.level!=pending.level()){state.views.put(view.getKey(),null);error(driver,pending.id(),"UNAVAILABLE","世界已退出或切换，请重新请求");continue;}
                net.minecraft.world.item.ItemStack stack;
                try{stack=StackCodec.decode(pending.stack(),mc.level.registryAccess());}
                catch(RuntimeException invalid){if(STATES.get(driver)==state&&driver.document()==document&&state.views.get(view.getKey())==pending){state.views.put(view.getKey(),null);error(driver,pending.id(),"INVALID_STACK",reason(invalid));}continue;}
                try{JsonObject result=TooltipPreview.render(pending.id(),stack,net.minecraft.world.item.Item.TooltipContext.of(mc.level),mc.player,pending.advanced());
                    if(STATES.get(driver)==state&&driver.document()==document&&state.document==document&&mc.level==pending.level()&&state.views.get(view.getKey())==pending){state.views.put(view.getKey(),null);driver.patchJson("tooltip.result",result.toString());}
                }catch(RuntimeException failure){if(STATES.get(driver)==state&&driver.document()==document&&state.views.get(view.getKey())==pending){state.views.put(view.getKey(),null);error(driver,pending.id(),"TOOLTIP_FAILED",reason(failure));}}
            }
        }
    }
    private static String reason(RuntimeException failure){String message=failure.getMessage();if(message==null)message=failure.getClass().getSimpleName();return message.substring(0,Math.min(512,message.length()));}
    private static JsonObject base(String id){JsonObject out=new JsonObject();out.addProperty("version",1);out.addProperty("requestId",id);return out;}
    private static void error(DocumentDriver driver,String id,String code,String reason){JsonObject out=base(id);out.addProperty("ok",false);out.addProperty("error",code);out.addProperty("reason",reason);driver.patch("tooltip.result",out);}
}
