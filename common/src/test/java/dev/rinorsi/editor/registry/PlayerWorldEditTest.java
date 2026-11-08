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
        System.out.println("PlayerWorldEditTest: "+checks+" checks passed");
    }
    private static void reject(Runnable r,String code){try{r.run();throw new AssertionError("expected "+code);}catch(EditorSessions.Failure f){check(f.code.equals(code),"error code "+code);}}
    private static void check(boolean b,String message){if(!b)throw new AssertionError(message);checks++;}
}
