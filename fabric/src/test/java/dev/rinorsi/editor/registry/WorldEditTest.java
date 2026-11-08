package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.*;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;

/** Actual factories and loaders in a chunkless, non-ticking JVM level. Not a network/server test. */
public final class WorldEditTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion(); net.minecraft.server.Bootstrap.bootStrap();
        var access = EntitySchemaTest.access(); var level = new EntitySchemaTestLevel(access);
        var receipt = new JsonObject(); var captured = new JsonObject();
        var stack = new ItemStack(Items.DIAMOND_SWORD);
        stack.set(DataComponents.CUSTOM_DATA, CustomData.of(WorldNbt.parse("{byte:7b,short:300s,long:9007199254740993L,float:0.8f,double:2.4d,ints:[I;1,2],bytes:[B;1b,2b],longs:[L;1L,9007199254740993L]}")));
        var enchant = new JsonObject(); enchant.addProperty("component","enchantments"); enchant.addProperty("snbt","{'minecraft:sharpness':5}");
        var patch = StackCodec.snapshot(stack,access,new JsonObject(),""); patch.getAsJsonObject("comps").add("enchantments", ComponentValidation.validate(enchant,access).get("json")); stack = StackCodec.decode(patch,access,stack);
        for (Block b : List.of(Blocks.CHEST, Blocks.BARREL, Blocks.FURNACE, Blocks.SHULKER_BOX, Blocks.OAK_SIGN, Blocks.WHITE_BANNER, Blocks.COMMAND_BLOCK, Blocks.SPAWNER, Blocks.TRIAL_SPAWNER, Blocks.BEEHIVE,
                Blocks.OAK_HANGING_SIGN, Blocks.HOPPER, Blocks.BREWING_STAND, Blocks.DISPENSER, Blocks.DROPPER, Blocks.CRAFTER, Blocks.DECORATED_POT, Blocks.LECTERN, Blocks.JUKEBOX, Blocks.CHISELED_BOOKSHELF, Blocks.CAMPFIRE)) {
            var block = ((EntityBlock)b).newBlockEntity(BlockPos.ZERO,b.defaultBlockState());
            var inventory = WorldTarget.inventory(block);
            if (inventory != null) for (int i = 0; i < inventory.size(); i++) inventory.set(i, stack.copy());
            if (block instanceof LecternBlockEntity lectern) {
                var book = new ItemStack(Items.WRITTEN_BOOK);
                book.set(DataComponents.WRITTEN_BOOK_CONTENT,new net.minecraft.world.item.component.WrittenBookContent(net.minecraft.server.network.Filterable.passThrough("测试"),"test",0,List.of(net.minecraft.server.network.Filterable.passThrough(Component.literal("第1页"))),true));
                lectern.setBook(book);
            }
            if (block instanceof BannerBlockEntity) {
                var banner = new ItemStack(Items.WHITE_BANNER);
                var holder = access.lookupOrThrow(net.minecraft.core.registries.Registries.BANNER_PATTERN).listElements().findFirst().orElseThrow();
                banner.set(DataComponents.BANNER_PATTERNS,new BannerPatternLayers.Builder().add(holder,DyeColor.RED).build()); block.applyComponentsFromItemStack(banner);
            }
            if (block instanceof BeehiveBlockEntity hive) hive.storeBee(BeehiveBlockEntity.Occupant.create(0));
            if (block instanceof SignBlockEntity sign) {
                var text = SignText.DIRECT_CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),new SignText().setMessage(0,Component.literal("原始标牌")).setHasGlowingText(true)).getOrThrow();
                var nbt = block.saveWithFullMetadata(access); nbt.put("front_text",text);
                block.loadWithComponents(net.minecraft.world.level.storage.TagValueInput.create(new net.minecraft.util.ProblemReporter.Collector(),access,nbt));
            }
            var before = block.saveWithFullMetadata(access);
            var copy = WorldTarget.copyBlock(block, WorldNbt.parse(before.toString()), access);
            var after = copy.saveWithFullMetadata(access);
            check(before.equals(after), "block open/no-edit load/save " + b + " before=" + before + " after=" + after);
            if (block instanceof SignBlockEntity) {
                var edited = before.copy(); edited.put("front_text",SignText.DIRECT_CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),new SignText().setMessage(0,Component.literal("编辑后标牌"))).getOrThrow());
                var updated = WorldTarget.copyBlock(block,edited,access).saveWithFullMetadata(access); WorldNbt.requireEditedFieldsRetained(before,edited,updated);
                check(Objects.equals(edited.get("front_text"),updated.get("front_text")),"sign text edit accepted");
            }
            if (block instanceof SpawnerBlockEntity) {
                var edited = before.copy(); edited.putShort("Delay",(short)40);
                var updated = WorldTarget.copyBlock(block,edited,access).saveWithFullMetadata(access); WorldNbt.requireEditedFieldsRetained(before,edited,updated); check(edited.equals(updated),"spawner delay edit accepted");
                var invalid = before.copy(); invalid.putString("SpawnData","bad"); reject("invalid_nbt",() -> WorldNbt.requireEditedFieldsRetained(before,invalid,before));
            }
            if (block instanceof TrialSpawnerBlockEntity) {
                var edited = before.copy(); edited.putInt("required_player_range",8);
                var updated = WorldTarget.copyBlock(block,edited,access).saveWithFullMetadata(access); WorldNbt.requireEditedFieldsRetained(before,edited,updated); check(Objects.equals(edited.get("required_player_range"),updated.get("required_player_range")),"trial spawner range edit accepted");
            }
            if (inventory != null) {
                var reread = WorldTarget.inventory(copy); check(reread.size() == inventory.size(),"inventory runtime size " + b);
                for (int i = 0; i < inventory.size(); i++) check(StackComparison.matches(inventory.get(i),reread.get(i),access),"typed slot unchanged " + b + "/" + i);
                if (reread.size() > 1) {
                    reread.set(0,new ItemStack(Items.PAPER)); var reloaded = WorldTarget.copyBlock(copy,copy.saveWithFullMetadata(access),access);
                    for (int i = 1; i < reread.size(); i++) check(StackComparison.matches(inventory.get(i),WorldTarget.inventory(reloaded).get(i),access),"unrelated slot edit preserves types " + b + "/" + i);
                }
            }
            var view = new JsonObject(); WorldTarget.addViews(view,block,access,before);
            var sample = new JsonObject(); sample.addProperty("snbt",before.toString()); sample.addProperty("revision",WorldNbt.revision(before)); sample.add("helpers",view);
            String id = net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b).toString(); captured.add(id,sample); receipt.addProperty(id,true);
            var wrongId = before.copy(); wrongId.putString("id","minecraft:barrel"); if (!Objects.equals(before.get("id"),wrongId.get("id"))) reject("protected_field",() -> WorldTarget.copyBlock(block,wrongId,access));
        }
        for (var type : List.of(EntityType.PIG,EntityType.ARMOR_STAND,EntityType.ITEM_FRAME)) {
            var entity = type.create(level,EntitySpawnReason.LOAD);
            entity.setCustomName(Component.literal("实体原名"));
            if (entity instanceof LivingEntity living) living.setItemSlot(EquipmentSlot.MAINHAND,stack.copy());
            if (entity instanceof net.minecraft.world.entity.decoration.ItemFrame frame) frame.setItem(stack.copy(),false);
            var before = WorldTarget.saveEntity(entity,access);
            if (type == EntityType.PIG) check(before.keySet().stream().anyMatch(k -> k.contains("variant")),"pig has real variant NBT");
            var requested = WorldNbt.parse(before.toString());
            var name = net.minecraft.network.chat.ComponentSerialization.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),Component.literal("实体改名")).getOrThrow();
            requested.put("CustomName",name);
            var after = WorldTarget.copyEntity(entity,requested,level,access);
            check(Objects.equals(after.get("CustomName"),name),"entity temp load applies name " + type);
            for (String key : before.keySet()) if (!key.equals("CustomName")) check(Objects.equals(before.get(key),after.get(key)),"entity unchanged field " + type + "/" + key);
            var wrong = before.copy(); wrong.putIntArray("UUID",new int[]{1,2,3,4}); reject("protected_field",() -> WorldTarget.copyEntity(entity,wrong,level,access));
            receipt.addProperty(type.toString(),true); var sample = new JsonObject(); sample.addProperty("snbt",before.toString()); captured.add(type.toString(),sample);
        }
        var typed = WorldNbt.parse("{id:'minecraft:chest',x:0,y:0,z:0,b:7b,s:8s,l:9007199254740993L,f:0.8f,d:2.4d,a:[I;1,2]}");
        check(typed.equals(WorldNbt.parse(typed.toString())),"all typed NBT survives text transport");
        var reordered = WorldNbt.parse("{a:[I;1,2],d:2.4d,f:0.8f,l:9007199254740993L,s:8s,b:7b,z:0,y:0,x:0,id:'minecraft:chest'}");
        check(WorldNbt.revision(typed).equals(WorldNbt.revision(reordered)),"compound ordering canonical");
        var changedType = typed.copy(); changedType.putInt("b",7); check(!WorldNbt.revision(typed).equals(WorldNbt.revision(changedType)),"numeric type changes revision");
        reject("invalid_nbt",() -> WorldNbt.parse("{broken:}")); reject("invalid_nbt",() -> WorldNbt.parse("[]"));
        var ignored = typed.copy(); ignored.putString("unknown_field","attempted"); reject("invalid_nbt",() -> WorldNbt.requireEditedFieldsRetained(typed,ignored,typed));
        var omitted = typed.copy(); omitted.remove("s"); reject("invalid_nbt",() -> WorldNbt.requireEditedFieldsRetained(typed,omitted,typed));
        reject("payload_too_large",() -> WorldNbt.parse(" ".repeat(WorldNbt.MAX_SNBT+1)));
        var sessions = new WorldEditSessions(); var player = UUID.randomUUID(); var slot = new JsonObject(); slot.addProperty("kind","block"); slot.addProperty("dim","minecraft:overworld"); slot.addProperty("x",0); slot.addProperty("y",0); slot.addProperty("z",0); slot.addProperty("token","test");
        var state = sessions.open(player,slot,typed); check(sessions.require(player,slot,state.revision,typed)==state,"session baseline accepted");
        check(sessions.require(player,slot,state.revision,changedType)==state,"current field changes deferred to three-way merge");
        reject("undo_unavailable",state::preimage);
        state.saved(typed,changedType,false); check(state.preimage().equals(typed),"undo stores exact typed preimage");
        var restored = state.preimage(); restored.putInt("b",999); check(state.preimage().equals(typed),"undo caller cannot mutate cached preimage");
        state.saved(changedType,typed,true); reject("undo_unavailable",state::preimage);
        var otherToken = slot.deepCopy(); otherToken.addProperty("token","stale"); sessions.close(player,otherToken); check(sessions.require(player,slot,state.revision,typed)==state,"stale close retained session");
        reject("session_lost",() -> sessions.require(player,otherToken,state.revision,typed));
        sessions.close(player,slot); reject("session_lost",() -> sessions.require(player,slot,state.revision,typed));
        sessions.rateLimit(player); reject("rate_limited",() -> sessions.rateLimit(player));
        check(!new EditorPolicy(2,false).allows(false,false),"no permission rejected by shared policy");
        reject("out_of_reach",() -> WorldAccess.reach(false)); reject("chunk_unloaded",() -> WorldAccess.loaded(false));
        reject("player_target",() -> WorldAccess.nonPlayer(true)); reject("protected_area",() -> WorldAccess.area(false));
        var message = new JsonObject(); message.add("world",captured); var encoded = WorldWire.encode(message); check(StackCodec.sameJson(WorldWire.decode(JsonParser.parseString(encoded).getAsJsonObject()),message),"compressed large full inventory helper snapshot exact decimal wire values");
        receipt.addProperty("status","PASSED"); receipt.addProperty("checks",checks); receipt.addProperty("mode","pure-jvm-factories-and-loaders-not-live-server");
        Path output = Path.of(args.length == 0 ? "logs/world-edit" : args[0]); Files.createDirectories(output);
        Files.writeString(output.resolve("captured.json"),new GsonBuilder().setPrettyPrinting().create().toJson(captured)); Files.writeString(output.resolve("receipt.json"),receipt.toString());
        System.out.println("PASS WorldEditTest " + checks + " checks; real block/entity factories, loaders, inventories, typed NBT, conflict and transport; live server pending");
        DoubleChestWorldEditTest.run(access);
        BlockWorldEditTest.run(access,Path.of("logs/block-edit"));
    }
    private static void check(boolean condition,String message) { if (!condition) throw new AssertionError(message); checks++; }
    private static void reject(String code,Runnable action) { try { action.run(); } catch(WorldEditError e){check(code.equals(e.code),"expected "+code+" got "+e.code);return;}catch(EditorSessions.Failure e) { check(code.equals(e.code),"expected "+code+" got "+e.code); return; } throw new AssertionError("expected rejection "+code); }
}
