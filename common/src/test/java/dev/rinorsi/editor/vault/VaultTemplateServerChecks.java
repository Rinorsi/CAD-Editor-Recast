package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.Container;
import net.minecraft.world.item.*;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;

/** Dedicated-server probe body. A test-only loader adapter creates the detached online players. */
public final class VaultTemplateServerChecks {
    private int checks;
    private final JsonObject receipt = new JsonObject();
    private void check(boolean b,String label){if(!b)throw new AssertionError(label);checks++;System.out.println("PASS "+label);}
    private JsonObject call(ServerPlayer actor,JsonObject r) throws Exception {
        Thread.sleep(550); // Real world route's per-player half-second window, never weaken it.
        var replies=new ArrayList<JsonObject>();
        check(WorldEditor.route(actor,r,()->new EditorPolicy(4,false),replies::add),"world route handles template request");
        check(replies.size()==1,"one authoritative receipt");return replies.getFirst();
    }
    private JsonObject request(String op,JsonObject slot){var r=new JsonObject();r.addProperty("op",op);r.addProperty("requestId",UUID.randomUUID().toString());r.add("slot",slot);return r;}
    private JsonObject open(ServerPlayer actor,JsonObject slot) throws Exception {var r=call(actor,request("open",slot));check(r.get("status").getAsString().equals("opened"),"target opened: "+r);return r.getAsJsonObject("world");}
    private JsonObject apply(ServerPlayer actor,JsonObject world,JsonObject entry) throws Exception {var r=request("apply",world.getAsJsonObject("slot"));r.add("revision",world.get("revision"));var spec=new JsonObject();spec.add("kind",entry.get("kind"));spec.add("template",entry.get("template"));r.add("vault_template",spec);return call(actor,r);}
    private JsonObject save(VaultStore store,VaultStore.Validator validator,String kind,JsonObject world) {var r=new JsonObject();r.addProperty("op","save");r.addProperty("kind",kind);r.add("world",world);if(kind.equals("player_preset")){var sections=new JsonArray();new TreeSet<>(VaultTemplates.SECTIONS).forEach(sections::add);r.add("sections",sections);}return store.execute(r,validator).getAsJsonObject("entry");}
    private JsonObject get(VaultStore store,VaultStore.Validator validator,JsonObject row){var r=new JsonObject();r.addProperty("op","get");var ids=new JsonArray();ids.add(row.get("id"));r.add("ids",ids);return store.execute(r,validator).getAsJsonArray("entries").get(0).getAsJsonObject();}
    public JsonObject run(MinecraftServer server,ServerPlayer actor,ServerPlayer target) throws Exception {
        var level=server.overworld();var pos=new BlockPos(1,65,0);level.getChunk(0,0);level.setBlock(pos,Blocks.CHEST.defaultBlockState(),3);
        actor.setPos(.5,65,.5);target.setPos(.5,65,1.5);actor.setGameMode(GameType.SURVIVAL);
        var slot=new JsonObject();slot.addProperty("kind","block");slot.addProperty("dim",level.dimension().identifier().toString());slot.addProperty("x",pos.getX());slot.addProperty("y",pos.getY());slot.addProperty("z",pos.getZ());
        var denied=call(actor,request("open",slot));check(denied.get("status").getAsString().equals("rejected"),"unprivileged survival cannot open block");
        server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(actor.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
        ((Container)level.getBlockEntity(pos)).setItem(0,PermissionTest.typed());
        var source=open(actor,slot);var file=Files.createTempDirectory("vault-server-templates-").resolve("vault.json");var access=level.registryAccess();VaultStore.Validator validator=s->VaultStacks.validate(s,access);
        JsonObject blockRow,playerRow;
        var playerSlot=new JsonObject();playerSlot.addProperty("kind","entity");playerSlot.addProperty("dim",level.dimension().identifier().toString());playerSlot.addProperty("player","online");playerSlot.addProperty("uuid",target.getStringUUID());
        target.getInventory().setItem(0,PermissionTest.typed());target.getEnderChestInventory().setItem(0,new ItemStack(Items.EMERALD,3));
        for(var e:net.minecraft.world.entity.player.Inventory.EQUIPMENT_SLOT_MAPPING.int2ObjectEntrySet())target.getInventory().setItem(e.getIntKey(),new ItemStack(Items.DIAMOND));
        var effect=BuiltInRegistries.MOB_EFFECT.listElements().findFirst().orElseThrow();target.addEffect(new net.minecraft.world.effect.MobEffectInstance(effect,300,0));target.setGameMode(GameType.CREATIVE);
        var playerSource=open(actor,playerSlot);
        try(var store=new VaultStore(file,1,"probe",null,System::currentTimeMillis)){blockRow=save(store,validator,"block",source);playerRow=save(store,validator,"player_preset",playerSource);check(store.flushNow(),"server snapshots persisted");}
        try(var store=new VaultStore(file,1,"probe",null,System::currentTimeMillis)){
            var blockEntry=get(store,validator,blockRow);var playerEntry=get(store,validator,playerRow);
            ((Container)level.getBlockEntity(pos)).clearContent();var destination=open(actor,slot);var result=apply(actor,destination,blockEntry);check(result.get("status").getAsString().equals("saved"),"block template saved: "+result);check(WorldNbt.parse(source.get("snbt").getAsString()).equals(level.getBlockEntity(pos).saveWithFullMetadata(access)),"store reopen apply exact block NBT");
            var undo=request("undo",result.getAsJsonObject("world").getAsJsonObject("slot"));undo.add("revision",result.getAsJsonObject("world").get("revision"));check(call(actor,undo).get("status").getAsString().equals("saved"),"template uses existing undo");check(((Container)level.getBlockEntity(pos)).getItem(0).isEmpty(),"undo restored previous chest");
            level.setBlock(pos,Blocks.TRAPPED_CHEST.defaultBlockState(),3);var wrong=open(actor,slot);var mismatch=apply(actor,wrong,blockEntry);check(mismatch.get("code").getAsString().equals("block_type_mismatch"),"server rejects same BE but different block registry ID");check(((Container)level.getBlockEntity(pos)).getItem(0).isEmpty(),"type rejection leaves target unchanged");
            target.getInventory().clearContent();target.getEnderChestInventory().clearContent();target.removeAllEffects();target.setGameMode(GameType.SURVIVAL);var playerDest=open(actor,playerSlot);var playerSaved=apply(actor,playerDest,playerEntry);check(playerSaved.get("status").getAsString().equals("saved"),"player template saved: "+playerSaved);
            var recapture=new JsonObject();recapture.add("world",playerSaved.get("world"));var parts=new JsonArray();new TreeSet<>(VaultTemplates.SECTIONS).forEach(parts::add);recapture.add("sections",parts);check(VaultTemplates.capture("player_preset",recapture).toString().equals(playerEntry.get("template").toString()),"store reopen native player writes recapture exact");
            receipt.add("blockSaved",result);receipt.add("playerSaved",playerSaved);receipt.add("typeRejected",mismatch);
            var authorized=open(actor,playerSlot);server.getPlayerList().getOps().remove(actor.nameAndId());var before=PlayerWorldEdit.save(target);var forbidden=apply(actor,authorized,playerEntry);check(forbidden.get("code").getAsString().equals("player_forbidden"),"revoked player permission rechecked on apply");check(before.equals(PlayerWorldEdit.save(target)),"permission rejection does not write target");receipt.add("permissionRejected",forbidden);
            server.getPlayerList().getOps().add(new net.minecraft.server.players.ServerOpListEntry(actor.nameAndId(),LevelBasedPermissionSet.GAMEMASTER,false));
        }
        receipt.addProperty("checks",checks);receipt.addProperty("passed",true);receipt.addProperty("mode","dedicated server / detached online players / recording listener; no client window");return receipt;
    }
}
