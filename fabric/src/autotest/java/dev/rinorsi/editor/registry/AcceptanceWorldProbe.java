package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.client.WorldEditorClient;
import java.util.*;
import java.util.concurrent.*;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.item.*;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.EntityHitResult;

/** Isolated fixture setup, then the unmodified world page/host path, not a direct WorldEditor call. */
final class AcceptanceWorldProbe {
    final JsonArray rows=new JsonArray();
    private int path,round,phase;
    private JsonObject row,edit,pos;
    private BlockPos block;private UUID entity;
    private CompoundTag wanted;private ItemStack chestItem;
    private CompletableFuture<?> setup;
    private long deadline,nextAction;
    private String id;
    boolean tick(Minecraft mc) {
        try{return step(mc);}catch(Exception failure){
            if(row==null){row=new JsonObject();row.addProperty("path",String.valueOf(path));rows.add(row);}
            row.addProperty("failure",failure.toString());advance(mc);return false;
        }
    }
    private boolean step(Minecraft mc)throws Exception {
        if(path==4)return true;
        if(phase==0){
            row=new JsonObject();row.addProperty("path",List.of("chest_container","sign_text","spawner","entity_name").get(path));row.addProperty("round",round+1);rows.add(row);
            block=mc.player.blockPosition().offset(1,0,0);pos=new JsonObject();pos.addProperty("x",block.getX());pos.addProperty("y",block.getY());pos.addProperty("z",block.getZ());
            entity=UUID.randomUUID();
            setup=mc.getSingleplayerServer().submit(()->{var server=mc.getSingleplayerServer();var p=server.getPlayerList().getPlayer(mc.player.getUUID());p.setGameMode(GameType.CREATIVE);var level=p.level();
                if(path<3)level.setBlock(block,(path==0?Blocks.CHEST:path==1?Blocks.OAK_SIGN:Blocks.SPAWNER).defaultBlockState(),3);
                else{var pig=EntityType.PIG.create(level,EntitySpawnReason.COMMAND);pig.setUUID(entity);pig.setPos(p.getX()+1,p.getY(),p.getZ());pig.setNoAi(true);pig.setInvulnerable(true);level.addFreshEntity(pig);}
            });phase=1;deadline=System.nanoTime()+20_000_000_000L;return false;
        }
        if(System.nanoTime()>deadline){row.addProperty("failure","unreachable or timeout phase="+phase);row.addProperty("timeout",true);advance(mc);return false;}
        if(phase==1){if(!setup.isDone()||!mc.player.isCreative())return false;setup.join();if(!open(mc))return false;phase=2;return false;}
        if(phase==2||phase==6){
            if(!(mc.screen instanceof OrielScreen screen)||screen.driver().document()==null||!screen.driver().settled())return false;
            if(phase==2&&System.nanoTime()<nextAction)return false;
            JsonElement w=eval("oriel.data.world||null");if(w.isJsonNull()){row.addProperty("failure","world channel did not open a world page");advance(mc);return false;}
            JsonObject world=w.getAsJsonObject();CompoundTag nbt=(CompoundTag)TagParser.create(NbtOps.INSTANCE).parseFully(world.get("snbt").getAsString());
            if(phase==6){
                boolean equal;
                if(path==0){var slot=world.getAsJsonObject("container").getAsJsonArray("slots").get(0).getAsJsonObject().getAsJsonObject("stack");var actual=StackCodec.decode(slot,mc.level.registryAccess());equal=typed(chestItem,mc).equals(typed(actual,mc));}
                else{String key=path==1?"front_text":path==2?"SpawnCount":"CustomName";equal=Objects.equals(wanted.get(key),nbt.get(key));}
                row.addProperty("reopen_equal",equal);row.addProperty("typed_fidelity",equal);row.add("reopened",world);advance(mc);return false;
            }
            id="world-accept-"+path+"-"+round;edit=new JsonObject();edit.addProperty("requestId",id);edit.add("slot",world.get("slot"));wanted=nbt.copy();
            if(path==0){chestItem=new ItemStack(Items.PAPER,round+2);var data=new CompoundTag();data.putLong("exact",9007199254740993L+round);data.putShort("short",(short)32767);data.putByteArray("bytes",new byte[]{-128,127});chestItem.set(net.minecraft.core.component.DataComponents.CUSTOM_DATA,net.minecraft.world.item.component.CustomData.of(data));var container=new JsonObject();var slots=new JsonArray();var s=new JsonObject();s.addProperty("slot",0);s.add("stack",StackCodec.snapshot(chestItem,mc.level.registryAccess(),new JsonObject(),""));slots.add(s);container.add("slots",slots);edit.add("container",container);}
            else{
                if(path==1){var front=wanted.getCompound("front_text").orElseThrow();var messages=front.getList("messages").orElseThrow();messages.set(0,StringTag.valueOf("自动验收 "+round));}
                else if(path==2)wanted.putShort("SpawnCount",(short)(round+2));
                else wanted.put("CustomName",ComponentSerialization.CODEC.encodeStart(mc.level.registryAccess().createSerializationContext(NbtOps.INSTANCE),Component.literal("自动验收 "+round)).getOrThrow());
                edit.addProperty("snbt",wanted.toString());
            }
            row.add("sent",edit);eval("var acceptWorldResult=null;oriel.on('patch',function(p){if(p.key==='result')acceptWorldResult=p.value;});oriel.send('apply',"+edit+");true");nextAction=System.nanoTime()+650_000_000L;row.addProperty("attempted",true);phase=3;return false;
        }
        if(phase==3){var r=eval("acceptWorldResult||null");if(r.isJsonNull())return false;var result=r.getAsJsonObject();if(!result.get("requestId").getAsString().equals(id))return false;row.add("host_result",result);boolean ok=result.get("status").getAsString().equals("saved");row.addProperty("applied_ok",ok);if(!ok){row.addProperty("failure",result.toString());advance(mc);return false;}mc.setScreen(null);phase=5;return false;}
        if(phase==5){if(open(mc))phase=6;return false;}
        return false;
    }
    private boolean open(Minecraft mc)throws Exception{
        if(System.nanoTime()<nextAction)return false;
        if(path==3){var e=mc.level.entitiesForRendering().iterator();net.minecraft.world.entity.Entity found=null;while(e.hasNext()){var candidate=e.next();if(candidate.getUUID().equals(entity)){found=candidate;break;}}if(found==null)return false;mc.hitResult=new EntityHitResult(found);}
        var m=WorldEditorClient.class.getDeclaredMethod("open",String.class,JsonObject.class);m.setAccessible(true);m.invoke(null,path==3?"entity":"block",path==3?null:pos);nextAction=System.nanoTime()+650_000_000L;return true;
    }
    private void advance(Minecraft mc){mc.setScreen(null);phase=0;if(++round==3){round=0;path++;}}
    private static Tag typed(ItemStack s,Minecraft mc){return ItemStack.CODEC.encodeStart(mc.level.registryAccess().createSerializationContext(NbtOps.INSTANCE),s).getOrThrow();}
    private static JsonElement eval(String js)throws Exception{Object page=((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,js)).orElseThrow();}
}
