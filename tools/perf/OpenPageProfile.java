import dev.oriel.engine.dom.Document;
import dev.oriel.engine.dom.Element;
import dev.oriel.engine.event.Event;
import dev.oriel.engine.host.FontMetrics;
import dev.oriel.engine.host.Host;
import dev.oriel.engine.host.ReplacedContent;
import dev.oriel.engine.paint.Canvas;
import dev.oriel.engine.script.ScriptRuntime;
import dev.oriel.engine.script.Scripting;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.jar.JarFile;

/** CPU diagnostic using the shipped Oriel runtime; not a Minecraft/GPU opening benchmark. */
public final class OpenPageProfile {
    static final String PAGE = "cadeditor:ui/index.html";
    static final List<JarFile> jars = new ArrayList<>();
    static Path ui;
    static double ms(long start) { return (System.nanoTime() - start) / 1_000_000.0; }
    static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\r", "\\r").replace("\n", "\\n") + "\""; }
    static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof Map<?, ?> map) return "{" + String.join(",", map.entrySet().stream().map(e -> q(e.getKey().toString()) + ":" + json(e.getValue())).toList()) + "}";
        if (value instanceof List<?> list) return "[" + String.join(",", list.stream().map(OpenPageProfile::json).toList()) + "]";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        return q(value.toString());
    }
    static final class ProfileHost implements Host {
        final List<Map<String, Object>> scripts = new ArrayList<>();
        final List<String> errors = new ArrayList<>();
        final Map<String, String> sourceHashes = new LinkedHashMap<>();
        int messages;
        double runtimeCreateMs, readMs, styleBootstrapMs;
        public FontMetrics fonts() { return (text, font) -> text.codePointCount(0, text.length()) * 6 * font.scale(); }
        public String loadText(String url) {
            long start = System.nanoTime();
            try {
                byte[] bytes = null;
                if (ui != null && url.startsWith("cadeditor:ui/")) {
                    Path file = ui.resolve(url.substring("cadeditor:ui/".length())).normalize();
                    if (!file.startsWith(ui)) throw new IllegalArgumentException("Outside UI root: " + url);
                    if (Files.isRegularFile(file)) bytes = Files.readAllBytes(file);
                } else {
                    String name = "assets/" + url.replace(':', '/');
                    for (JarFile jar : jars) {
                        var entry = jar.getJarEntry(name);
                        if (entry != null) { try (var in = jar.getInputStream(entry)) { bytes = in.readAllBytes(); } break; }
                    }
                }
                if (bytes == null) throw new IllegalArgumentException("Missing resource: " + url);
                sourceHashes.put(url, HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)));
                return new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
            } catch (Exception ex) { errors.add(ex.toString()); return null; }
            finally { readMs += ms(start); }
        }
        public Map<String, Function<Element, ReplacedContent>> replacedElements() {
            var result = new LinkedHashMap<String, Function<Element, ReplacedContent>>();
            for (String tag : List.of("item", "entity", "slot", "player-head", "mc-text", "scene")) result.put(tag, e -> new ReplacedContent() {
                public float intrinsicWidth() { return 16; }
                public float intrinsicHeight() { return 16; }
                public void paint(Canvas c, float x, float y, float w, float h) {}
            });
            return result;
        }
        public boolean send(String channel, String value) { messages++; return true; }
        public void reportError(String message, Throwable error) { errors.add(message + ": " + error); }
        public ScriptRuntime createScriptRuntime(Document document) {
            long start = System.nanoTime();
            var runtime = Scripting.rhino().apply(document);
            runtimeCreateMs = ms(start);
            return new ScriptRuntime() {
                public void evaluate(String source, String name) {
                    if (name.endsWith("/app.js") && Boolean.getBoolean("editor.profile.preStyle")) {
                        long t = System.nanoTime(); document.flushStyle(); styleBootstrapMs = ms(t);
                    }
                    if (name.endsWith("/app.js")) runtime.evaluate(
                        "var OPEN_PROFILE={};(function(g){"
                        + "['loadStack','rebuild','drawTopbar','fitTopbar','drawEdit','applyWinStyle','drawHero','fitTip','drawTabbar','drawTabBody','buildTabCards','decorate','drawFooter','buildTooltip','heroStats','paintProblems','tabsOfKind','updateCrumb'].forEach(function(k){"
                        + "var f=g[k];if(typeof f!=='function')return;g[k]=function(){var t=Date.now();try{return f.apply(this,arguments);}finally{var p=OPEN_PROFILE[k]||(OPEN_PROFILE[k]={count:0,inclusive_ms:0,max_ms:0});var d=Date.now()-t;p.count++;p.inclusive_ms+=d;p.max_ms=Math.max(p.max_ms,d);}};});})(this);",
                        "profile-install");
                    long t = System.nanoTime();
                    try { runtime.evaluate(source, name); }
                    finally { scripts.add(Map.of("name", name, "chars", source.length(), "compile_and_eval_ms", ms(t))); }
                }
                public String evaluateToJson(String source, String name) { return runtime.evaluateToJson(source, name); }
                public void runInlineHandler(Element element, String code, Event event) { runtime.runInlineHandler(element, code, event); }
                public void receive(String channel, String value) { runtime.receive(channel, value); }
                public void patch(String key, String value) { runtime.patch(key, value); }
                public void documentLoaded() { runtime.documentLoaded(); }
                public void beforeRestyle() { runtime.beforeRestyle(); }
                public boolean needsFrame() { return runtime.needsFrame(); }
                public void dispose() { runtime.dispose(); }
            };
        }
    }
    public static void main(String[] args) throws Exception {
        Path output = Path.of(args[0]);
        ui = args[1].equals("-") ? null : Path.of(args[1]).toAbsolutePath().normalize();
        int repeats = Integer.parseInt(args[2]);
        for (String file : Files.readAllLines(Path.of(args[3]))) if (!file.isBlank()) jars.add(new JarFile(file));
        var rows = new ArrayList<Map<String, Object>>();
        boolean passed = true;
        try {
            for (int i = 0; i < repeats; i++) {
                ProfileHost host = new ProfileHost();
                String data = "{\"hostPrefs\":true,\"prefs\":{\"uiSound\":false,\"heroView\":\"2d\"},\"stack\":{\"id\":\"minecraft:diamond_sword\",\"count\":1,\"comps\":{},\"removed\":{}}}";
                long start = System.nanoTime();
                Document doc = Document.parse(host, PAGE, host.loadText(PAGE), data, dev.oriel.engine.dom.Viewport.DEFAULT);
                double parseMs = ms(start);
                start = System.nanoTime(); doc.frame(0); double firstFrameMs = ms(start);
                var frames = new ArrayList<Double>();
                for (int f = 1; f <= 40; f++) { start = System.nanoTime(); doc.frame(f * 16.667); frames.add(ms(start)); }
                String state = doc.scripts() == null ? null : doc.scripts().evaluateToJson(
                    "({doc:!!Store.doc(),id:Store.doc()&&Store.doc().id,tab:UI.tab,cards:UI.page&&UI.page.cards.length,components:EDATA.comps.length,errors:!!document.querySelector('.error')})", "profile-state");
                if (doc.error() != null) host.errors.add(doc.error().toString());
                boolean ok = host.errors.isEmpty() && state != null && state.contains("minecraft:diamond_sword") && doc.getElementById("edbody") != null;
                passed &= ok;
                var row = new LinkedHashMap<String, Object>();
                row.put("run", i); row.put("first_document_in_process", i == 0); row.put("ok", ok);
                row.put("parse_and_boot_ms", parseMs); row.put("first_frame_ms", firstFrameMs); row.put("later_frame_ms", frames);
                row.put("runtime_create_ms", host.runtimeCreateMs); row.put("resource_read_and_hash_ms", host.readMs);
                row.put("diagnostic_style_before_boot_ms", host.styleBootstrapMs);
                row.put("scripts", host.scripts); row.put("state_json", state); row.put("messages_without_replies", host.messages);
                row.put("function_timings_json", doc.scripts() == null ? null : doc.scripts().evaluateToJson("OPEN_PROFILE", "profile-functions"));
                row.put("errors", host.errors); row.put("source_hashes", host.sourceHashes); rows.add(row);
                doc.close();
            }
        } finally { for (JarFile jar : jars) jar.close(); }
        Files.writeString(output, json(Map.of("scope", "Shipped Oriel/Rhino with real editor scripts and CSS; synthetic font metrics/native elements, no registry replies, Minecraft, GPU, network or real click latency. Times include profiler overhead; run 0 is process-cold, not disk-cold.", "passed", passed, "runs", rows)));
        System.out.println((passed ? "PASS" : "FAIL") + " | OpenPageProfile | runs=" + rows.size() + " | " + output);
        if (!passed) System.exit(1);
    }
}
