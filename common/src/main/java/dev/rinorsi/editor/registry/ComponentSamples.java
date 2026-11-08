package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.*;
import com.mojang.serialization.JsonOps;

/** Test-kit specimens derived from live item prototypes and component Codecs. */
public final class ComponentSamples {
    private ComponentSamples() {}
    public static <T> ItemStack nonDefault(DataComponentType<T> type, HolderLookup.Provider lookup) {
        T sample = null;
        var ops = lookup.createSerializationContext(JsonOps.INSTANCE);
        for (var source : BuiltInRegistries.ITEM) {
            T candidate = source.components().get(type);
            if (candidate == null) continue;
            var encoded = type.codec().encodeStart(ops, candidate).getOrThrow();
            for (var carrier : BuiltInRegistries.ITEM) {
                if (carrier == Items.AIR) continue;
                T original = carrier.components().get(type);
                if (original != null && encoded.equals(type.codec().encodeStart(ops, original).getOrThrow())) continue;
                var stack = new ItemStack(carrier); stack.set(type, candidate);
                if (ItemStack.validateStrict(stack).isSuccess()) return stack;
            }
        }
        for (var item : BuiltInRegistries.ITEM) {
            sample = item.components().get(type);
            if (sample != null) break;
        }
        {
            var builtins = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
            RegistryAccess access = new RegistryAccess() {
                @Override public <E> Optional<Registry<E>> lookup(net.minecraft.resources.ResourceKey<? extends Registry<? extends E>> key) { return builtins.lookup(key); }
                @Override public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries() { return builtins.registries(); }
                @Override public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(com.mojang.serialization.DynamicOps<V> ops) { return lookup.createSerializationContext(ops); }
            };
            var schema = ComponentSchema.derive(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type).toString(), access);
            var value = derive(schema.root(), access, 0);
            if (value != null) sample = type.codec().parse(lookup.createSerializationContext(JsonOps.INSTANCE), value).getOrThrow();
        }
        if (sample == null) throw new IllegalStateException("No live Codec sample for " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type));
        for (var item : BuiltInRegistries.ITEM) {
            if (item == Items.AIR) continue;
            T original = item.components().get(type);
            if (original != null && type.codec().encodeStart(ops, original).getOrThrow().equals(type.codec().encodeStart(ops, sample).getOrThrow())) continue;
            var stack = new ItemStack(item); stack.set(type, sample);
            if (ItemStack.validateStrict(stack).isSuccess()) return stack;
        }
        throw new IllegalStateException("No nondefault carrier for " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type) + " sample=" + type.codec().encodeStart(ops, sample).getOrThrow());
    }
    private static JsonElement derive(ComponentSchema.Node n,net.minecraft.core.RegistryAccess access,int depth){
        if(depth>12)return null;List<JsonElement> probes=new ArrayList<>();
        if(n.json.has("default") && n.json.get("default").isJsonPrimitive()) {
            var d=n.json.getAsJsonPrimitive("default");
            if(d.isNumber()) probes.add(new JsonPrimitive(d.getAsDouble()+1));
            if(d.isBoolean()) probes.add(new JsonPrimitive(!d.getAsBoolean()));
        }
        if(n.json.has("values"))n.json.getAsJsonArray("values").forEach(probes::add);
        if(n.json.has("registry")){String reg=n.json.get("registry").getAsString();access.listRegistries().filter(r->r.key().identifier().toString().equals(reg)).forEach(r->r.listElements().limit(32).forEach(h->probes.add(new JsonPrimitive(h.key().identifier().toString()))));}
        if(!n.fields.isEmpty()){JsonObject obj=new JsonObject();boolean complete=true;for(var e:n.fields.entrySet()){var v=derive(e.getValue(),access,depth+1);if(v==null){complete=false;break;}obj.add(e.getKey(),v);}if(complete)probes.add(obj);}
        for(var alt:n.alternatives){var v=derive(alt,access,depth+1);if(v!=null)probes.add(v);}
        if(n.element!=null&&n.key==null){var v=derive(n.element,access,depth+1);if(v!=null){var a=new JsonArray();int min=n.json.has("min_size")?Math.min(64,n.json.get("min_size").getAsInt()):1;for(int i=0;i<Math.max(1,min);i++)a.add(v);probes.add(a);}}
        if(n.json.has("min"))probes.add(n.json.get("min"));
        if(n.json.has("default"))probes.add(n.json.get("default"));
        probes.addAll(List.of(new JsonObject(),new JsonArray(),new JsonPrimitive(0),new JsonPrimitive(1),new JsonPrimitive(-1),new JsonPrimitive(false),new JsonPrimitive(true),new JsonPrimitive("")));
        for(var v:probes)try{if(n.codec.parse(access.createSerializationContext(JsonOps.INSTANCE),v).isSuccess())return v;}catch(RuntimeException ignored){}return null;
    }
}
