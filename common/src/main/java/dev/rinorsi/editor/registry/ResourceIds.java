package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import net.minecraft.server.packs.resources.ResourceManager;

/** Writable asset IDs plus their full source file IDs (including resource packs and mods). */
public final class ResourceIds {
    private ResourceIds() {}
    public static boolean handles(String name) {
        return switch (name) {
            case "camera_overlay", "profile_texture", "profile_cape", "profile_elytra", "item_model" -> true;
            default -> false;
        };
    }
    public static JsonArray entries(ResourceManager resources, String name) {
        boolean model = name.equals("item_model");
        String prefix = switch (name) {
            case "camera_overlay" -> "textures";
            case "profile_texture" -> "textures/entity/player";
            case "profile_cape", "profile_elytra" -> "textures/entity";
            case "item_model" -> "items";
            default -> throw new IllegalArgumentException("未知资源列表: " + name);
        };
        JsonArray rows = new JsonArray();
        resources.listResources(prefix, id -> {
            String path = id.getPath();
            if (model) return path.endsWith(".json");
            if (!path.endsWith(".png")) return false;
            if (name.equals("camera_overlay")) return path.startsWith("textures/misc/") || path.startsWith("textures/gui/");
            if (name.equals("profile_cape")) return segment(path, "cape") || segment(path, "capes");
            if (name.equals("profile_elytra")) return segment(path, "elytra") || segment(path, "wings");
            return true;
        }).keySet().stream().sorted(java.util.Comparator.comparing(Object::toString)).forEach(resource -> {
            // Gui.extractCameraOverlays and ClientAsset.ResourceTexture both resolve textures/<id.path>.png.
            String id = model ? resource.getNamespace() + ":" + resource.getPath().substring(6, resource.getPath().length() - 5)
                    : resource.getNamespace() + ":" + resource.getPath().substring("textures/".length(), resource.getPath().length() - ".png".length());
            var row = RegistrySupplement.row(id); row.addProperty("resource", resource.toString()); rows.add(row);
        });
        return rows;
    }
    private static boolean segment(String path, String part) {
        return path.contains("/" + part + "/") || path.endsWith("/" + part + ".png");
    }
}
