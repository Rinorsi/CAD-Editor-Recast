package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.authlib.GameProfile;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.Connection;
import net.minecraft.network.chat.*;
import net.minecraft.network.protocol.*;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.*;
import net.minecraft.server.network.*;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.entity.*;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;

/** Real detached ServerPlayer permission/mode checks, without connecting a client. */
public final class WorldPermissionServerProbe implements ModInitializer {
    private int checks;private final JsonObject receipt=new JsonObject();
    public void onInitialize(){ServerLifecycleEvents.SERVER_STARTED.register(this::run);}
    private void run(MinecraftServer server){try{
        var dedicated=(net.minecraft.server.dedicated.DedicatedServer)server;var l=server.overworld();l.setChunkForced(0,0,true);l.getChunk(0,0);
        var profile=new GameProfile(UUID.randomUUID(),"PermissionProbe");var p=new ServerPlayer(server,l,profile,ClientInformation.createDefault());p.connection=new Sink(server,p,profile);p.setPos(0.5,65,0.5);
        var positions=new ArrayList<BlockPos>();int x=0;
        // Membership comes from vanilla's marker, not a second permission list.
        for(Block block:List.of(Blocks.COMMAND_BLOCK,Blocks.STRUCTURE_BLOCK,Blocks.JIGSAW)){
            require(block instanceof GameMasterBlock,"native game-master marker "+block);var pos=new BlockPos(x++,65,1);l.setBlock(pos,block.defaultBlockState(),3);positions.add(pos);
        }
        var commandCart=net.minecraft.world.entity.EntityTypes.COMMAND_BLOCK_MINECART.create(l,EntitySpawnReason.COMMAND);commandCart.setPos(1,65,1);l.addFreshEntity(commandCart);require(commandCart.getType().onlyOpCanSetNbt(),"native restricted entity metadata");
        var vehicle=net.minecraft.world.entity.EntityTypes.ARMOR_STAND.create(l,EntitySpawnReason.COMMAND);vehicle.setPos(1,65,0);l.addFreshEntity(vehicle);
        var signPos=new BlockPos(1,65,-1);l.setBlock(signPos,Blocks.OAK_SIGN.defaultBlockState(),3);var sign=(SignBlockEntity)l.getBlockEntity(signPos);var signTarget=resolve(p,signPos);
        var commandText=new SignText().setMessage(0,Component.literal("Run command").withStyle(style->style.withClickEvent(new ClickEvent.RunCommand("say permission probe"))));
        var signNbt=signTarget.save();signNbt.put("front_text",SignText.CODEC.encodeStart(l.registryAccess().createSerializationContext(NbtOps.INSTANCE),commandText).getOrThrow());
        var ride=JsonParser.parseString("{action:'add',type:'minecraft:command_block_minecart'}").getAsJsonObject();
        p.setGameMode(GameType.CREATIVE);require(!EditorPolicy.gameMaster(p),"creative without OP has no game-master permission");
        for(var pos:positions)denied(()->resolve(p,pos),"creative no OP block "+pos);
        denied(()->resolve(p,commandCart),"creative no OP command minecart");denied(()->signTarget.checkCommandPrivileges(p,signNbt),"creative no OP executable sign text");denied(()->EntityRiding.apply(p,vehicle,ride,e->{}),"creative no OP restricted passenger");
        // Blank/plain text remains writable; command text is the sensitive operation.
        var plain=signTarget.save();plain.put("front_text",SignText.CODEC.encodeStart(l.registryAccess().createSerializationContext(NbtOps.INSTANCE),new SignText().setMessage(0,Component.literal("Plain"))).getOrThrow());signTarget.checkCommandPrivileges(p,plain);checks++;
        server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(p.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));p.setGameMode(GameType.SURVIVAL);
        require(!p.isCreative()&&EditorPolicy.gameMaster(p),"survival with OP has actual game-master permission");require(!p.canUseGameMasterBlocks(),"vanilla creative-only helper remains false: editor must not use it");
        for(var pos:positions){require(resolve(p,pos).block!=null,"survival OP block accepted "+pos);}
        require(resolve(p,commandCart).entity==commandCart,"survival OP restricted entity accepted");signTarget.checkCommandPrivileges(p,signNbt);checks++;
        var prepared=signTarget.prepare(signNbt,new JsonObject());signTarget.write(prepared);require(sign.getFrontText().hasAnyClickCommands(p),"survival OP executable sign text written through native loader");
        try{EntityRiding.apply(p,vehicle,ride,e->{});checks++;receipt.addProperty("restrictedPassenger","accepted by vanilla riding rules");}catch(EditorSessions.Failure e){require(e.code.equals("ride_rejected"),"survival OP passes permission before vanilla ride check");receipt.addProperty("restrictedPassenger",e.code);}
        for(var mode:List.of(GameType.ADVENTURE,GameType.SPECTATOR)){
            p.setGameMode(mode);require(!p.mayBuild(),"native mode disables mayBuild: "+mode);
            for(var pos:positions)require(resolve(p,pos).block!=null,"GM mode block accepted: "+mode);
            require(resolve(p,commandCart).entity==commandCart,"GM mode entity accepted: "+mode);
        }
        p.setGameMode(GameType.SURVIVAL);p.getAbilities().mayBuild=false;require(resolve(p,signPos).block==sign,"GM explicitly disabled mayBuild accepted");
        // Self mode/abilities mutation must remain undoable through a fresh resolve.
        p.getAbilities().mayBuild=true;
        var mapField=net.minecraft.server.players.PlayerList.class.getDeclaredField("playersByUUID");mapField.setAccessible(true);
        @SuppressWarnings("unchecked") var players=(Map<UUID,ServerPlayer>)mapField.get(server.getPlayerList());players.put(p.getUUID(),p);server.getPlayerList().getPlayers().add(p);
        var selfSlot=new JsonObject();selfSlot.addProperty("kind","entity");selfSlot.addProperty("dim",l.dimension().identifier().toString());selfSlot.addProperty("player","self");
        var self=WorldTarget.resolve(p,selfSlot);var beforeSelf=self.sessionData();
        var selfPatch=JsonParser.parseString("{entity:{player:{playerGameType:'spectator',abilities:{mayBuild:false}}}}").getAsJsonObject();
        self.write(WorldMergePlan.prepare(self,beforeSelf,null,selfPatch).nbt());
        require(p.isSpectator()&&!p.mayBuild(),"native self edit enters spectator with mayBuild false");
        var selfAgain=WorldTarget.resolve(p,selfSlot);require(selfAgain.entity==p,"GM spectator self resolves for subsequent undo");
        var undo=WorldMergePlan.prepare(selfAgain,selfAgain.sessionData(),beforeSelf,new JsonObject());selfAgain.write(undo.nbt());
        require(p.gameMode()==GameType.SURVIVAL&&p.mayBuild(),"native self undo restores mode and abilities");
        players.remove(p.getUUID());server.getPlayerList().getPlayers().remove(p);
        // Border/reach remain independent of the game-master mode exception.
        p.setGameMode(GameType.SPECTATOR);var oldPos=p.position();p.setPos(100,65,100);rejectCode(()->resolve(p,positions.getFirst()),"out_of_reach");p.setPos(oldPos);
        var border=l.getWorldBorder();double bx=border.getCenterX(),bz=border.getCenterZ(),bs=border.getSize();
        try{border.setCenter(1000,1000);border.setSize(16);rejectCode(()->resolve(p,positions.getFirst()),"protected_area");}finally{border.setCenter(bx,bz);border.setSize(bs);}
        // The real dedicated spawn-protection method exempts OP, independently of mode.
        require(dedicated.spawnProtectionRadius()>0,"probe has actual spawn protection enabled");
        var spawn=l.getRespawnData().pos().above();l.getChunk(spawn.getX()>>4,spawn.getZ()>>4);l.setBlock(spawn,Blocks.CHEST.defaultBlockState(),3);p.setPos(spawn.getX()+0.5,spawn.getY(),spawn.getZ()+0.5);
        require(!server.isUnderSpawnProtection(l,spawn,p)&&l.mayInteract(p,spawn),"vanilla OP exemption from spawn protection");require(resolve(p,spawn).block!=null,"GM spectator at protected spawn accepted by vanilla exemption");
        server.getPlayerList().getOps().remove(p.nameAndId());p.setGameMode(GameType.CREATIVE);
        require(!EditorPolicy.gameMaster(p),"OP removal removes actual game-master permission");
        require(server.isUnderSpawnProtection(l,spawn,p)==!server.getPlayerList().getOps().isEmpty(),"native protection follows actual OP-list semantics");
        // A separate OP keeps vanilla protection enabled for this non-OP player.
        server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(new net.minecraft.server.players.NameAndId(UUID.randomUUID(),"OtherOp"),LevelBasedPermissionSet.GAMEMASTER,false));
        rejectCode(()->resolve(p,spawn),"protected_area");
        var outside=l.getRespawnData().pos().offset(dedicated.spawnProtectionRadius()+32,1,0);l.getChunk(outside.getX()>>4,outside.getZ()>>4);l.setBlock(outside,Blocks.CHEST.defaultBlockState(),3);p.setPos(outside.getX()+0.5,outside.getY(),outside.getZ()+0.5);require(l.mayInteract(p,outside),"non-OP mode checks isolated outside spawn protection");
        p.setGameMode(GameType.ADVENTURE);rejectCode(()->resolve(p,outside),"protected_area");
        p.setGameMode(GameType.SPECTATOR);rejectCode(()->resolve(p,outside),"not_allowed");
        p.setGameMode(GameType.CREATIVE);p.getAbilities().mayBuild=false;rejectCode(()->resolve(p,outside),"protected_area");
        receipt.addProperty("scope","Real ServerLevel / detached ServerPlayer: GM survival/adventure/spectator and disabled mayBuild accepted, self spectator undo succeeds; no-GM restrictions, border/reach and native OP spawn-protection semantics retained; no client network");receipt.addProperty("passed",true);
    }catch(Throwable e){e.printStackTrace();receipt.addProperty("passed",false);receipt.addProperty("error",e.toString());}finally{try{receipt.addProperty("checks",checks);Files.writeString(Path.of(System.getProperty("cadeditor.permission.receipt")),new GsonBuilder().setPrettyPrinting().create().toJson(receipt));}catch(Exception e){throw new RuntimeException(e);}finally{server.halt(false);}}}
    private WorldTarget resolve(ServerPlayer p,BlockPos pos){var slot=new JsonObject();slot.addProperty("kind","block");slot.addProperty("dim",p.level().dimension().identifier().toString());slot.addProperty("x",pos.getX());slot.addProperty("y",pos.getY());slot.addProperty("z",pos.getZ());return WorldTarget.resolve(p,slot);}
    private WorldTarget resolve(ServerPlayer p,Entity entity){var slot=new JsonObject();slot.addProperty("kind","entity");slot.addProperty("dim",p.level().dimension().identifier().toString());slot.addProperty("uuid",entity.getStringUUID());return WorldTarget.resolve(p,slot);}
    private void require(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
    private void denied(Runnable action,String message){try{action.run();throw new AssertionError("expected not_allowed: "+message);}catch(EditorSessions.Failure e){require(e.code.equals("not_allowed"),message+": "+e.code);}}
    private void rejectCode(Runnable action,String code){try{action.run();throw new AssertionError("expected "+code);}catch(EditorSessions.Failure e){require(e.code.equals(code),"expected "+code+", got "+e.code);}}
    private static final class Sink extends ServerGamePacketListenerImpl {
        Sink(MinecraftServer s,ServerPlayer p,GameProfile profile){super(s,new Connection(PacketFlow.SERVERBOUND),p,CommonListenerCookie.createInitial(profile,false));}
        @Override public void send(Packet<?> packet){}
        @Override public void send(Packet<?> packet,io.netty.channel.ChannelFutureListener listener){}
    }
}
