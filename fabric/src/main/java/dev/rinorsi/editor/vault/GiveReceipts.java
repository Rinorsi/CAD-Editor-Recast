package dev.rinorsi.editor.vault;

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
        if (id.isBlank() || id.length() > 80) EditorSessions.fail("invalid_request", "取出请求编号无效");
        String digest;
        try { digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
        Receipt old = receipts.get(id);
        if (old != null) {
            if (!old.digest.equals(digest)) EditorSessions.fail("request_id_conflict", "同一取出请求编号不能用于不同物品或槽位");
            return old.response.deepCopy();
        }
        if (receipts.size() >= 4096) EditorSessions.fail("rate_limited", "本次连接取出请求过多，请重新连接后再试");
        JsonObject result = write.get();
        receipts.put(id, new Receipt(digest, result.deepCopy()));
        return result;
    }
}
