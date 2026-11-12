package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.registry.SpawnerData;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.server.level.*;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.Container;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.block.entity.*;
import net.minecraft.world.level.storage.*;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.Vec3;

/** Resolves loaded world targets; online players use their native setter-only adapter. */
public final class WorldTarget {
    public final net.minecraft.world.level.Level level;
    WorldTarget partner;
    public BlockEntity block;
    public final Entity entity;
    public final BlockPos blockPos;
    private net.minecraft.world.level.block.state.BlockState previewState;
    private CompoundTag draftData;
    private Vec3 returnPosition;
    private WorldTarget(net.minecraft.world.level.Level level, BlockEntity block, Entity entity) { this(level,block,entity,block == null ? null : block.getBlockPos()); }
    private WorldTarget(net.minecraft.world.level.Level level, BlockEntity block, Entity entity, BlockPos pos) { this.level = level; this.block = block; this.entity = entity; this.blockPos = pos; }
    public net.minecraft.world.level.block.state.BlockState blockState() { return blockPos == null ? null : previewState != null ? previewState : level.getBlockState(blockPos); }
    public CompoundTag singleSessionData() { return entity != null ? EntitySessionData.pack(save(),entity) : BlockSessionData.pack(save(),blockState()); }
    public CompoundTag sessionData() {
        var data=singleSessionData();
        if(partner!=null){data.put(DoubleChestEdit.PARTNER,partner.singleSessionData());data.put(DoubleChestEdit.TOPOLOGY,DoubleChestEdit.topology(this));}
        return data;
    }
    public static WorldTarget forBlock(net.minecraft.world.level.Level level, BlockEntity block) {
        var target=new WorldTarget(level,block,null);DoubleChestEdit.connect(target);return target;
    }
    WorldTarget half(BlockEntity other) { return new WorldTarget(level,other,null); }
    public static WorldTarget resolve(ServerPlayer player, JsonObject slot) {
        return resolve(player,slot,null);
    }
    /** openingPosition is supplied only by the authenticated server-side session. */
    public static WorldTarget resolve(ServerPlayer player, JsonObject slot, Vec3 openingPosition) {
        var level = (ServerLevel) player.level();
        boolean gameMaster=EditorPolicy.gameMaster(player);
        if (!player.isAlive() || (player.isSpectator() && !gameMaster)) EditorSessions.fail("not_allowed", EditorI18n.tr("cadeditor.message.worldtarget.6b9da09b1d"));
        if (!StackCodec.string(slot, "dim").equals(level.dimension().identifier().toString()))
            EditorSessions.fail("target_unavailable", EditorI18n.tr("cadeditor.message.worldtarget.26f1c7f5d2"));
        String kind = StackCodec.string(slot, "kind");
        BlockEntity block = null; Entity entity = null; BlockPos pos; Vec3 returnPosition=null;
        if (kind.equals("block")) {
            pos = new BlockPos(StackCodec.integer(slot, "x", -30000000, 30000000), StackCodec.integer(slot, "y", level.getMinY(), level.getMaxY()), StackCodec.integer(slot, "z", -30000000, 30000000));
            WorldAccess.loaded(WorldAccess.isLoaded(level,pos));
            WorldAccess.reach(player.isWithinBlockInteractionRange(pos, 0));
            block = level.getBlockEntity(pos);
            if (level.getBlockState(pos).isAir() || (block != null && block.isRemoved())) EditorSessions.fail("target_unavailable", EditorI18n.tr("cadeditor.message.worldtarget.40d3a9c748"));
            if (level.getBlockState(pos).getBlock() instanceof net.minecraft.world.level.block.GameMasterBlock && !EditorPolicy.gameMaster(player))
                EditorSessions.fail("not_allowed", EditorI18n.tr("cadeditor.message.worldtarget.9834ff68d9"));
        } else if (kind.equals("entity")) {
            entity = slot.has("player") ? null : slot.has("uuid") ? level.getEntityInAnyDimension(UUID.fromString(StackCodec.string(slot, "uuid")))
                    : level.getEntity(StackCodec.integer(slot,"id",0,Integer.MAX_VALUE));
            if(slot.has("player")) {
                PlayerWorldEdit.requirePermission(player.permissions());
                String selector=StackCodec.string(slot,"player");
                entity=selector.equals("self")?player:selector.equals("name")?level.getServer().getPlayerList().getPlayerByName(StackCodec.string(slot,"name")):slot.has("uuid")?level.getServer().getPlayerList().getPlayer(UUID.fromString(StackCodec.string(slot,"uuid"))):null;
                PlayerWorldEdit.requireOnline(entity instanceof ServerPlayer);
            }
            if(entity instanceof Player && !(entity instanceof ServerPlayer))EditorSessions.fail("player_target",EditorI18n.tr("cadeditor.message.worldtarget.3a00e7cac4"));
            if(entity instanceof ServerPlayer) { PlayerWorldEdit.requirePermission(player.permissions());PlayerWorldEdit.requireOnline(level.getServer().getPlayerList().getPlayer(entity.getUUID())==entity); }
            if (entity == null || entity.level() != level || entity.isRemoved()) EditorSessions.fail("target_unavailable", EditorI18n.tr("cadeditor.message.worldtarget.25e6712a59"));
            boolean inReach=entity==player || player.isWithinEntityInteractionRange(entity, 0);
            if (!inReach && openingPosition!=null && !(entity instanceof Player)) {
                WorldAccess.reach(player.isWithinEntityInteractionRange(entity.getBoundingBox().move(openingPosition.subtract(entity.position())),0));
                var origin=BlockPos.containing(openingPosition);
                WorldAccess.loaded(WorldAccess.isLoaded(level,origin));
                WorldAccess.area(level.getWorldBorder().isWithinBounds(origin) && player.mayInteract(level,origin) && level.mayInteract(player,origin) && (gameMaster || player.mayBuild()));
                returnPosition=openingPosition;
            } else WorldAccess.reach(inReach);
            if (entity.getType().onlyOpCanSetNbt() && !EditorPolicy.gameMaster(player))
                EditorSessions.fail("not_allowed", EditorI18n.tr("cadeditor.message.worldtarget.0b51b5a295"));
            pos = entity.blockPosition();
            WorldAccess.loaded(WorldAccess.isLoaded(level,pos));
        } else throw new EditorSessions.Failure("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.97568477dc"));
        WorldAccess.area(level.getWorldBorder().isWithinBounds(pos) && player.mayInteract(level, pos) && level.mayInteract(player, pos) && (gameMaster || player.mayBuild()));
        var target=new WorldTarget(level, block, entity, kind.equals("block") ? pos : null);
        target.returnPosition=returnPosition;
        DoubleChestEdit.connect(target);
        if(target.partner!=null){var p=target.partner.blockPos;WorldAccess.reach(player.isWithinBlockInteractionRange(p,0));WorldAccess.area(level.getWorldBorder().isWithinBounds(p)&&player.mayInteract(level,p)&&level.mayInteract(player,p)&&(gameMaster||player.mayBuild()));}
        return target;
    }
    /** Called after ordinary NBT protection; clients cannot choose a return destination. */
    public WorldMergePlan withSessionReturn(WorldMergePlan plan) {
        if(returnPosition==null)return plan;
        var next=plan.nbt().copy();
        next.put("Pos",Vec3.CODEC.encodeStart(NbtOps.INSTANCE,returnPosition).getOrThrow());
        return new WorldMergePlan(next,plan.blockState(),plan.partnerNbt());
    }
    public Vec3 returnPosition() { return returnPosition; }
    public CompoundTag save() {
        if(draftData!=null)return draftData.copy();
        if(block != null) return block.saveWithFullMetadata(level.registryAccess());
        if(entity instanceof ServerPlayer p) return PlayerWorldEdit.save(p);
        if(entity != null) return saveEntity(entity, level.registryAccess());
        var nbt=new CompoundTag();nbt.putString("id",BuiltInRegistries.BLOCK.getKey(blockState().getBlock()).toString());
        nbt.putInt("x",blockPos.getX());nbt.putInt("y",blockPos.getY());nbt.putInt("z",blockPos.getZ());return nbt;
    }
    public static CompoundTag saveEntity(Entity entity, HolderLookup.Provider access) {
        var problems = new ProblemReporter.Collector(); var out = TagValueOutput.createWithContext(problems, access);
        entity.saveWithoutId(out);
        var nbt = out.buildResult(); nbt.putString("id", BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).toString());
        // Vanilla omits an empty Offers list, but load(absent) means 'generate trades again'.
        // Keep an explicit empty list in the editor preimage so clear/undo remain exact.
        if(entity instanceof net.minecraft.world.entity.npc.villager.AbstractVillager merchant && entity.level() instanceof ServerLevel)
            nbt.put("Offers",net.minecraft.world.item.trading.MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),merchant.getOffers()).getOrThrow());
        requireClean(problems); return nbt;
    }
    public JsonObject canonicalSlot() {
        var slot = new JsonObject(); slot.addProperty("kind", blockPos != null ? "block" : "entity");
        slot.addProperty("dim", level.dimension().identifier().toString());
        if (blockPos != null) { var p = blockPos; slot.addProperty("x", p.getX()); slot.addProperty("y", p.getY()); slot.addProperty("z", p.getZ()); }
        else { slot.addProperty("uuid", entity.getStringUUID()); slot.addProperty("id", entity.getId()); }
        if(entity instanceof ServerPlayer)slot.addProperty("player","online");
        slot.addProperty("token", UUID.randomUUID().toString()); return slot;
    }
    public JsonObject snapshot(JsonObject slot, boolean canUndo) {
        return snapshot(slot,canUndo,sessionData());
    }
    /** NBT and revision must describe the exact captured session baseline, not a second save. */
    public JsonObject snapshot(JsonObject slot, boolean canUndo,CompoundTag captured) {
        var nbt = entity!=null?EntitySessionData.data(captured):BlockSessionData.data(captured); var result = new JsonObject();
        result.add("slot", slot.deepCopy()); result.addProperty("kind", blockPos != null ? "block" : "entity");
        result.addProperty("type", nbt.getString("id").orElseThrow());
        result.addProperty("snbt", nbt.toString()); result.addProperty("revision", WorldNbt.revision(captured));
        result.addProperty("canUndo", canUndo); result.add("nbt", NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, nbt));
        if (blockPos != null) {
            result.addProperty("block", BuiltInRegistries.BLOCK.getKey(blockState().getBlock()).toString());
            result.add("block_state", BlockStateEdit.values(blockState())); result.add("block_state_schema",BlockStateEdit.schema(blockState()));
            result.addProperty("has_block_entity",block != null);
            if(block instanceof CommandBlockEntity) result.add("block_type_schema",BlockStateEdit.commandTypes());
            if(block != null) addViews(result, block, level.registryAccess(), nbt);
            if(partner!=null)DoubleChestEdit.addView(result,this,captured);
        } else if (entity instanceof LivingEntity living) {
            var equipment = new JsonArray();
            for (var equip : EquipmentSlot.values()) { var row = new JsonObject(); row.addProperty("slot", equip.getSerializedName()); row.add("stack", stack(living.getItemBySlot(equip), level.registryAccess())); equipment.add(row); }
            result.add("equipment", equipment);
        }
        if (entity instanceof net.minecraft.world.entity.decoration.ItemFrame frame) result.add("displayed_item", stack(frame.getItem(),level.registryAccess()));
        if(entity instanceof ServerPlayer p) { addPlayerView(result,p,nbt,slot); }
        else if (entity != null) {
            var views = EntityWorldEdit.views(entity,nbt,level.registryAccess());
            var schemas = EntityWorldSchema.describe(entity,level.registryAccess());
            for (var entry : schemas.entrySet()) if (views.has(entry.getKey()) && views.get(entry.getKey()).isJsonObject())
                views.getAsJsonObject(entry.getKey()).add("schema",entry.getValue());
            result.add("views",views);
        }
        return result;
    }
    public JsonObject preview(CompoundTag nbt, JsonObject slot, boolean canUndo) {
        return preview(nbt,slot,canUndo,blockState());
    }
    public JsonObject preview(CompoundTag nbt, JsonObject slot, boolean canUndo, net.minecraft.world.level.block.state.BlockState state) {
        if (blockPos != null) {
            var temp=new WorldTarget(level,block == null ? null : copyBlock(block,nbt,level.registryAccess()),null,blockPos);
            temp.previewState=state; if(temp.block != null) temp.block.setBlockState(state);return temp.snapshot(slot,canUndo);
        }
        if(entity instanceof ServerPlayer p){var result=snapshot(slot,canUndo);addPlayerView(result,p,nbt,slot);return result;}
        var copy = entity.getType().create(level,EntitySpawnReason.COMMAND);
        if (copy == null) EditorSessions.fail("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.52da849378"));
        var problems = new ProblemReporter.Collector(); copy.load(TagValueInput.create(problems,level.registryAccess(),nbt)); requireClean(problems);
        return new WorldTarget(level,null,copy).snapshot(slot,canUndo);
    }
    public void checkCommandPrivileges(ServerPlayer player, CompoundTag nbt) {
        if (block instanceof SignBlockEntity sign && !EditorPolicy.gameMaster(player)) {
            var old = save();
            if (!Objects.equals(old.get("front_text"),nbt.get("front_text")) || !Objects.equals(old.get("back_text"),nbt.get("back_text"))) {
                var copy = (SignBlockEntity) copyBlock(sign,nbt,level.registryAccess());
                // 26.3 sign text is addressed by SignTextSlot; preserve the command permission check.
                //? if <26.3 {
                /*if (copy.getFrontText().hasAnyClickCommands(player) || copy.getBackText().hasAnyClickCommands(player))
                *///?} else {
                if (copy.canExecuteClickCommands(net.minecraft.world.level.block.entity.SignTextSlot.FRONT, player) || copy.canExecuteClickCommands(net.minecraft.world.level.block.entity.SignTextSlot.BACK, player))
                //?}
                    EditorSessions.fail("not_allowed", EditorI18n.tr("cadeditor.message.worldtarget.59960e2429"));
            }
        }
    }
    public static void addViews(JsonObject out, BlockEntity block, RegistryAccess access, CompoundTag nbt) {
        var comps = new JsonObject(); var typed = new JsonObject();
        for (var component : block.collectComponents()) addComponent(comps, typed, component, access);
        out.add("comps", comps); out.add("component_snbt", typed);
        Inventory inventory = inventory(block);
        if (inventory != null) {
            var container = new JsonObject(); container.addProperty("size", inventory.size()); container.addProperty("kind", BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(block.getType()).toString());
            var slots = new JsonArray();
            // Loot-table containers are not unpacked by inspecting the editor.
            boolean loot = block instanceof RandomizableContainerBlockEntity random && random.getLootTable() != null;
            container.addProperty("unresolved_loot", loot);
            if (!loot) for (int i = 0; i < inventory.size(); i++) { var row = new JsonObject(); row.addProperty("slot", i); row.add("stack", stack(inventory.get(i), access)); slots.add(row); }
            container.add("slots", slots); out.add("container", container);
        }
        var helpers = new JsonObject();
        // Field bindings are taken from the actual saved data, not reconstructed defaults.
        for (String key : List.of("LootTable", "LootTableSeed", "lock", "Lock", "front_text", "back_text", "patterns", "bees", "Bees", "Command", "auto", "conditionMet", "powered"))
            if (nbt.contains(key)) { var value = new JsonObject(); value.addProperty("snbt", nbt.get(key).toString()); value.add("value", NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, nbt.get(key))); helpers.add(key, value); }
        if (block instanceof CommandBlockEntity command) helpers.addProperty("command_mode", command.getMode().toString());
        if (block instanceof SpawnerBlockEntity || block instanceof TrialSpawnerBlockEntity) helpers.add("spawner_info", SpawnerData.entries(access));
        BlockViews.add(helpers,block,access,nbt);
        out.add("views", helpers);
    }
    private static <T> void addComponent(JsonObject json, JsonObject snbt, net.minecraft.core.component.TypedDataComponent<T> component, RegistryAccess access) {
        var codec = component.type().codec(); if (codec == null) return;
        String id = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type()).toString();
        if (id.startsWith("minecraft:")) id = id.substring(10);
        json.add(id, codec.encodeStart(access.createSerializationContext(JsonOps.INSTANCE), component.value()).getOrThrow());
        snbt.addProperty(id, codec.encodeStart(access.createSerializationContext(NbtOps.INSTANCE), component.value()).getOrThrow().toString());
    }
    static JsonObject stack(ItemStack item, RegistryAccess access) {
        if (item.isEmpty()) { var empty = new JsonObject(); empty.addProperty("empty", true); return empty; }
        return StackCodec.snapshot(item, access, new JsonObject(), "");
    }
    public interface Inventory { int size(); ItemStack get(int index); void set(int index, ItemStack stack); }
    public static Inventory inventory(BlockEntity block) {
        if (block instanceof Container c) return new Inventory() { public int size() { return c.getContainerSize(); } public ItemStack get(int i) { return c.getItem(i); } public void set(int i, ItemStack s) { c.setItem(i,s); } };
        if (block instanceof LecternBlockEntity l) return new Inventory() { public int size() { return LecternBlockEntity.NUM_SLOTS; } public ItemStack get(int i) { return l.getBook(); } public void set(int i, ItemStack s) { l.setBook(s); } };
        if (block instanceof CampfireBlockEntity c) return new Inventory() { public int size() { return c.getItems().size(); } public ItemStack get(int i) { return c.getItems().get(i); } public void set(int i, ItemStack s) { c.getItems().set(i,s); } };
        return null;
    }
    public static BlockEntity copyBlock(BlockEntity source, CompoundTag nbt, RegistryAccess access) {
        WorldNbt.protect(source.saveWithFullMetadata(access), nbt, false);
        if (source instanceof SpawnerBlockEntity) SpawnerData.validateClassic(nbt, access);
        if (source instanceof TrialSpawnerBlockEntity) SpawnerData.validateTrial(nbt, access);
        var copy = source.getType().create(source.getBlockPos(), source.getBlockState());
        if (copy == null) throw new EditorSessions.Failure("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.284aa94c31"));
        var problems = new ProblemReporter.Collector(); copy.loadWithComponents(TagValueInput.create(problems, access, nbt)); requireClean(problems);
        return copy;
    }
    public CompoundTag prepare(CompoundTag nbt, JsonObject request) {
        if(entity instanceof ServerPlayer p)return PlayerWorldEdit.prepare(p,nbt,request);
        CompoundTag before = save(); WorldNbt.protect(before, nbt, entity != null);
        if(entity instanceof net.minecraft.world.entity.npc.villager.AbstractVillager merchant && merchant.isTrading() && !Objects.equals(before.get("Offers"),nbt.get("Offers")))
            EditorSessions.fail("not_allowed",EditorI18n.tr("cadeditor.message.worldtarget.d578830892"));
        if (block != null) {
            BlockViews.requireUnwaxed(block,before,nbt);
            var copy = copyBlock(block, nbt, level.registryAccess());
            if (request.has("container")) editContainer(copy, request.getAsJsonObject("container"));
            validateInventory(copy);
            return copy.saveWithFullMetadata(level.registryAccess());
        }
        if(entity == null) {
            if(!before.equals(nbt) || request.has("container") || request.has("views")) EditorSessions.fail("unsupported_target",EditorI18n.tr("cadeditor.message.worldtarget.bb976e6a7c"));
            return nbt.copy();
        }
        if (request.has("entity")) {
            if (StackCodec.object(request,"entity").has("generic")) {
                // Generic edits must compare against the original typed data, before a loader
                // can normalize or discard an unknown field in the detached baseline.
                WorldAccess.nonPlayer(entity instanceof Player);
                WorldNbt.protect(before,nbt,true);
                return EntityWorldEdit.prepare(entity,nbt,StackCodec.object(request,"entity"),level,level.registryAccess());
            }
            var raw = copyEntity(entity,nbt,level,level.registryAccess(),before);
            WorldNbt.requireEditedFieldsRetained(before,nbt,raw);
            return EntityWorldEdit.prepare(entity,raw,StackCodec.object(request,"entity"),level,level.registryAccess());
        }
        return copyEntity(entity, nbt, level, level.registryAccess(),before);
    }
    /** Detached baseline adapter; normalized edits are measured against opened data. */
    public WorldTarget draft(CompoundTag opened,net.minecraft.world.level.block.state.BlockState state) {
        if(entity instanceof ServerPlayer)return this;
        if(blockPos!=null){var temp=new WorldTarget(level,block==null?null:copyBlock(block,opened,level.registryAccess()),null,blockPos);temp.previewState=state;if(temp.block!=null){temp.block.setBlockState(state);temp.block.setLevel(level);}return temp;}
        var copy=entity.getType().create(level,EntitySpawnReason.COMMAND);
        if(copy==null)EditorSessions.fail("unsupported_target",EditorI18n.tr("cadeditor.message.worldtarget.bc27f1bfe3"));
        var problems=new ProblemReporter.Collector();copy.load(TagValueInput.create(problems,level.registryAccess(),opened));requireClean(problems);
        var temp=new WorldTarget(level,null,copy);temp.draftData=opened.copy();return temp;
    }
    public static CompoundTag copyEntity(Entity source, CompoundTag nbt, net.minecraft.world.level.Level level, RegistryAccess access) {
        return copyEntity(source,nbt,level,access,saveEntity(source,access));
    }
    private static CompoundTag copyEntity(Entity source, CompoundTag nbt, net.minecraft.world.level.Level level, RegistryAccess access,CompoundTag before) {
        WorldAccess.nonPlayer(source instanceof Player);
        WorldNbt.protect(before, nbt, true);
        var temp = source.getType().create(level, EntitySpawnReason.COMMAND);
        if (temp == null) throw new EditorSessions.Failure("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.759f4fedae"));
        var problems = new ProblemReporter.Collector(); temp.load(TagValueInput.create(problems, access, nbt)); requireClean(problems);
        var prepared = saveEntity(temp, access);
        // Entity.load intentionally does not instantiate passengers. Keep the current graph.
        if (nbt.contains("Passengers")) prepared.put("Passengers",nbt.get("Passengers").copy());
        return prepared;
    }
    private void editContainer(BlockEntity copy, JsonObject edits) {
        if (block instanceof RandomizableContainerBlockEntity random && random.getLootTable() != null)
            EditorSessions.fail("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.b8232ad38e"));
        var target = inventory(copy); var original = inventory(block);
        if (target == null || original == null) EditorSessions.fail("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.c8c3455807"));
        var seen = new HashSet<Integer>();
        for (var row : edits.getAsJsonArray("slots")) {
            var obj = row.getAsJsonObject(); int index = StackCodec.integer(obj, "slot", 0, target.size()-1);
            if (!seen.add(index)) EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.doublechestedit.44aec1f72a"));
            var value = StackCodec.object(obj, "stack");
            ItemStack next = value.has("empty") && value.get("empty").getAsBoolean() ? ItemStack.EMPTY : StackCodec.decode(value, level.registryAccess(), original.get(index));
            if (block instanceof Container c && (!next.isEmpty() && (!canReplaceContainerItem(c, index, next) || next.getCount() > c.getMaxStackSize(next))))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.346e19830a"));
            if (copy instanceof JukeboxBlockEntity) {
                // Its gameplay setter starts playback and requires a live level.
                // Validation copies must use the native loader, not emit events.
                var data = copy.saveWithFullMetadata(level.registryAccess());
                if (next.isEmpty()) data.remove("RecordItem");
                else data.put("RecordItem",ItemStack.CODEC.encodeStart(level.registryAccess().createSerializationContext(NbtOps.INSTANCE),next).getOrThrow());
                data.remove("ticks_since_song_started");
                var problems = new ProblemReporter.Collector();
                copy.loadWithComponents(TagValueInput.create(problems,level.registryAccess(),data));
                requireClean(problems);
            } else target.set(index, next);
        }
        for (int i = 0; i < target.size(); i++) if (!seen.contains(i) && !StackComparison.matches(original.get(i), target.get(i), level.registryAccess()))
            EditorSessions.fail("invalid_nbt", EditorI18n.tr("cadeditor.message.worldtarget.787d787772"));
    }
    private void validateInventory(BlockEntity copy) {
        var before = inventory(block); var after = inventory(copy);
        if (before == null || after == null) return;
        for (int i = 0; i < after.size(); i++) {
            var next = after.get(i);
            if (StackComparison.matches(before.get(i),next,level.registryAccess()) || next.isEmpty()) continue;
            if (next.getCount() > next.getMaxStackSize()) EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.b6c73e5acb"));
            ItemStack.validateStrict(next).getOrThrow();
            if (block instanceof Container c && (!canReplaceContainerItem(c,i,next) || next.getCount() > c.getMaxStackSize(next)))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.5b62b1a0cc"));
            if (copy instanceof LecternBlockEntity && (!next.is(net.minecraft.tags.ItemTags.LECTERN_BOOKS) || next.getCount() != 1))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.3e1c4d473a"));
            if (copy instanceof CampfireBlockEntity && (next.getCount() != 1 || ((ServerLevel)level).recipeAccess().getRecipeFor(net.minecraft.world.item.crafting.RecipeType.CAMPFIRE_COOKING,new net.minecraft.world.item.crafting.SingleRecipeInput(next),level).isEmpty()))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.worldtarget.0a05a863cf"));
        }
    }
    /** Jukebox insertion also tests whether its slot is empty. Editing the
     * existing record is a replacement, so ask its real factory's empty slot
     * without removing the live record or hardcoding playable item IDs. Other
     * containers retain their existing slot-specific acceptance rules. */
    private static boolean canReplaceContainerItem(Container container, int index, ItemStack next) {
        if (container instanceof JukeboxBlockEntity jukebox) {
            var empty = jukebox.getType().create(jukebox.getBlockPos(),jukebox.getBlockState());
            if (!(empty instanceof Container)) EditorSessions.fail("unsupported_target", EditorI18n.tr("cadeditor.message.worldtarget.6fc3f6209a"));
            return ((Container)empty).canPlaceItem(index,next);
        }
        return container.canPlaceItem(index,next);
    }
    public void write(CompoundTag next) {
        write(next,blockState(),true);
    }
    public void write(CompoundTag next, net.minecraft.world.level.block.state.BlockState state, boolean updateNeighbors) {
        if(entity instanceof ServerPlayer p){PlayerWorldEdit.write(p,next);return;}
        if(blockPos != null && !state.equals(level.getBlockState(blockPos))) {
            if(!level.setBlock(blockPos,state,BlockStateEdit.flags(updateNeighbors))) EditorSessions.fail("invalid_block_state",EditorI18n.tr("cadeditor.message.worldtarget.02435d889a"));
            BlockStateEdit.requireApplied(state,level.getBlockState(blockPos));
            // Same block type: vanilla retains its BE. Reattach a factory instance if callbacks removed it.
            if(block != null) {
                var actual=level.getBlockEntity(blockPos);
                if(actual == null) { actual=block.getType().create(blockPos,state);if(actual == null) EditorSessions.fail("unsupported_target",EditorI18n.tr("cadeditor.message.worldtarget.73450ed4d2"));level.setBlockEntity(actual); }
                if(actual.getType()!=block.getType()) EditorSessions.fail("target_changed",EditorI18n.tr("cadeditor.message.worldtarget.3733ee600d"));block=actual;
            }
        }
        if(entity == null && block == null) return;
        var problems = new ProblemReporter.Collector();
        var input = TagValueInput.create(problems, level.registryAccess(), next);
        if (block != null) {
            block.loadWithComponents(input); requireClean(problems);
            // Vanilla setChanged itself updates comparators; use the dirty-only path when suppressed.
            if(updateNeighbors) block.setChanged(); else level.blockEntityChanged(block.getBlockPos());
            level.sendBlockUpdated(block.getBlockPos(), block.getBlockState(), block.getBlockState(), BlockStateEdit.flags(updateNeighbors));
            if(updateNeighbors)level.updateNeighbourForOutputSignal(block.getBlockPos(), block.getBlockState().getBlock());
        } else { entity.load(input); requireClean(problems); }
    }
    private static void addPlayerView(JsonObject result,ServerPlayer player,CompoundTag nbt,JsonObject slot){
        var metadata=new JsonObject();metadata.addProperty("self",slot.has("self")&&slot.get("self").getAsBoolean());metadata.addProperty("name",player.getPlainTextName());metadata.addProperty("uuid",player.getStringUUID());result.add("player",metadata);
        var values=PlayerWorldEdit.data(nbt);values.add("schema",PlayerWorldEdit.schema(player));var views=new JsonObject();views.add("player",values);result.add("views",views);
        result.addProperty("snbt",nbt.toString());result.add("nbt",NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,nbt));
    }
    private static void requireClean(ProblemReporter.Collector problems) {
        if (!problems.isEmpty()) EditorSessions.fail("invalid_nbt", EditorI18n.tr("cadeditor.message.worldtarget.3bc8f60d8f", (problems.getReport())));
    }
}
