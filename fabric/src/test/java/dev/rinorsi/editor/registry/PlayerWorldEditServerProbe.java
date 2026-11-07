package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.network.*;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;

/** Real dedicated ServerLevel + detached ServerPlayer; records send calls, no network client. */
public final class PlayerWorldEditServerProbe implements ModInitializer {
    private final JsonObject receipt=new JsonObject();private int checks;
    public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(this::run);}
    private void run(MinecraftServer server){try{
        var level=server.overworld();level.setChunkForced(0,0,true);level.getChunk(0,0);
        var profile=new GameProfile(UUID.randomUUID(),"CADPlayerProbe");var p=new ServerPlayer(server,level,profile,ClientInformation.createDefault());
        var packets=new ArrayList<String>();p.connection=new RecordingListener(server,p,profile,packets);p.setPos(0.5,65,0.5);p.setHealth(20);
        receipt.addProperty("mode","real dedicated ServerLevel / detached ServerPlayer / recording packet listener (no client)");
        var before=PlayerWorldEdit.save(p);receipt.add("before",PlayerWorldEdit.values(p));
        var next=prepare(p,"{container:{slots:[{slot:0,stack:{id:'minecraft:diamond',count:3,comps:{},removed:{}}}]},ender:{slots:[{slot:26,stack:{id:'minecraft:emerald',count:2,comps:{},removed:{}}}]},SelectedItemSlot:2,Health:12,food:{foodLevel:15,saturation:4},experience:{XpLevel:5,XpP:0.5,XpTotal:70},playerGameType:'creative',Tags:['probe'],CustomName:{text:'Player probe'},active_effects:[{id:'minecraft:speed',duration:200,amplifier:1}],attributes:[{id:'minecraft:max_health',base:24}]}");
        PlayerWorldEdit.write(p,next);
        require(p.getInventory().getItem(0).is(Items.DIAMOND)&&p.getInventory().getItem(0).getCount()==3,"main inventory apply");require(p.getEnderChestInventory().getItem(26).is(Items.EMERALD),"ender apply");
        require(p.getInventory().getSelectedSlot()==2,"selected slot");require(p.getHealth()==12&&p.getFoodData().getFoodLevel()==15&&p.getFoodData().getSaturationLevel()==4,"health food");require(p.experienceLevel==5&&p.totalExperience==70&&p.experienceProgress>0.4&&p.experienceProgress<0.6,"native XP normalization");require(p.gameMode()==GameType.CREATIVE&&p.getAbilities().instabuild&&p.getAbilities().mayfly,"native game mode updates abilities");require(p.getAttributeBaseValue(Attributes.MAX_HEALTH)==24,"attributes apply");require(p.getActiveEffects().size()==1,"effects apply");require(p.entityTags().contains("probe")&&p.getCustomName().getString().equals("Player probe"),"tags and component name");
        PlayerWorldEdit.write(p,prepare(p,"{AbsorptionAmount:2,attributes:[{id:'minecraft:max_absorption',base:4}],abilities:{flying:true,mayfly:true,invulnerable:true,mayBuild:true,instabuild:true,walkSpeed:0.2,flySpeed:0.1}}"));
        require(p.getAbsorptionAmount()==2&&p.getAbilities().flying&&p.getAbilities().getFlyingSpeed()==0.1f&&p.getAbilities().getWalkingSpeed()==0.2f,"absorption and all ability fields");
        var armorPatch=new JsonObject();var rows=new JsonArray();
        for(var entry:net.minecraft.world.entity.player.Inventory.EQUIPMENT_SLOT_MAPPING.int2ObjectEntrySet())if(entry.getValue()==net.minecraft.world.entity.EquipmentSlot.HEAD||entry.getValue()==net.minecraft.world.entity.EquipmentSlot.OFFHAND){var row=new JsonObject();row.addProperty("slot",entry.getIntKey());row.add("stack",JsonParser.parseString("{id:'minecraft:stone',count:1,comps:{},removed:{}}"));rows.add(row);}
        var containerPatch=new JsonObject();containerPatch.add("slots",rows);armorPatch.add("container",containerPatch);PlayerWorldEdit.write(p,prepare(p,armorPatch.toString()));
        require(p.getItemBySlot(net.minecraft.world.entity.EquipmentSlot.HEAD).is(Items.STONE)&&p.getOffhandItem().is(Items.STONE),"actual Inventory equipment mapping writes armor and offhand");
        var modifiers=new JsonArray();modifiers.add(net.minecraft.world.entity.ai.attributes.AttributeModifier.CODEC.encodeStart(level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),new net.minecraft.world.entity.ai.attributes.AttributeModifier(net.minecraft.resources.Identifier.parse("cadeditor:probe"),2,net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE)).getOrThrow());
        var attrRow=new JsonObject();attrRow.addProperty("id","minecraft:max_health");attrRow.add("modifiers",modifiers);var attrRows=new JsonArray();attrRows.add(attrRow);var modifierPatch=new JsonObject();modifierPatch.add("attributes",attrRows);PlayerWorldEdit.write(p,prepare(p,modifierPatch.toString()));require(p.getMaxHealth()==26,"permanent modifiers through native codec");
        receipt.add("after",PlayerWorldEdit.values(p));receipt.add("schema",PlayerWorldEdit.schema(p));
        for(String name:List.of("ClientboundSetPlayerInventoryPacket","ClientboundSetExperiencePacket","ClientboundSetHealthPacket","ClientboundPlayerAbilitiesPacket","ClientboundUpdateAttributesPacket","ClientboundUpdateMobEffectPacket","ClientboundSetHeldSlotPacket"))require(packets.contains(name),"packet dispatched: "+name);
        var opened=PlayerWorldEdit.save(p);p.setPos(1.5,65,0.5);p.getFoodData().addExhaustion(0.1f);p.getFoodData().tick(p);for(var effect:p.getActiveEffects())effect.tickServer(level,p,()->{});var live=PlayerWorldEdit.save(p);
        require(WorldNbt.revision(opened).equals(WorldNbt.revision(live)),"real movement food counter and effect countdown stable");
        var renamed=prepare(p,"{CustomName:{text:'While walking'}}");PlayerWorldEdit.write(p,renamed);require(p.getX()==1.5,"name write retains real position");
        var health=PlayerWorldEdit.save(p);p.setHealth(11);require(!WorldNbt.revision(health).equals(WorldNbt.revision(PlayerWorldEdit.save(p))),"concurrent health conflict");
        var full=PlayerWorldEdit.values(p);int size=p.getInventory().getContainerSize();receipt.addProperty("inventorySize",size);receipt.addProperty("enderSize",p.getEnderChestInventory().getContainerSize());
        for(String patch:List.of("{UUID:'bad'}","{Pos:[0,0,0]}","{Brain:{}}","{food:{foodLevel:21}}","{food:{saturation:21}}","{experience:{XpLevel:-1}}","{experience:{XpP:1}}","{SelectedItemSlot:9}","{abilities:{walkSpeed:-1}}","{abilities:{flySpeed:2}}","{abilities:{flying:1}}","{Health:999}","{playerGameType:'missing'}","{attributes:[{id:'minecraft:missing',base:2}]}","{active_effects:[{id:'minecraft:missing'}]}","{container:{slots:[{slot:-1,stack:{empty:true}}]}}","{container:{slots:[{slot:0,stack:{empty:true}},{slot:0,stack:{empty:true}}]}}","{Tags:['duplicate','duplicate']}"))reject(()->prepare(p,patch),"invalid player patch "+patch);
        reject(()->PlayerWorldEdit.prepare(p,PlayerWorldEdit.save(p),JsonParser.parseString("{snbt:'{}'}").getAsJsonObject()),"raw NBT forbidden");
        var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("dim",level.dimension().identifier().toString());slot.addProperty("player","self");rejectCode(()->WorldTarget.resolve(p,slot),"player_forbidden");slot.addProperty("player","name");slot.addProperty("name","missing");rejectCode(()->WorldTarget.resolve(p,slot),"player_forbidden");
        server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(p.nameAndId(),net.minecraft.server.permissions.LevelBasedPermissionSet.GAMEMASTER,false));
        PlayerWorldEdit.requirePermission(p.permissions());checks++;
        rejectCode(()->WorldTarget.resolve(p,slot),"player_offline");slot.addProperty("player","online");slot.addProperty("uuid",UUID.randomUUID().toString());rejectCode(()->WorldTarget.resolve(p,slot),"player_offline");
        // Test-only list registration avoids a real network login while exercising actual lookup.
        var mapField=net.minecraft.server.players.PlayerList.class.getDeclaredField("playersByUUID");mapField.setAccessible(true);
        @SuppressWarnings("unchecked") var players=(Map<UUID,ServerPlayer>)mapField.get(server.getPlayerList());players.put(p.getUUID(),p);server.getPlayerList().getPlayers().add(p);
        slot.addProperty("player","self");require(WorldTarget.resolve(p,slot).entity==p,"game-master self resolves online list");
        var selfTarget=WorldTarget.resolve(p,slot);var canonical=selfTarget.canonicalSlot();canonical.addProperty("self",true);canonical.addProperty("player","self");var projection=selfTarget.snapshot(canonical,false);require(projection.get("type").getAsString().equals("minecraft:player")&&projection.getAsJsonObject("views").has("player")&&projection.getAsJsonObject("player").get("self").getAsBoolean(),"real player world snapshot");receipt.add("world",projection);
        var other=new ServerPlayer(server,level,new GameProfile(UUID.randomUUID(),"OtherProbe"),ClientInformation.createDefault());other.connection=new RecordingListener(server,other,other.getGameProfile(),packets);other.setPos(p.position());players.put(other.getUUID(),other);server.getPlayerList().getPlayers().add(other);
        slot.addProperty("player","online");slot.addProperty("uuid",other.getStringUUID());require(WorldTarget.resolve(p,slot).entity==other,"game-master other resolves");other.setPos(p.getX()+100,p.getY(),p.getZ());rejectCode(()->WorldTarget.resolve(p,slot),"out_of_reach");
        players.remove(other.getUUID());server.getPlayerList().getPlayers().remove(other);players.remove(p.getUUID());server.getPlayerList().getPlayers().remove(p);
        var undo=PlayerWorldEdit.rebase(opened,before,PlayerWorldEdit.save(p),true);PlayerWorldEdit.write(p,undo);require(p.getInventory().getItem(0).isEmpty()&&p.getEnderChestInventory().getItem(26).isEmpty(),"native inventory undo");require(p.gameMode()==GameType.SURVIVAL&&p.experienceLevel==0&&p.experienceProgress==0&&p.totalExperience==0&&p.getHealth()==20&&p.getActiveEffects().isEmpty(),"native mode XP health effect undo");require(p.getX()==1.5,"undo never teleports");
        receipt.add("undo",PlayerWorldEdit.values(p));var sent=new JsonArray();packets.forEach(sent::add);receipt.add("packets",sent);receipt.addProperty("checks",checks);receipt.addProperty("passed",true);
    }catch(Throwable error){error.printStackTrace();receipt.addProperty("passed",false);receipt.addProperty("error",error.toString());}finally{try{Files.writeString(Path.of(System.getProperty("cadeditor.player.receipt")),new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(receipt));}catch(Exception error){throw new RuntimeException(error);}finally{server.halt(false);}}}
    private net.minecraft.nbt.CompoundTag prepare(ServerPlayer p,String patch){var request=new JsonObject();var e=new JsonObject();e.add("player",JsonParser.parseString(patch));request.add("entity",e);return PlayerWorldEdit.prepare(p,PlayerWorldEdit.save(p),request);}
    private void require(boolean b,String message){if(!b)throw new AssertionError(message);checks++;}
    private void reject(Runnable r,String message){try{r.run();throw new AssertionError("expected rejection: "+message);}catch(RuntimeException expected){checks++;}}
    private void rejectCode(Runnable r,String code){try{r.run();throw new AssertionError("expected "+code);}catch(EditorSessions.Failure error){require(error.code.equals(code),"expected error code "+code+" got "+error.code);}}
    private static final class RecordingListener extends ServerGamePacketListenerImpl {
        private final List<String> packets;
        RecordingListener(MinecraftServer server,ServerPlayer p,GameProfile profile,List<String> packets){super(server,new Connection(PacketFlow.SERVERBOUND),p,CommonListenerCookie.createInitial(profile,false));this.packets=packets;}
        @Override public void send(Packet<?> packet){if(packets!=null)packets.add(packet.getClass().getSimpleName());}
        @Override public void send(Packet<?> packet,io.netty.channel.ChannelFutureListener listener){send(packet);}
    }
}
