package dev.rinorsi.editor.registry;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.client.EditorPrefs;

/** Local, bounded draft transport; chunking respects the 8192-character page-message limit. */
final class DraftChannel {
    private record Upload(String token, String key, int length, StringBuilder text, long started, DraftUtf8Counter bytes) {}
    private Upload upload;
    static void attach(DocumentDriver driver) {
        DraftChannel channel = new DraftChannel();
        driver.onMessage("drafts", value -> channel.receive(driver, value));
        driver.onClose(() -> { channel.upload = null; EditorPrefs.flush(); });
    }
    private void receive(DocumentDriver driver, JsonElement value) {
        if (driver.serverSession() || value == null || !value.isJsonObject() || value.toString().length() > 8192) return;
        JsonObject message = value.getAsJsonObject(), result = new JsonObject();
        try {
            String op = text(message, "op"); result.addProperty("op", op);
            String key = message.has("key") ? text(message, "key") : null;
            if (key != null) {
                if (!EditorPrefs.validDraftKey(key)) throw new IllegalArgumentException("草稿键为空、含控制字符或超过1024字节");
                result.addProperty("key", key);
            }
            switch (op) {
                case "get" -> {
                    if (key == null) driver.patch("prefs", EditorPrefs.read());
                    else result.add("value", EditorPrefs.getDraft(key));
                }
                case "clear" -> {
                    if (key == null || !EditorPrefs.clearDraft(key)) throw new IllegalArgumentException("缺少有效草稿键");
                    driver.patch("prefs", EditorPrefs.read());
                }
                case "put" -> {
                    if (key == null || !EditorPrefs.putDraft(key, text(message, "value"))) throw new IllegalArgumentException("草稿必须是有效JSON且UTF-8大小不超过200KiB");
                    driver.patch("prefs", EditorPrefs.read());
                }
                case "begin" -> {
                    String token = text(message, "upload"); int length = integer(message, "length");
                    if (key == null || token.isBlank() || token.length() > 128 || length < 1 || length > EditorPrefs.MAX_DRAFT_BYTES)
                        throw new IllegalArgumentException("草稿上传参数无效");
                    upload = new Upload(token, key, length, new StringBuilder(length), System.nanoTime(), new DraftUtf8Counter());
                    result.addProperty("upload", token); result.addProperty("offset", 0);
                }
                case "chunk" -> {
                    String token = text(message, "upload");
                    if (upload == null || !upload.token.equals(token) || System.nanoTime() - upload.started > 30_000_000_000L)
                        throw new IllegalArgumentException("草稿上传不存在、已替换或超过30秒");
                    String chunk = text(message, "value"); int offset = integer(message, "offset");
                    if (offset != upload.text.length() || chunk.isEmpty() || chunk.length() > upload.length - offset)
                        throw new IllegalArgumentException("草稿分块顺序或长度无效");
                    boolean done = false;
                    if (message.has("done")) {
                        if (!message.get("done").isJsonPrimitive() || !message.getAsJsonPrimitive("done").isBoolean()) throw new IllegalArgumentException("done必须为布尔");
                        done = message.get("done").getAsBoolean();
                    }
                    if (upload.bytes.append(chunk) > EditorPrefs.MAX_DRAFT_BYTES)
                        throw new IllegalArgumentException("草稿超过200KiB");
                    upload.text.append(chunk);
                    result.addProperty("upload", token); result.addProperty("key", upload.key);
                    result.addProperty("offset", upload.text.length()); result.addProperty("done", done);
                    if (done) {
                        if (upload.text.length() != upload.length || !EditorPrefs.putDraft(upload.key, upload.text.toString()))
                            throw new IllegalArgumentException("草稿分块未完整或JSON无效");
                        upload = null; driver.patch("prefs", EditorPrefs.read());
                    }
                }
                default -> throw new IllegalArgumentException("未知草稿操作");
            }
            result.addProperty("status", "accepted");
        } catch (RuntimeException error) {
            upload = null; result.addProperty("status", "rejected"); result.addProperty("reason", error.getMessage());
        }
        driver.patch("drafts.result", result);
    }
    private static String text(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("缺少文本字段: " + field);
        return value.getAsString();
    }
    private static int integer(JsonObject object, String field) {
        JsonElement value = object.get(field);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("缺少整数字段: " + field);
        return value.getAsBigDecimal().intValueExact();
    }
}
