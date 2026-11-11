package dev.rinorsi.editor.world;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.*;

/** Host-only compression; UI still receives ordinary JSON. Bounded before allocation. */
public final class WorldWire {
    public static final int MAX_DECODED_BYTES = 8 * 1024 * 1024;
    private WorldWire() {}
    public static String encode(JsonObject value) {
        byte[] bytes = value.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_DECODED_BYTES) EditorSessions.fail("payload_too_large", "世界目标展开快照超过 8 MiB");
        if (value.toString().length() <= 16000 && bytes.length < 30000) return value.toString();
        try {
            var buffer = new ByteArrayOutputStream(); try (var gzip = new GZIPOutputStream(buffer)) { gzip.write(bytes); }
            var envelope = new JsonObject(); envelope.addProperty("worldEncoding", "gzip-base64"); envelope.addProperty("data", Base64.getEncoder().encodeToString(buffer.toByteArray()));
            String json = envelope.toString();
            // The shared packet transport splits large envelopes before sending.
            return json;
        } catch (IOException e) { throw new IllegalArgumentException("世界目标压缩失败", e); }
    }
    public static JsonObject decode(JsonObject value) {
        if (!value.has("worldEncoding")) return value;
        if (!"gzip-base64".equals(value.get("worldEncoding").getAsString())) EditorSessions.fail("invalid_request", "未知世界编辑压缩格式");
        try {
            byte[] zipped = Base64.getDecoder().decode(StackCodec.string(value, "data"));
            try (var gzip = new GZIPInputStream(new ByteArrayInputStream(zipped))) {
                byte[] bytes = gzip.readNBytes(MAX_DECODED_BYTES + 1);
                if (bytes.length > MAX_DECODED_BYTES) EditorSessions.fail("payload_too_large", "世界目标展开消息超过 8 MiB");
                var result = JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8)).getAsJsonObject();
                if (result.has("worldEncoding")) EditorSessions.fail("invalid_request", "不允许嵌套压缩消息");
                if (result.has("op")) {
                    if ("player_extended".equals(StackCodec.string(result,"op"))) {
                        // Player views address an explicit UUID target, not the legacy world slot.
                        // Authorization and target/view validation remain in PlayerExtendedEditor.
                        if(result.has("target"))StackCodec.object(result,"target");
                    } else {
                        var slot = StackCodec.object(result,"slot"); String kind = StackCodec.string(slot,"kind");
                        if (!kind.equals("block") && !kind.equals("entity")) EditorSessions.fail("invalid_request", "压缩传输只用于世界目标");
                    }
                }
                return result;
            }
        } catch (IOException e) { throw new IllegalArgumentException("世界目标压缩数据无效",e); }
    }
}
