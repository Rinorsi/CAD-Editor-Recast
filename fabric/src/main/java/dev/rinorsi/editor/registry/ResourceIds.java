package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import net.minecraft.server.packs.resources.ResourceManager;

/** File IDs in the active resource manager (including resource packs and mods). */
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
            case "camera_overlay" -> "textures/gui";
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
            if (name.equals("profile_cape")) return segment(path, "cape") || segment(path, "capes");
            if (name.equals("profile_elytra")) return segment(path, "elytra") || segment(path, "wings");
            return true;
        }).keySet().stream().sorted(java.util.Comparator.comparing(Object::toString)).forEach(resource -> {
            String id = model ? resource.getNamespace() + ":" + resource.getPath().substring(6, resource.getPath().length() - 5) : resource.toString();
            var row = RegistrySupplement.row(id); row.addProperty("resource", resource.toString()); rows.add(row);
        });
        return rows;
    }
    private static boolean segment(String path, String part) {
        return path.contains("/" + part + "/") || path.endsWith("/" + part + ".png");
    }
}
