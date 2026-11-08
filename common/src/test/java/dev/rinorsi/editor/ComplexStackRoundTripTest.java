package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.testing.ComplexStackFixture;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;

/** Run with --expect-bug to preserve pre-fix evidence; no game or input devices. */
public final class ComplexStackRoundTripTest {
    public static void main(String[] args) {
        net.minecraft.SharedConstants.tryDetectVersion(); net.minecraft.server.Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var builtins = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        RegistryAccess access = new RegistryAccess() {
            @Override public <E> java.util.Optional<net.minecraft.core.Registry<E>> lookup(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<? extends E>> key) { return builtins.lookup(key); }
            @Override public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries() { return builtins.registries(); }
            @Override public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(com.mojang.serialization.DynamicOps<V> ops) { return lookup.createSerializationContext(ops); }
        };
        var actual = ComplexStackFixture.create(lookup);
        var snapshot = com.google.gson.JsonParser.parseString(StackCodec.snapshot(actual, access, new JsonObject(), "complex").toString()).getAsJsonObject();
        var original = StackCodec.decode(snapshot, access, actual);
        var apply = snapshot.deepCopy(); apply.remove("component_snbt"); // actual applyToGame payload
        // JSON.parse/stringify in the page has only IEEE754 numbers (not NBT long).
        apply.getAsJsonObject("comps").getAsJsonObject("custom_data").addProperty("long", 9007199254740992d);
        apply.getAsJsonObject("comps").getAsJsonObject("custom_data").getAsJsonObject("nested").getAsJsonArray("longs").set(0, new com.google.gson.JsonPrimitive(9007199254740992d));
        var noEdit = StackCodec.decode(apply, access, original);
        boolean same = ItemStack.matches(actual, original) && ItemStack.matches(actual, noEdit);
        for (var component : actual.getComponents()) {
            var a = component.value(); var b = original.get(component.type());
            if (!java.util.Objects.equals(a, b)) System.out.println("DIFF " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type()) + " originalClass=" + a.getClass().getName() + " decodedClass=" + (b == null ? "null" : b.getClass().getName()) + " equals=false");
        }
        System.out.println("open.matches=" + ItemStack.matches(actual, original) + " apply.matches=" + ItemStack.matches(actual, noEdit)
                + " fingerprint.same=" + EditorSessions.fingerprint(actual, access).equals(EditorSessions.fingerprint(original, access)));
        if (args.length > 0 && args[0].equals("--expect-bug")) { if (same) throw new AssertionError("bug not reproduced"); System.out.println("PASS pre-fix reproduction: untouched complex spear differs"); return; }
        if (!same) throw new AssertionError("untouched complex item changed during host open/apply");
        for (var component : dev.rinorsi.editor.ComponentPatches.entries(actual.getComponentsPatch())) {
            if (component.getValue().isPresent() && original.get(component.getKey()) != component.getValue().get())
                throw new AssertionError("untouched component object was unnecessarily replaced: " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.getKey()));
        }
        var changed = actual.copy();
        var custom = changed.get(net.minecraft.core.component.DataComponents.CUSTOM_DATA).copyTag();
        custom.putInt("changed", 1); changed.set(net.minecraft.core.component.DataComponents.CUSTOM_DATA, net.minecraft.world.item.component.CustomData.of(custom));
        if (StackComparison.matches(actual, changed, access)) throw new AssertionError("real typed data mutation must be rejected");
        if (StackComparison.differences(actual, changed, access).stream().noneMatch(s -> s.startsWith("minecraft:custom_data"))) throw new AssertionError("component diff missing");
        if (StackCodec.sameJson(com.google.gson.JsonParser.parseString("9007199254740992"), com.google.gson.JsonParser.parseString("9007199254740993"))) throw new AssertionError("large integer comparison rounded");
        System.out.println("PASS complex spear exact component equality through host open/no-edit apply");
    }
}
