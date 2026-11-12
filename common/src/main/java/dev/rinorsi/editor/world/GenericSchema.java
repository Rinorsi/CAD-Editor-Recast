package dev.rinorsi.editor.world;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.*;
import com.mojang.serialization.Codec;
import dev.rinorsi.editor.EditorSessions;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/** Conservative shape observations. No field names, mod IDs or sample data imply semantics. */
public final class GenericSchema {
    private static final int MAX_SCHEMA_CHARS=18000, MAX_NODES=256, MAX_DEPTH=8;
    private GenericSchema() {}
    public static List<String> ids(String kind) {
        return switch (kind) {
            case "entity" -> BuiltInRegistries.ENTITY_TYPE.keySet().stream().map(Object::toString).sorted().toList();
            case "block_entity" -> BuiltInRegistries.BLOCK_ENTITY_TYPE.keySet().stream().map(Object::toString).sorted().toList();
            default -> throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.c57ea73e84"));
        };
    }
    public static JsonObject template(String kind, String id, Level level) {
        try {
            var key = Identifier.parse(id);
            if (kind.equals("entity")) {
                var type = BuiltInRegistries.ENTITY_TYPE.getOptional(key).orElseThrow(() -> new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.587ad066fd")));
                var entity = type.create(level, EntitySpawnReason.LOAD);
                if (entity == null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.89364c7dca"));
                var nbt = WorldTarget.saveEntity(entity, level.registryAccess());
                return describe(kind, id, nbt, level.registryAccess(), specialized(entity, nbt, level.registryAccess()));
            }
            if (!kind.equals("block_entity")) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.0521e8e309"));
            var type = BuiltInRegistries.BLOCK_ENTITY_TYPE.getOptional(key).orElseThrow(() -> new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.0947c8d9c2")));
            var state = BuiltInRegistries.BLOCK.stream().map(b -> b.defaultBlockState()).filter(type::isValid).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.d9161b1206")));
            var block = type.create(BlockPos.ZERO, state);
            if (block == null) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.c3a64b7df0"));
            return describe(kind, id, saveBlock(block,level.registryAccess()), level.registryAccess(), BlockViews.hasSpecialized(block));
        } catch (RuntimeException error) { return unavailable(kind, id, EditorI18n.tr("cadeditor.message.genericschema.df319d257d", (String.valueOf(error.getMessage())))); }
    }
    public static JsonObject unavailable(String kind, String id, String reason) {
        var out = header(kind,id,false); out.addProperty("available",false);
        out.addProperty("editable","snbt_only"); out.addProperty("editable_reason",reason.substring(0,Math.min(500,reason.length())));
        return out;
    }
    public static CompoundTag saveBlock(BlockEntity block, RegistryAccess access) {
        var problems=new net.minecraft.util.ProblemReporter.Collector();
        var output=net.minecraft.world.level.storage.TagValueOutput.createWithContext(problems,access);
        block.saveWithFullMetadata(output);
        if(!problems.isEmpty())throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.5a707ccf2a", (problems.getReport())));
        return output.buildResult();
    }
    private static JsonObject header(String kind, String id, boolean specialized) {
        var out = new JsonObject(); out.addProperty("schema_version",1); out.addProperty("kind",kind);
        out.addProperty("id",id); out.addProperty("source","runtime_nbt_shape");
        out.addProperty("available",true); out.addProperty("specialized",specialized);
        out.addProperty("editable",specialized ? "readonly" : "structured"); out.add("fields",new JsonObject());
        if (specialized) out.addProperty("editable_reason",EditorI18n.tr("cadeditor.message.genericschema.697561ee9e"));
        return out;
    }
    public static JsonObject describe(String kind, String id, CompoundTag nbt, RegistryAccess access, boolean specialized) {
        var out = header(kind,id,specialized);
        if (specialized) return out;
        String snbt=nbt.toString();
        if(snbt.length()>MAX_SCHEMA_CHARS || nbt.size()>MAX_NODES) return unavailable(kind,id,EditorI18n.tr("cadeditor.message.genericschema.378ae08a00"));
        out.addProperty("default_snbt",snbt);
        var inspector = new Inspector(access); var fields = out.getAsJsonObject("fields");
        for (String key : new TreeSet<>(nbt.keySet())) {
            var field = inspector.field(nbt.get(key), List.of(key), 0);
            var changed = nbt.copy(); changed.remove(key);
            // Reuse the existing world identity guard rather than maintaining another field table.
            try { WorldNbt.protect(nbt,changed,kind.equals("entity")); }
            catch (EditorSessions.Failure protectedField) { fallback(field,"readonly",EditorI18n.tr("cadeditor.message.genericschema.bf306456a1")); }
            fields.add(key,field);
        }
        // A single oversized mod must not break enumeration or the world snapshot.
        if (out.toString().length() > MAX_SCHEMA_CHARS) return unavailable(kind,id,EditorI18n.tr("cadeditor.message.genericschema.8e5e7743ac"));
        return out;
    }
    public static boolean specialized(Entity entity, CompoundTag saved, RegistryAccess access) {
        return specialized(EntityWorldEdit.specializedViews(entity,saved,access));
    }
    static boolean specialized(JsonObject views) {
        // Shared relationship/read-only sections are not a type-specific editor.
        return views.keySet().stream().anyMatch(key -> !Set.of("riding","team","leash").contains(key));
    }
    public static JsonObject view(String kind, String id, CompoundTag nbt, RegistryAccess access) {
        var row = new JsonObject(); var schema = describe(kind,id,nbt,access,false); row.add("schema",schema);
        var value = new JsonObject();
        if (schema.get("available").getAsBoolean()) for (String key : nbt.keySet()) value.addProperty(key,nbt.get(key).toString());
        row.add("value",value); // The complete SNBT already travels on world.snbt; do not duplicate huge data.
        if (nbt.toString().length() <= MAX_SCHEMA_CHARS) row.addProperty("snbt",nbt.toString());
        return row;
    }
    public static CompoundTag apply(String kind, String id, CompoundTag base, JsonObject edits, RegistryAccess access) {
        var schema = describe(kind,id,base,access,false);
        if (!schema.get("available").getAsBoolean()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.e938110747"));
        var fields = schema.getAsJsonObject("fields"); var next = base.copy();
        for (var edit : edits.entrySet()) {
            String key = edit.getKey(); var field = fields.getAsJsonObject(key);
            if (field == null || !field.get("editable").getAsString().equals("structured"))
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.15a75436a9", (key)));
            if (!edit.getValue().isJsonPrimitive() || !edit.getValue().getAsJsonPrimitive().isString())
                throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.91a0843ea0"));
            // Parse exactly one bounded SNBT value; a wrapper would accept injected duplicate keys.
            Tag value = dev.rinorsi.editor.ComponentValidation.parseSnbt(edit.getValue().getAsString());
            if (value == null || value.getId() != base.get(key).getId()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.genericschema.579f83cd16", (key)));
            next.put(key,value.copy());
        }
        WorldNbt.protect(base,next,kind.equals("entity")); return next;
    }
    public static void requireRetained(CompoundTag requested, CompoundTag saved) {
        for (String key : requested.keySet()) if (!Objects.equals(requested.get(key),saved.get(key)))
            throw new EditorSessions.Failure("invalid_nbt",EditorI18n.tr("cadeditor.message.genericschema.947e126403", (key)));
    }
    public static boolean hasEdits(JsonObject request) {
        return (request.has("views") && dev.rinorsi.editor.StackCodec.object(request,"views").has("generic"))
                || (request.has("entity") && dev.rinorsi.editor.StackCodec.object(request,"entity").has("generic"));
    }
    private static void fallback(JsonObject out, String editable, String reason) {
        out.addProperty("editable",editable); out.addProperty("read_only",true);
        out.addProperty("editable_reason",reason); out.addProperty("read_only_reason",reason);
    }
    private static final class Inspector {
        final RegistryAccess access; final List<HolderLookup.RegistryLookup<?>> worldRegistries;
        final List<Registry<?>> staticRegistries=new ArrayList<>();
        final Map<Identifier,SortedSet<String>> registryIds = new HashMap<>(); int nodes;
        Inspector(RegistryAccess access) {
            this.access = access;
            // World registry values take precedence; static registries fill unsynchronized gaps.
            // Query only the actual strings in this NBT, not every entry of every registry per entity.
            worldRegistries=access.listRegistries().toList();
            var seen = new HashSet<String>();
            worldRegistries.forEach(registry -> seen.add(registry.key().identifier().toString()));
            for (var registry : BuiltInRegistries.REGISTRY) {
                String name = registry.key().identifier().toString();
                if (!seen.contains(name)) staticRegistries.add(registry);
            }
        }
        private SortedSet<String> matches(Identifier id) {
            return registryIds.computeIfAbsent(id,key->{
                var matches=new TreeSet<String>();
                for(var registry:worldRegistries)if(contains(registry,key))matches.add(registry.key().identifier().toString());
                for(var registry:staticRegistries)if(registry.containsKey(key))matches.add(registry.key().identifier().toString());
                return matches;
            });
        }
        @SuppressWarnings("unchecked")
        private static <T> boolean contains(HolderLookup.RegistryLookup<T> registry, Identifier id) {
            // RegistryLookup exposes a covariant registry key; the lookup itself is its authority.
            var key=(net.minecraft.resources.ResourceKey<? extends Registry<T>>)(net.minecraft.resources.ResourceKey<?>)registry.key();
            return registry.get(net.minecraft.resources.ResourceKey.create(key,id)).isPresent();
        }
        JsonObject field(Tag value, List<String> path, int depth) {
            var out = new JsonObject(); String type = "unknown";
            out.addProperty("nbt_type",switch(value.getId()) {
                case Tag.TAG_BYTE_ARRAY -> "byte_array"; case Tag.TAG_INT_ARRAY -> "int_array"; case Tag.TAG_LONG_ARRAY -> "long_array";
                default -> value.getType().getName().toLowerCase(Locale.ROOT);
            });
            var p = new JsonArray(); path.forEach(p::add); out.add("nbtPath",p);
            out.addProperty("default_snbt",value.toString()); out.addProperty("nullable",false);
            out.addProperty("editable","structured"); out.addProperty("read_only",false);
            out.addProperty("authority","runtime_nbt_shape_and_detached_loader");
            if (++nodes > MAX_NODES || depth > MAX_DEPTH) fallback(out,"snbt_only",EditorI18n.tr("cadeditor.message.genericschema.d7fdf823df"));
            else if (value instanceof ByteTag b && (b.byteValue() == 0 || b.byteValue() == 1)) {
                fallback(out,"snbt_only",EditorI18n.tr("cadeditor.message.genericschema.d1d209563c"));
            } else if (value instanceof ByteTag || value instanceof ShortTag || value instanceof IntTag || value instanceof LongTag) type = "integer";
            else if (value instanceof FloatTag || value instanceof DoubleTag) type = "number";
            else if (value instanceof StringTag s) {
                type = "string"; Identifier id = Identifier.tryParse(s.value());
                var matches = id == null ? null : matches(id);
                if (matches != null && !matches.isEmpty()) {
                    type = "identifier"; var registries = new JsonArray(); matches.forEach(registries::add);
                    out.add("registry_matches",registries); var source = new JsonObject(); source.addProperty("kind","registry"); source.add("registries",registries.deepCopy());
                    out.add("candidate_source",source); out.addProperty("allowManual",true);
                }
            } else if (value instanceof CompoundTag compound) {
                if (exact(ItemStack.CODEC,value)) type = "stack";
                else if (exact(BlockState.CODEC,value)) type = "block_state";
                else {
                    type = "object"; var children = new JsonObject();
                    for (String key : new TreeSet<>(compound.keySet())) { if(nodes>=MAX_NODES)break;var nested = new ArrayList<>(path); nested.add(key); children.add(key,field(compound.get(key),nested,depth+1)); }
                    out.add("fields",children);out.addProperty("fields_complete",children.size()==compound.size());
                }
                fallback(out,"snbt_only",EditorI18n.tr("cadeditor.message.genericschema.ca6527bd5d"));
            } else if (value instanceof ListTag list) {
                type = "array"; var elements = new JsonArray();
                for (int i=0;i<list.size() && nodes<MAX_NODES;i++) { var nested=new ArrayList<>(path);nested.add(Integer.toString(i));elements.add(field(list.get(i),nested,depth+1)); }
                out.add("elements",elements);out.addProperty("elements_complete",elements.size()==list.size());out.addProperty("length",list.size());
                fallback(out,"snbt_only",EditorI18n.tr("cadeditor.message.genericschema.6b20793af4"));
            } else fallback(out,"snbt_only",EditorI18n.tr("cadeditor.message.genericschema.d5ec4d0619"));
            out.addProperty("type",type); out.addProperty("kind",type); return out;
        }
        private <T> boolean exact(Codec<T> codec, Tag value) {
            try { var ops=access.createSerializationContext(NbtOps.INSTANCE);var parsed=codec.parse(ops,value);
                return parsed.isSuccess() && codec.encodeStart(ops,parsed.getOrThrow()).result().filter(value::equals).isPresent();
            } catch (RuntimeException error) { return false; }
        }
    }
}
