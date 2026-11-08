package dev.rinorsi.editor.registry;
import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import net.minecraft.nbt.*;
import net.minecraft.server.permissions.*;
import java.util.*;
/** Pure JVM guards/projection checks; real ServerPlayer receipt is separate. */
public final class PlayerWorldEditTest {
    private static int checks;
    public static void main(String[] args){
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        reject(()->PlayerWorldEdit.requirePermission(PermissionSet.NO_PERMISSIONS),"player_forbidden");
        reject(()->PlayerWorldEdit.requirePermission(LevelBasedPermissionSet.ALL),"player_forbidden");
        reject(()->PlayerWorldEdit.requirePermission(LevelBasedPermissionSet.MODERATOR),"player_forbidden");
        PlayerWorldEdit.requirePermission(LevelBasedPermissionSet.GAMEMASTER);checks++;
        reject(()->PlayerWorldEdit.requireOnline(false),"player_offline");PlayerWorldEdit.requireOnline(true);checks++;
        var schema=PlayerWorldEdit.entitySchema();check(schema.get("available").getAsBoolean(),"player schema without EntityType factory");check(schema.getAsJsonArray("attributes").size()>0,"real Player attributes");
        var base=WorldNbt.parse("{id:'minecraft:player',UUID:'test',Pos:[0d,64d,0d]}");
        var values=JsonParser.parseString("{Health:20,experience:{XpLevel:2,XpP:0.1,XpTotal:20},active_effects:[{id:'minecraft:speed',duration:100,amplifier:0}]} ").getAsJsonObject();
        base=PlayerWorldEdit.with(base,values);var live=base.copy();var current=values.deepCopy();current.getAsJsonObject("experience").addProperty("XpP",0.2);current.getAsJsonArray("active_effects").get(0).getAsJsonObject().addProperty("duration",90);live=PlayerWorldEdit.with(live,current);live.put("Pos",WorldNbt.parse("{p:[2d,64d,0d]}").get("p"));
        check(WorldNbt.revision(base).equals(WorldNbt.revision(live)),"walking XP fraction and effect ticks stable");
        var merged=PlayerWorldEdit.rebase(base,base,live,false);check(PlayerWorldEdit.data(merged).equals(current),"live volatile values preserved");check(merged.get("Pos").equals(live.get("Pos")),"no teleport on edit");
        var undo=PlayerWorldEdit.rebase(base,base,live,true);check(PlayerWorldEdit.data(undo).equals(current),"undo preserves ticking state");
        current.addProperty("Health",19);check(!WorldNbt.revision(base).equals(WorldNbt.revision(PlayerWorldEdit.with(live,current))),"concurrent health conflict");
        var sessions=new WorldEditSessions();var who=UUID.randomUUID();var slot=JsonParser.parseString("{kind:'entity',dim:'minecraft:overworld',uuid:'test',token:'p'}").getAsJsonObject();var openedSession=sessions.open(who,slot,base);var state=sessions.require(who,slot,openedSession.revision,live);state.saved(base,live,false);check(state.preimage().equals(base),"session undo preimage");
        var numeric=new JsonObject();numeric.addProperty("v",Double.NaN);reject(()->PlayerWorldEdit.number(numeric,"v",0,1),"invalid_request");numeric.addProperty("v",-1);reject(()->PlayerWorldEdit.number(numeric,"v",0,1),"invalid_request");numeric.addProperty("v",1);check(PlayerWorldEdit.number(numeric,"v",0,1)==1,"finite boundary accepted");
        var clear=JsonParser.parseString("{op:'player_extended',requestId:'null-roundtrip',action:'apply',target:{uuid:'00000000-0000-0000-0000-000000000001'},view:'respawn',patch:null}").getAsJsonObject();
        check(wire(clear).equals(clear)&&wire(clear).get("patch").isJsonNull(),"respawn clear preserves explicit JSON null");
        var large=clear.deepCopy();large.addProperty("view","offline");large.getAsJsonObject("target").addProperty("offline",true);var snbt=new JsonObject();snbt.addProperty("snbt"," ".repeat(17000)+"{}");large.add("patch",snbt);
        check(JsonParser.parseString(WorldWire.encode(large)).getAsJsonObject().has("worldEncoding"),"large offline request uses bounded compression");
        check(wire(large).equals(large),"compressed player request does not require legacy slot");
        var reply=JsonParser.parseString("{status:'saved',requestId:'null-roundtrip',playerExtended:{value:null,nextOffset:null}}").getAsJsonObject();
        check(wire(reply).equals(reply)&&wire(reply).getAsJsonObject("playerExtended").get("value").isJsonNull(),"respawn reply preserves null value and pagination end");
        advancementDisplay();
        System.out.println("PlayerWorldEditTest: "+checks+" checks passed");
    }
    private static JsonObject wire(JsonObject value){return WorldWire.decode(JsonParser.parseString(WorldWire.encode(value)).getAsJsonObject());}
    private static void advancementDisplay(){
        var builder=net.minecraft.advancements.Advancement.Builder.advancement();
        builder.display(new net.minecraft.advancements.DisplayInfo(new net.minecraft.world.item.ItemStackTemplate(net.minecraft.world.item.Items.STONE),net.minecraft.network.chat.Component.translatable("advancements.story.root.title"),net.minecraft.network.chat.Component.literal("Literal description"),Optional.empty(),net.minecraft.advancements.AdvancementType.TASK,true,true,false));
        var row=new JsonObject();row.addProperty("id","minecraft:story/root");
        PlayerExtendedEditor.advancementDisplay(row,builder.build(net.minecraft.resources.Identifier.parse("test:display")).value());
        check(row.get("has_display").getAsBoolean(),"DisplayInfo flag");
        check(row.get("title_key").getAsString().equals("advancements.story.root.title")&&!row.has("title"),"translatable title key");
        check(row.get("description").getAsString().equals("Literal description")&&!row.has("description_key"),"literal description string");
        var hidden=new JsonObject();hidden.addProperty("id","minecraft:recipes/test");
        PlayerExtendedEditor.advancementDisplay(hidden,net.minecraft.advancements.Advancement.Builder.recipeAdvancement().build(net.minecraft.resources.Identifier.parse("test:recipe")).value());
        check(!hidden.get("has_display").getAsBoolean()&&!hidden.has("title_key")&&!hidden.has("description"),"internal recipe metadata absent");
        var entries=new JsonArray();entries.add(hidden);entries.add(row);var value=new JsonObject();value.add("entries",entries);
        try{
            var method=PlayerExtendedEditor.class.getDeclaredMethod("envelope",UUID.class,boolean.class,String.class,JsonElement.class,JsonObject.class,JsonObject.class,String.class);method.setAccessible(true);
            var request=new JsonObject();request.addProperty("displayed",true);request.addProperty("limit",1);
            var page=(JsonObject)method.invoke(null,UUID.randomUUID(),false,"advancements",value,new JsonObject(),request,"test");
            check(page.get("total").getAsInt()==1&&page.get("nextOffset").isJsonNull(),"displayed total and pagination filtered first");
            check(page.getAsJsonObject("value").getAsJsonArray("entries").get(0).equals(row),"displayed excludes recipe entry");
            request.addProperty("query","recipes/");page=(JsonObject)method.invoke(null,UUID.randomUUID(),false,"advancements",value,new JsonObject(),request,"test");
            check(page.get("total").getAsInt()==0,"query stacks with displayed");
            request.addProperty("displayed",false);request.remove("query");page=(JsonObject)method.invoke(null,UUID.randomUUID(),false,"advancements",value,new JsonObject(),request,"test");
            check(page.get("total").getAsInt()==2&&page.get("nextOffset").getAsInt()==1,"false keeps full list");
            request.remove("displayed");page=(JsonObject)method.invoke(null,UUID.randomUUID(),false,"advancements",value,new JsonObject(),request,"test");
            check(page.get("total").getAsInt()==2,"omitted default keeps full list");
        }catch(ReflectiveOperationException e){throw new AssertionError(e);}
    }
    private static void reject(Runnable r,String code){try{r.run();throw new AssertionError("expected "+code);}catch(EditorSessions.Failure f){check(f.code.equals(code),"error code "+code);}}
    private static void check(boolean b,String message){if(!b)throw new AssertionError(message);checks++;}
}
