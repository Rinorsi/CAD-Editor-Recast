package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.lang.reflect.*;
import java.util.*;

/** Standalone regression checks; no Minecraft world or Gradle runClient required. */
public final class RegistryDeliveryTest {
    public static void main(String[] args) throws Exception {
        List<JsonObject> rows = new ArrayList<>();
        for (int i = 0; i < 5209; i++) {
            JsonObject row = new JsonObject();
            row.addProperty("id", "test:row_" + String.format(Locale.ROOT, "%05d", i));
            row.addProperty("name", "汉字😀引号\"\n".repeat(3)); rows.add(row);
        }
        RegistryIndex index = RegistryIndex.build("test:rows", "generation-test", rows);
        int received = 0;
        for (String encoded : index.pages()) {
            if (encoded.length() > 20000) throw new AssertionError("index page exceeds target");
            JsonObject page = JsonParser.parseString(encoded).getAsJsonObject();
            if (page.get("offset").getAsInt() != received) throw new AssertionError("offset gap");
            for (JsonElement row : page.getAsJsonArray("entries")) {
                if (!row.equals(rows.get(received++))) throw new AssertionError("lost/changed row");
            }
            if (page.get("done").getAsBoolean() != (received == rows.size())) throw new AssertionError("incorrect done");
        }
        if (received != rows.size() || index.pages().size() > 80) throw new AssertionError("small-page regression");

        Class<?> stateClass = Class.forName("dev.rinorsi.editor.registry.RegistryBridge$State");
        Constructor<?> constructor = stateClass.getDeclaredConstructor(); constructor.setAccessible(true);
        Object state = constructor.newInstance();
        Map<Object, Object> documents = field(RegistryBridge.class, null, "DOCUMENTS");
        // WeakHashMap accepts null: exercise queueing without constructing a driver/window.
        documents.put(null, state);
        try {
            Method enqueue = RegistryBridge.class.getDeclaredMethod("queuePages", dev.oriel.mod.client.DocumentDriver.class, String.class, List.class, JsonObject.class, boolean.class);
            enqueue.setAccessible(true);
            Map<String, Object> bulk = field(stateClass, state, "pages");
            Map<String, Object> interactive = field(stateClass, state, "interactive");
            JsonObject context = new JsonObject();
            enqueue.invoke(null, null, "registry.items", List.of("offset0", "offset1"), context, false);
            Object batch = bulk.values().iterator().next();
            Method pages = batch.getClass().getDeclaredMethod("pages"); pages.setAccessible(true);
            Iterator<?> cursor = (Iterator<?>) pages.invoke(batch);
            if (!cursor.next().equals("offset0")) throw new AssertionError("bad first page");
            enqueue.invoke(null, null, "registry.enum:rarity", List.of("enum"), context, true);
            if (bulk.size()!=1 || interactive.size()!=1) throw new AssertionError("interactive displaced bulk");
            enqueue.invoke(null, null, "registry.items", List.of("restarted"), context, true);
            if (!bulk.isEmpty() || interactive.size()!=2 || !cursor.next().equals("offset1")) throw new AssertionError("promotion lost cursor");
            enqueue.invoke(null, null, "registry.items", List.of("duplicate"), context, true);
            if (interactive.get("registry.items|{}")!=batch) throw new AssertionError("duplicate restarted cursor");
            for (String id : List.of("test:a", "test:b")) {
                JsonObject ctx = new JsonObject(); ctx.addProperty("id", id);
                enqueue.invoke(null, null, "registry.block_properties", List.of(id), ctx, true);
            }
            if (interactive.size()!=4) throw new AssertionError("different IDs coalesced");
            for (int i=0;i<100;i++) enqueue.invoke(null, null, "registry.test"+i, List.of("page"), context, true);
            if (interactive.size()!=64) throw new AssertionError("interactive queue unbounded");
        } finally { documents.remove(null); }
        System.out.println("PASS delivery: UTF-16 pagination/reassembly, priority lanes, cursor promotion, duplicate coalescing, ID isolation and queue limit");
    }
    @SuppressWarnings("unchecked")
    private static <T> T field(Class<?> type, Object owner, String name) throws Exception {
        Field field = type.getDeclaredField(name); field.setAccessible(true); return (T) field.get(owner);
    }
}
