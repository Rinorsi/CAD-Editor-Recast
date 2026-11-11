package dev.rinorsi.editor.registry;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.client.EditorPrefs;

/** Local, bounded draft transport; chunking respects the 8192-character page-message limit. */
final class DraftChannel {
    private record Upload(String token, String key, int length, long sequence, StringBuilder text, long started, DraftUtf8Counter bytes) {}
    private Upload upload;
    private dev.oriel.engine.dom.Document ownerDocument;
    private String owner;
    private DraftWriteOrder order = new DraftWriteOrder();
    private record Confirmed(long sequence, String value) {}
    private final java.util.Map<String, Confirmed> confirmed = new java.util.HashMap<>();
    private void remember(String key, long sequence, String value) {
        confirmed.entrySet().removeIf(entry -> !entry.getValue().value.equals(EditorPrefs.peekDraft(entry.getKey())));
        confirmed.put(key, new Confirmed(sequence, value));
    }
    void requireOwner(dev.oriel.engine.dom.Document document, JsonObject message, JsonObject result) {
        if (document == null || document.scripts() == null) throw new IllegalArgumentException("草稿页面已关闭");
        if (document != ownerDocument) {
            // Boot happens before driver.document assignment; mutations begin only on a complete page.
            String json = document.scripts().evaluateToJson("typeof Drafts==='undefined'?null:Drafts.writer", "draft-owner");
            var identity = json == null ? com.google.gson.JsonNull.INSTANCE : com.google.gson.JsonParser.parseString(json);
            if (!identity.isJsonPrimitive() || !identity.getAsJsonPrimitive().isString()) throw new IllegalArgumentException("草稿页面身份不可用");
            owner = identity.getAsString(); ownerDocument = document;
            order = new DraftWriteOrder(); upload = null; confirmed.clear();
        }
        if (!owner.equals(text(message,"writer"))) throw new IllegalArgumentException("旧页面草稿消息已失效");
        var version = message.get("seq");
        if (version == null || !version.isJsonPrimitive() || !version.getAsJsonPrimitive().isNumber()) throw new IllegalArgumentException("缺少草稿写入版本");
        long seq = version.getAsBigDecimal().longValueExact();
        if(seq < 1 || seq > 9_007_199_254_740_991L) throw new IllegalArgumentException("草稿写入版本无效");
        result.addProperty("writer",owner);result.addProperty("seq",seq);
    }
    static void attach(DocumentDriver driver) {
        DraftChannel channel = new DraftChannel();
        driver.onMessage("drafts", value -> channel.receive(driver, value));
        dev.rinorsi.editor.client.WorldDraftHost.bind(driver);
        driver.onClose(() -> { channel.upload = null; channel.confirmed.clear(); EditorPrefs.flush(); });
    }
    private void receive(DocumentDriver driver, JsonElement value) {
        receive(driver, value, false);
    }
    private void receive(DocumentDriver driver, JsonElement value, boolean deferred) {
        if (driver.serverSession() || value == null || !value.isJsonObject() || value.toString().length() > 8192) return;
        JsonObject message = value.getAsJsonObject(), result = new JsonObject();
        try {
            String op = text(message, "op"); result.addProperty("op", op);
            if (message.has("writer")) result.add("writer", message.get("writer"));
            if (message.has("seq")) result.add("seq", message.get("seq"));
            if (message.has("upload")) result.add("upload", message.get("upload"));
            if (message.has("offset")) result.add("part", message.get("offset"));
            boolean write = op.equals("put") || op.equals("patch") || op.equals("clear") || op.equals("begin") || op.equals("chunk");
            // Initial offer can clear from inside Document.parse, before the driver assigns its
            // new document. Defer once, then authenticate against the actual replacement. A closed
            // page cannot retry indefinitely or bypass ownership.
            if (write && !deferred && driver.document() == null) {
                net.minecraft.client.Minecraft.getInstance().schedule(() -> receive(driver, value, true));
                return;
            }
            if (write) requireOwner(driver.document(),message,result);
            String key = message.has("key") ? text(message, "key") : null;
            if (key != null) {
                if (!EditorPrefs.validDraftKey(key)) throw new IllegalArgumentException("草稿键为空、含控制字符或超过1024字节");
                result.addProperty("key", key);
            }
            switch (op) {
                case "world_bind" -> {
                    // Oriel runs boot scripts inside Document.parse, before assigning driver.document.
                    // Always enqueue (execute may run inline): bind the completed replacement and
                    // refresh prefs after the outgoing pagehide snapshot has reached the same store.
                    net.minecraft.client.Minecraft.getInstance().schedule(() -> {
                        if (driver.document() == null) return;
                        dev.rinorsi.editor.client.WorldDraftHost.bind(driver);
                        driver.patch("prefs", EditorPrefs.read());
                    });
                }
                case "get" -> {
                    if (key == null) driver.patch("prefs", EditorPrefs.read());
                    else result.add("value", EditorPrefs.getDraft(key));
                }
                case "clear" -> {
                    if (key == null) throw new IllegalArgumentException("缺少有效草稿键");
                    long seq=result.get("seq").getAsLong();
                    if (!order.duplicate(key,seq,"clear")) {
                        if (!EditorPrefs.clearDraft(key)) throw new IllegalArgumentException("草稿清理失败");
                        order.commit(key,seq,"clear");if(upload!=null&&upload.key.equals(key))upload=null;
                        confirmed.remove(key);
                    }
                    driver.patch("prefs", EditorPrefs.read());
                }
                case "put" -> {
                    if (key == null) throw new IllegalArgumentException("缺少有效草稿键");
                    long seq=result.get("seq").getAsLong();String valueText=text(message,"value"),identity="put:"+valueText;
                    if (!order.duplicate(key,seq,identity)) {
                        if (!EditorPrefs.putDraft(key,valueText))throw new IllegalArgumentException("草稿必须是有效JSON且UTF-8大小不超过8MiB");
                        order.commit(key,seq,identity);if(upload!=null&&upload.key.equals(key))upload=null;
                        remember(key, seq, valueText);
                    }
                    driver.patch("prefs", EditorPrefs.read());
                }
                case "patch" -> {
                    if (key == null) throw new IllegalArgumentException("缺少有效草稿键");
                    long seq = result.get("seq").getAsLong();
                    String identity = "patch:" + message;
                    if (!order.duplicate(key, seq, identity)) {
                        Confirmed base = confirmed.get(key);
                        long baseSeq = message.get("baseSeq").getAsBigDecimal().longValueExact();
                        if (base == null || base.sequence != baseSeq || !base.value.equals(EditorPrefs.peekDraft(key))) {
                            result.addProperty("code", "draft_base_changed");
                            throw new IllegalArgumentException("草稿基准已变化，请完整保存");
                        }
                        var changes = message.getAsJsonArray("changes");
                        if (changes == null || changes.isEmpty() || changes.size() > 32) throw new IllegalArgumentException("草稿差异数量无效");
                        int end = 0; long length = base.value.length();
                        for (var change : changes) {
                            var delta = change.getAsJsonObject();
                            int at = integer(delta, "at"), remove = integer(delta, "remove");
                            if (at < end || at > base.value.length() || remove < 0 || remove > base.value.length() - at)
                                throw new IllegalArgumentException("草稿差异范围无效");
                            length += (long) text(delta, "insert").length() - remove; end = at + remove;
                        }
                        if (length < 1 || length > EditorPrefs.MAX_DRAFT_BYTES) throw new IllegalArgumentException("草稿差异大小无效");
                        StringBuilder merged = new StringBuilder((int) length); end = 0;
                        for (var change : changes) {
                            var delta = change.getAsJsonObject(); int at = integer(delta, "at");
                            merged.append(base.value, end, at).append(text(delta, "insert")); end = at + integer(delta, "remove");
                        }
                        String next = merged.append(base.value, end, base.value.length()).toString();
                        if (!EditorPrefs.putDraft(key, next)) throw new IllegalArgumentException("草稿差异合并后JSON无效或超过8MiB");
                        order.commit(key, seq, identity); remember(key, seq, next);
                        if (upload != null && upload.key.equals(key)) upload = null;
                    }
                    // The page already has the complete value. Do not echo all drafts back for a small splice.
                }
                case "begin" -> {
                    String token = text(message, "upload"); int length = integer(message, "length");
                    if (key == null || token.isBlank() || token.length() > 128 || length < 1 || length > EditorPrefs.MAX_DRAFT_BYTES)
                        throw new IllegalArgumentException("草稿上传参数无效");
                    long seq=result.get("seq").getAsLong();boolean duplicate=order.duplicate(key,seq,"begin:"+token+":"+length);
                    if (!duplicate) { order.commit(key,seq,"begin:"+token+":"+length);confirmed.remove(key);upload = new Upload(token, key, length, seq, new StringBuilder(length), System.nanoTime(), new DraftUtf8Counter()); }
                    boolean active = upload != null && upload.key.equals(key) && upload.sequence == seq && upload.token.equals(token);
                    result.addProperty("upload", token); result.addProperty("offset", active ? upload.text.length() : length);
                }
                case "chunk" -> {
                    String token = text(message, "upload");
                    long seq=result.get("seq").getAsLong();order.require(key,seq);
                    if (upload == null || !upload.key.equals(key) || upload.sequence!=seq || !upload.token.equals(token) || System.nanoTime() - upload.started > 30_000_000_000L)
                        throw new IllegalArgumentException("草稿上传不存在、已替换或30秒没有进展");
                    String chunk = text(message, "value"); int offset = integer(message, "offset");
                    if (offset != upload.text.length() || chunk.isEmpty() || chunk.length() > upload.length - offset)
                        throw new IllegalArgumentException("草稿分块顺序或长度无效");
                    boolean done = false;
                    if (message.has("done")) {
                        if (!message.get("done").isJsonPrimitive() || !message.getAsJsonPrimitive("done").isBoolean()) throw new IllegalArgumentException("done必须为布尔");
                        done = message.get("done").getAsBoolean();
                    }
                    if (upload.bytes.append(chunk) > EditorPrefs.MAX_DRAFT_BYTES)
                        throw new IllegalArgumentException("草稿超过8MiB");
                    upload.text.append(chunk);
                    upload = new Upload(upload.token, upload.key, upload.length, upload.sequence, upload.text, System.nanoTime(), upload.bytes);
                    result.addProperty("upload", token); result.addProperty("key", upload.key);
                    result.addProperty("offset", upload.text.length()); result.addProperty("done", done);
                    if (done) {
                        if (upload.text.length() != upload.length || !EditorPrefs.putDraft(upload.key, upload.text.toString()))
                            throw new IllegalArgumentException("草稿分块未完整或JSON无效");
                        remember(upload.key, seq, upload.text.toString());
                        upload = null; driver.patch("prefs", EditorPrefs.read());
                    }
                }
                default -> throw new IllegalArgumentException("未知草稿操作");
            }
            result.addProperty("status", "accepted");
        } catch (RuntimeException error) {
            dev.rinorsi.editor.EditorDiagnostics.failure("drafts.channel", "op=" + result.get("op")
                    + " seq=" + result.get("seq") + " writer=" + result.get("writer") + " key=" + result.get("key"), error);
            // A delayed stale message must not cancel another key/newer upload.
            result.addProperty("status", "rejected"); result.addProperty("reason", error.getMessage());
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
