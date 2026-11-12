package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonParser;
import dev.oriel.engine.dom.Document;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.EditorDiagnostics;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.world.level.storage.LevelResource;

/** Local drafts only: stable connection/world scope, no world write or session authorization. */
public final class WorldDraftHost {
    private static final Map<Document, Boolean> BOUND = new WeakHashMap<>();
    private WorldDraftHost() {}

    public static String scope() {
        try {
            var mc = Minecraft.getInstance();
            if (mc == null || mc.level == null) return null;
            String identity;
            var server = mc.getSingleplayerServer();
            if (server != null) identity = "single:" + server.getWorldPath(LevelResource.ROOT).toRealPath().toString();
            else {
                var remote = mc.getCurrentServer();
                if (remote == null || remote.ip == null || remote.ip.isBlank()) return null;
                identity = "remote:" + remote.ip.trim().toLowerCase(java.util.Locale.ROOT);
            }
            return digest(identity);
        } catch (Exception error) {
            EditorDiagnostics.failure("drafts.world.scope", "stable world/server identity unavailable", error);
            return null;
        }
    }

    static String digest(String identity) {
        try { return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }

    public static void bind(DocumentDriver driver) {
        if (driver.serverSession()) return;
        var doc = driver.document(); String scope = scope();
        if (doc == null || scope == null) return;
        bindDocument(doc, scope, EditorPrefs::putDraft, EditorPrefs::clearDraft, EditorPrefs::flush);
    }

    static void bindDocument(Document doc, String scope, java.util.function.BiPredicate<String, String> put,
                             java.util.function.Predicate<String> clear, Runnable flush) {
        if (BOUND.putIfAbsent(doc, true) != null) return;
        // Oriel0.15 DocumentDriver.close nulls driver.document then Document.close dispatches
        // pagehide while scripts are still alive, BEFORE dispose and driver.onClose handlers.
        // Capture this exact Document, not driver.document() or the currently active item Store.
        doc.addEventListener("pagehide", event -> {
            try {
                capture(doc, scope, put, clear);
                flush.run();
            } catch (RuntimeException error) {
                EditorDiagnostics.failure("drafts.world.close_flush", "scope=" + scope, error);
            } finally { BOUND.remove(doc); }
        });
    }

    private static void capture(Document document, String scope, java.util.function.BiPredicate<String, String> put,
                                java.util.function.Predicate<String> clear) {
        try {
            if (document.scripts() == null) throw new IllegalStateException("pagehide scripts unavailable");
            String json = document.scripts().evaluateToJson("(function(){var p={items:[],world:null};try{if(typeof Drafts!=='undefined'&&Drafts.exportPackets)p.items=Drafts.exportPackets();}catch(e){p.itemError=String(e);}try{if(typeof WorldDrafts!=='undefined')p.world=WorldDrafts.exportPacket();}catch(e){p.worldError=String(e);}return p;})()", "editor-draft-close");
            if (json == null || json.equals("null")) return;
            if (json.length() > 2 * EditorPrefs.MAX_DRAFTS_BYTES) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worlddrafthost.3a2103ad4d"));
            var bundle = JsonParser.parseString(json).getAsJsonObject();
            if(bundle.has("itemError"))EditorDiagnostics.failure("drafts.item.close_capture","scope="+scope,new IllegalStateException(bundle.get("itemError").getAsString()));
            if(bundle.has("worldError"))EditorDiagnostics.failure("drafts.world.close_capture","scope="+scope,new IllegalStateException(bundle.get("worldError").getAsString()));
            if(bundle.has("items")&&bundle.get("items").isJsonArray())for(var value:bundle.getAsJsonArray("items")){
                String key = "<invalid>";
                try {
                    var item=value.getAsJsonObject();key=item.get("key").getAsString();
                    if(key.startsWith("world|")||!EditorPrefs.validDraftKey(key)||!key.contains("|"))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worlddrafthost.b39613130e"));
                    persist(item,key,put,clear);
                }catch(RuntimeException error){EditorDiagnostics.failure("drafts.item.close_capture","scope="+scope+" key="+key,error);}
            }
            if(!bundle.has("world")||bundle.get("world").isJsonNull())return;
            var packet = bundle.getAsJsonObject("world");
            String key = packet.get("key").getAsString();
            if (!key.startsWith("world|" + scope + "|")) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worlddrafthost.fe387b1893"));
            persist(packet,key,put,clear);
        } catch (RuntimeException error) {
            EditorDiagnostics.failure("drafts.world.close_capture", "scope=" + scope, error);
        }
    }
    private static void persist(com.google.gson.JsonObject packet,String key,java.util.function.BiPredicate<String,String> put,java.util.function.Predicate<String> clear){
        if(packet.has("clean")&&packet.get("clean").getAsBoolean()){
            if(packet.has("clear")&&packet.get("clear").getAsBoolean()&&!clear.test(key))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worlddrafthost.31e16ddd0f"));
        }else if(!put.test(key,packet.get("value").getAsString()))throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.worlddrafthost.71faf079bb"));
    }
}
