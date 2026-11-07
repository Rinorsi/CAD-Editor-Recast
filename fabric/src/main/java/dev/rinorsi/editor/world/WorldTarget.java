package dev.rinorsi.editor.world;

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

/** Never loads chunks, inserts temporary entities, or targets players. */
public final class WorldTarget {
    public final ServerLevel level;
    public BlockEntity block;
    public final Entity entity;
    public final BlockPos blockPos;
    private net.minecraft.world.level.block.state.BlockState previewState;
    private WorldTarget(ServerLevel level, BlockEntity block, Entity entity) { this(level,block,entity,block == null ? null : block.getBlockPos()); }
    private WorldTarget(ServerLevel level, BlockEntity block, Entity entity, BlockPos pos) { this.level = level; this.block = block; this.entity = entity; this.blockPos = pos; }
    public net.minecraft.world.level.block.state.BlockState blockState() { return blockPos == null ? null : previewState != null ? previewState : level.getBlockState(blockPos); }
    public CompoundTag sessionData() { return entity != null ? EntitySessionData.pack(save(),entity) : BlockSessionData.pack(save(),blockState()); }
    public static WorldTarget resolve(ServerPlayer player, JsonObject slot) {
        var level = (ServerLevel) player.level();
        if (!player.isAlive() || player.isSpectator()) EditorSessions.fail("not_allowed", "当前玩家状态不能编辑世界目标");
        if (!StackCodec.string(slot, "dim").equals(level.dimension().identifier().toString()))
            EditorSessions.fail("target_unavailable", "目标不在玩家当前维度");
        String kind = StackCodec.string(slot, "kind");
        BlockEntity block = null; Entity entity = null; BlockPos pos;
        if (kind.equals("block")) {
            pos = new BlockPos(StackCodec.integer(slot, "x", -30000000, 30000000), StackCodec.integer(slot, "y", level.getMinY(), level.getMaxY()), StackCodec.integer(slot, "z", -30000000, 30000000));
            WorldAccess.loaded(level.hasChunkAt(pos));
            WorldAccess.reach(player.isWithinBlockInteractionRange(pos, 0));
            block = level.getBlockEntity(pos);
            if (level.getBlockState(pos).isAir() || (block != null && block.isRemoved())) EditorSessions.fail("target_unavailable", "该位置没有可编辑的已放置方块");
            if (block instanceof CommandBlockEntity && !player.canUseGameMasterBlocks())
                EditorSessions.fail("not_allowed", "命令方块需要原版游戏管理员权限与创造模式");
        } else if (kind.equals("entity")) {
            entity = slot.has("uuid") ? level.getEntityInAnyDimension(UUID.fromString(StackCodec.string(slot, "uuid")))
                    : level.getEntity(StackCodec.integer(slot,"id",0,Integer.MAX_VALUE));
            WorldAccess.nonPlayer(entity instanceof Player);
            if (entity == null || entity.level() != level || entity.isRemoved()) EditorSessions.fail("target_unavailable", "实体已卸载、移除或离开维度");
            WorldAccess.reach(player.isWithinEntityInteractionRange(entity, 0));
            if (entity.getType().onlyOpCanSetNbt() && !player.canUseGameMasterBlocks())
                EditorSessions.fail("not_allowed", "该实体需要原版游戏管理员权限与创造模式");
            pos = entity.blockPosition();
            WorldAccess.loaded(level.hasChunkAt(pos));
        } else throw new EditorSessions.Failure("slot_invalid", "未知世界目标类型");
        WorldAccess.area(level.getWorldBorder().isWithinBounds(pos) && player.mayInteract(level, pos) && level.mayInteract(player, pos) && player.mayBuild());
        return new WorldTarget(level, block, entity, kind.equals("block") ? pos : null);
    }
    public CompoundTag save() {
        if(block != null) return block.saveWithFullMetadata(level.registryAccess());
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
        slot.addProperty("token", UUID.randomUUID().toString()); return slot;
    }
    public JsonObject snapshot(JsonObject slot, boolean canUndo) {
        var nbt = save(); var result = new JsonObject();
        result.add("slot", slot.deepCopy()); result.addProperty("kind", blockPos != null ? "block" : "entity");
        result.addProperty("type", nbt.getString("id").orElseThrow());
        result.addProperty("snbt", nbt.toString()); result.addProperty("revision", WorldNbt.revision(entity != null ? EntitySessionData.pack(nbt,entity) : BlockSessionData.pack(nbt,blockState())));
        result.addProperty("canUndo", canUndo); result.add("nbt", NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, nbt));
        if (blockPos != null) {
            result.addProperty("block", BuiltInRegistries.BLOCK.getKey(blockState().getBlock()).toString());
            result.add("block_state", BlockStateEdit.values(blockState())); result.add("block_state_schema",BlockStateEdit.schema(blockState()));
            result.addProperty("has_block_entity",block != null);
            if(block instanceof CommandBlockEntity) result.add("block_type_schema",BlockStateEdit.commandTypes());
            if(block != null) addViews(result, block, level.registryAccess(), nbt);
        } else if (entity instanceof LivingEntity living) {
            var equipment = new JsonArray();
            for (var equip : EquipmentSlot.values()) { var row = new JsonObject(); row.addProperty("slot", equip.getSerializedName()); row.add("stack", stack(living.getItemBySlot(equip), level.registryAccess())); equipment.add(row); }
            result.add("equipment", equipment);
        }
        if (entity instanceof net.minecraft.world.entity.decoration.ItemFrame frame) result.add("displayed_item", stack(frame.getItem(),level.registryAccess()));
        if (entity != null) {
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
        var copy = entity.getType().create(level,EntitySpawnReason.COMMAND);
        if (copy == null) EditorSessions.fail("unsupported_target", "无法生成目标校验副本");
        var problems = new ProblemReporter.Collector(); copy.load(TagValueInput.create(problems,level.registryAccess(),nbt)); requireClean(problems);
        return new WorldTarget(level,null,copy).snapshot(slot,canUndo);
    }
    public void checkCommandPrivileges(ServerPlayer player, CompoundTag nbt) {
        if (block instanceof SignBlockEntity sign && !player.canUseGameMasterBlocks()) {
            var old = save();
            if (!Objects.equals(old.get("front_text"),nbt.get("front_text")) || !Objects.equals(old.get("back_text"),nbt.get("back_text"))) {
                var copy = (SignBlockEntity) copyBlock(sign,nbt,level.registryAccess());
                if (copy.getFrontText().hasAnyClickCommands(player) || copy.getBackText().hasAnyClickCommands(player))
                    EditorSessions.fail("not_allowed", "写入可执行命令的标牌需要原版游戏管理员权限与创造模式");
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
    private static JsonObject stack(ItemStack item, RegistryAccess access) {
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
        if (copy == null) throw new EditorSessions.Failure("unsupported_target", "此方块实体无法创建验证副本");
        var problems = new ProblemReporter.Collector(); copy.loadWithComponents(TagValueInput.create(problems, access, nbt)); requireClean(problems);
        return copy;
    }
    public CompoundTag prepare(CompoundTag nbt, JsonObject request) {
        CompoundTag before = save(); WorldNbt.protect(before, nbt, entity != null);
        if(entity instanceof net.minecraft.world.entity.npc.villager.AbstractVillager merchant && merchant.isTrading() && !Objects.equals(before.get("Offers"),nbt.get("Offers")))
            EditorSessions.fail("not_allowed","商人正在交易，请关闭交易界面后再编辑交易");
        if (block != null) {
            BlockViews.requireUnwaxed(block,before,nbt);
            var copy = copyBlock(block, nbt, level.registryAccess());
            if (request.has("container")) editContainer(copy, request.getAsJsonObject("container"));
            validateInventory(copy);
            return copy.saveWithFullMetadata(level.registryAccess());
        }
        if(entity == null) {
            if(!before.equals(nbt) || request.has("container") || request.has("views")) EditorSessions.fail("unsupported_target","普通方块仅支持 block_state 编辑");
            return nbt.copy();
        }
        if (request.has("entity")) {
            var raw = copyEntity(entity,nbt,level,level.registryAccess());
            WorldNbt.requireEditedFieldsRetained(before,nbt,raw);
            return EntityWorldEdit.prepare(entity,raw,StackCodec.object(request,"entity"),level,level.registryAccess());
        }
        return copyEntity(entity, nbt, level, level.registryAccess());
    }
    public static CompoundTag copyEntity(Entity source, CompoundTag nbt, net.minecraft.world.level.Level level, RegistryAccess access) {
        WorldAccess.nonPlayer(source instanceof Player);
        WorldNbt.protect(saveEntity(source, access), nbt, true);
        var temp = source.getType().create(level, EntitySpawnReason.COMMAND);
        if (temp == null) throw new EditorSessions.Failure("unsupported_target", "此实体无法创建验证副本");
        var problems = new ProblemReporter.Collector(); temp.load(TagValueInput.create(problems, access, nbt)); requireClean(problems);
        var prepared = saveEntity(temp, access);
        // Entity.load intentionally does not instantiate passengers. Keep the current graph.
        if (nbt.contains("Passengers")) prepared.put("Passengers",nbt.get("Passengers").copy());
        return prepared;
    }
    private void editContainer(BlockEntity copy, JsonObject edits) {
        if (block instanceof RandomizableContainerBlockEntity random && random.getLootTable() != null)
            EditorSessions.fail("unsupported_target", "尚未展开战利品表，不能同时写入容器槽位；请先在游戏中打开容器");
        var target = inventory(copy); var original = inventory(block);
        if (target == null || original == null) EditorSessions.fail("unsupported_target", "目标不提供容器槽位");
        var seen = new HashSet<Integer>();
        for (var row : edits.getAsJsonArray("slots")) {
            var obj = row.getAsJsonObject(); int index = StackCodec.integer(obj, "slot", 0, target.size()-1);
            if (!seen.add(index)) EditorSessions.fail("invalid_request", "容器槽位重复");
            var value = StackCodec.object(obj, "stack");
            ItemStack next = value.has("empty") && value.get("empty").getAsBoolean() ? ItemStack.EMPTY : StackCodec.decode(value, level.registryAccess(), original.get(index));
            if (block instanceof Container c && (!next.isEmpty() && (!c.canPlaceItem(index, next) || next.getCount() > c.getMaxStackSize(next))))
                EditorSessions.fail("slot_invalid", "物品不符合目标容器槽位的类型或数量限制");
            target.set(index, next);
        }
        for (int i = 0; i < target.size(); i++) if (!seen.contains(i) && !StackComparison.matches(original.get(i), target.get(i), level.registryAccess()))
            EditorSessions.fail("invalid_nbt", "未编辑的容器槽位发生变化，已取消整笔提交");
    }
    private void validateInventory(BlockEntity copy) {
        var before = inventory(block); var after = inventory(copy);
        if (before == null || after == null) return;
        for (int i = 0; i < after.size(); i++) {
            var next = after.get(i);
            if (StackComparison.matches(before.get(i),next,level.registryAccess()) || next.isEmpty()) continue;
            ItemStack.validateStrict(next).getOrThrow();
            if (next.getCount() > next.getMaxStackSize()) EditorSessions.fail("slot_invalid", "物品数量超过组件规定的堆叠上限");
            if (block instanceof Container c && (!c.canPlaceItem(i,next) || next.getCount() > c.getMaxStackSize(next)))
                EditorSessions.fail("slot_invalid", "修改后的物品不符合该容器槽位限制");
            if (copy instanceof LecternBlockEntity && (!next.is(net.minecraft.tags.ItemTags.LECTERN_BOOKS) || next.getCount() != 1))
                EditorSessions.fail("slot_invalid", "讲台仅接受实时 lectern_books 标签中的单本书");
            if (copy instanceof CampfireBlockEntity && (next.getCount() != 1 || level.recipeAccess().getRecipeFor(net.minecraft.world.item.crafting.RecipeType.CAMPFIRE_COOKING,new net.minecraft.world.item.crafting.SingleRecipeInput(next),level).isEmpty()))
                EditorSessions.fail("slot_invalid", "营火仅接受实时营火配方中的单件物品");
        }
    }
    public void write(CompoundTag next) {
        write(next,blockState(),true);
    }
    public void write(CompoundTag next, net.minecraft.world.level.block.state.BlockState state, boolean updateNeighbors) {
        if(blockPos != null && !state.equals(level.getBlockState(blockPos))) {
            if(!level.setBlock(blockPos,state,BlockStateEdit.flags(updateNeighbors))) EditorSessions.fail("invalid_block_state","世界拒绝应用方块状态");
            BlockStateEdit.requireApplied(state,level.getBlockState(blockPos));
            // Same block type: vanilla retains its BE. Reattach a factory instance if callbacks removed it.
            if(block != null) {
                var actual=level.getBlockEntity(blockPos);
                if(actual == null) { actual=block.getType().create(blockPos,state);if(actual == null) EditorSessions.fail("unsupported_target","无法恢复方块实体");level.setBlockEntity(actual); }
                if(actual.getType()!=block.getType()) EditorSessions.fail("target_changed","邻居更新改变了方块实体类型");block=actual;
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
    private static void requireClean(ProblemReporter.Collector problems) {
        if (!problems.isEmpty()) EditorSessions.fail("invalid_nbt", "原版数据加载校验失败：" + problems.getReport());
    }
}
