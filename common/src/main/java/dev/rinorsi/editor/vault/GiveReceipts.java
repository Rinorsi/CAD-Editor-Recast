package dev.rinorsi.editor.vault;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.EditorSessions;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.function.Supplier;

/** Connection-lifetime idempotency. Never evict successful ids and accidentally execute them again. */
public final class GiveReceipts {
    private record Receipt(String digest, JsonObject response) {}
    private final Map<String, Receipt> receipts = new HashMap<>();
    public JsonObject execute(JsonObject request, Supplier<JsonObject> write) {
        String id = dev.rinorsi.editor.StackCodec.string(request, "requestId");
        if (id.isBlank() || id.length() > 80) EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.givereceipts.5281a12cd8"));
        String digest;
        try { digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        Receipt old = receipts.get(id);
        if (old != null) {
            if (!old.digest.equals(digest)) EditorSessions.fail("request_id_conflict", EditorI18n.tr("cadeditor.message.givereceipts.7e9cdaac16"));
            return old.response.deepCopy();
        }
        if (receipts.size() >= 4096) EditorSessions.fail("rate_limited", EditorI18n.tr("cadeditor.message.givereceipts.a3fb0a711a"));
        JsonObject result = write.get();
        receipts.put(id, new Receipt(digest, result.deepCopy()));
        return result;
    }
}
