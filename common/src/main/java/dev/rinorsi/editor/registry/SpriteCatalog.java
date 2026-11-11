package dev.rinorsi.editor.registry;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.rinorsi.editor.mixin.client.EditorAtlasAccessor;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.data.AtlasIds;
import net.minecraft.resources.Identifier;

/** Loaded sprites, including resource packs and mods; never infer a sprite from an item ID. */
public final class SpriteCatalog {
    private SpriteCatalog() {}
    public static boolean handles(String kind) { return kind.equals("sprite_atlas") || kind.equals("sprite"); }
    private record Atlas(String id, Set<Identifier> sprites, boolean items) {}

    /** The iterator is consumed by SearchChannel's bounded client-tick capture, not the index worker. */
    public static Iterator<JsonObject> iterator(String kind) {
        List<Atlas> atlases = new ArrayList<>();
        Minecraft.getInstance().getAtlasManager().forEach((id, atlas) -> {
            var sprites = ((EditorAtlasAccessor) atlas).cadeditor$sprites();
            atlases.add(new Atlas(id.toString(), sprites.keySet(), id.equals(AtlasIds.ITEMS)));
        });
        if (kind.equals("sprite_atlas")) return atlases.stream().map(atlas -> {
            JsonObject row = new JsonObject();
            row.addProperty("id", atlas.id()); row.addProperty("name", atlas.id());
            row.addProperty("count", atlas.sprites().size()); row.addProperty("items", atlas.items());
            return row;
        }).iterator();
        return new Iterator<>() {
            int nextAtlas; Atlas atlas; Iterator<Identifier> sprites = Set.<Identifier>of().iterator();
            public boolean hasNext() {
                while (!sprites.hasNext() && nextAtlas < atlases.size()) {
                    atlas = atlases.get(nextAtlas++); sprites = atlas.sprites().iterator();
                }
                return sprites.hasNext();
            }
            public JsonObject next() {
                if (!hasNext()) throw new NoSuchElementException();
                String sprite = sprites.next().toString(); JsonObject row = new JsonObject();
                row.addProperty("id", atlas.id() + "|" + sprite); row.addProperty("name", sprite);
                row.addProperty("atlas", atlas.id()); row.addProperty("sprite", sprite);
                JsonArray tags = new JsonArray(); tags.add(atlas.id()); row.add("tags", tags);
                return row;
            }
        };
    }
}
