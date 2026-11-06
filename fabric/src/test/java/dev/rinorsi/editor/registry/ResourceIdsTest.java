package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.lang.reflect.Proxy;
import java.util.*;
import java.util.function.Predicate;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.world.entity.player.PlayerSkin;

/** Conversion regression: UI-write IDs must reproduce the original file through the actual game texture type. */
public final class ResourceIdsTest {
    public static void main(String[] args) { run(); }
    public static void run() {
        var files = List.of("minecraft:textures/misc/pumpkinblur.png", "pack:textures/gui/nested/overlay.png",
                "pack:textures/entity/player/slim/test.png", "pack:textures/entity/capes/test.png",
                "pack:textures/entity/equipment/wings/test.png", "pack:items/nested/model.json",
                "pack:textures/block/stone.png", "pack:textures/misc/readme.txt");
        ResourceManager resources = (ResourceManager) Proxy.newProxyInstance(ResourceManager.class.getClassLoader(), new Class<?>[]{ResourceManager.class},
                (proxy, method, values) -> {
                    if (!method.getName().equals("listResources")) throw new UnsupportedOperationException(method.getName());
                    String prefix = (String) values[0];
                    @SuppressWarnings("unchecked") Predicate<Identifier> filter = (Predicate<Identifier>) values[1];
                    Map<Identifier, Resource> found = new HashMap<>();
                    for (String file : files) {
                        var id = Identifier.parse(file);
                        if (id.getPath().startsWith(prefix + "/") && filter.test(id)) found.put(id, null);
                    }
                    return found;
                });
        var overlays = ResourceIds.entries(resources, "camera_overlay");
        check(overlays.size() == 2, "misc and gui PNG only");
        check(find(overlays, "minecraft:misc/pumpkinblur").get("resource").getAsString().equals("minecraft:textures/misc/pumpkinblur.png"), "vanilla pumpkin overlay");
        for (String name : List.of("camera_overlay", "profile_texture", "profile_cape", "profile_elytra")) {
            var rows = ResourceIds.entries(resources, name);
            check(!rows.isEmpty(), "texture source " + name);
            for (var element : rows) {
                var row = element.getAsJsonObject();
                var texture = ClientAsset.ResourceTexture.CODEC.parse(JsonOps.INSTANCE, row.get("id")).getOrThrow();
                check(texture.texturePath().toString().equals(row.get("resource").getAsString()), "game resolves exact resource " + name);
                check(ClientAsset.ResourceTexture.CODEC.encodeStart(JsonOps.INSTANCE, texture).getOrThrow().equals(row.get("id")), "codec encodes asset ID " + name);
            }
        }
        var profile = JsonParser.parseString("""
                {"texture":"pack:entity/player/slim/test","cape":"pack:entity/capes/test","elytra":"pack:entity/equipment/wings/test"}
                """);
        var patch = PlayerSkin.Patch.MAP_CODEC.codec().parse(JsonOps.INSTANCE, profile).getOrThrow();
        check(patch.body().orElseThrow().texturePath().toString().equals("pack:textures/entity/player/slim/test.png"), "profile texture patch resolves file");
        check(patch.cape().orElseThrow().texturePath().toString().equals("pack:textures/entity/capes/test.png"), "profile cape patch resolves file");
        check(patch.elytra().orElseThrow().texturePath().toString().equals("pack:textures/entity/equipment/wings/test.png"), "profile elytra patch resolves file");
        var model = find(ResourceIds.entries(resources, "item_model"), "pack:nested/model");
        check(model.get("resource").getAsString().equals("pack:items/nested/model.json"), "item model semantics unchanged");
        System.out.println("PASS ResourceIdsTest: camera misc/gui, namespaced nested textures, actual ResourceTexture/profile codecs and model IDs");
    }
    private static JsonObject find(JsonArray rows, String id) {
        for (var row : rows) if (row.getAsJsonObject().get("id").getAsString().equals(id)) return row.getAsJsonObject();
        throw new AssertionError("missing writable ID " + id);
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
