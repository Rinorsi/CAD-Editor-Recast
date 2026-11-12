package dev.rinorsi.editor.client;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.regex.Pattern;

/** Source wiring gate: never loads Minecraft or touches a clipboard. */
public final class EditorClipboardHostTest {
    private static int checks;

    public static void main(String[] args) throws Exception {
        var root = Path.of(args[0], "dev/rinorsi/editor/client");
        var sources = new LinkedHashMap<String, String>();
        try (var files = Files.walk(root)) {
            for (var file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                sources.put(file.getFileName().toString(), Files.readString(file)
                        .replaceAll("(?s)/\\*.*?\\*/|//[^\\r\\n]*", ""));
            }
        }
        var subclasses = new HashSet<String>();
        var subclass = Pattern.compile("class\\s+(\\w+)\\s+extends\\s+(?:[\\w.]+\\.)?OrielScreen\\b");
        for (var entry : sources.entrySet()) {
            if (exempt(entry.getKey())) continue;
            String source = entry.getValue();
            check(!Pattern.compile("\\bOrielScreens\\s*\\.\\s*open\\s*\\(").matcher(source).find(),
                    entry.getKey() + " must use EditorPageHost.open");
            check(!Pattern.compile("\\bnew\\s+(?:[\\w.]+\\.)?OrielScreen\\s*\\(").matcher(source).find(),
                    entry.getKey() + " must not construct an unhosted OrielScreen");
            var matcher = subclass.matcher(source);
            while (matcher.find()) subclasses.add(matcher.group(1));
        }
        for (String name : subclasses) {
            int creations = 0;
            var creation = Pattern.compile("\\bnew\\s+" + name + "\\s*\\(");
            var hosted = Pattern.compile("(?:var|[\\w.]+)\\s+(\\w+)\\s*=\\s*new\\s+" + name
                    + "\\s*\\([^;]*;\\s*EditorPageHost\\.attachCommon\\(\\1\\s*,\\s*[^;]+\\);");
            for (var entry : sources.entrySet()) {
                if (name.equals("EditorLayerScreen") && entry.getKey().equals("EditorPageHost.java")) {
                    String source = entry.getValue();
                    long count = creation.matcher(source).results().count();
                    check(count == 1 && source.contains("layer.driver().pushData(data.toString())")
                            && source.contains("screen = layer;") && source.contains("attachCommon(screen, null)"),
                            "inventory layer passes initial data and every common channel through the same host");
                    creations += (int) count;
                    continue;
                }
                if (exempt(entry.getKey())) continue;
                long count = creation.matcher(entry.getValue()).results().count();
                check(count == hosted.matcher(entry.getValue()).results().count(),
                        entry.getKey() + " must immediately host each " + name + " instance");
                creations += (int) count;
            }
            check(creations > 0, name + " has a checked hosted creation site");
        }
        for (String name : new String[]{"EditorClient", "WorldEditorClient"}) {
            check(sources.get(name + ".java").contains("EditorPageHost.open("), name + " uses common host");
        }
        check(sources.get("VaultClient.java").contains("EditorPageHost.attachCommon(screen, initialData())"),
                "vault initial data passes through common host");
        String page = sources.get("EditorPageHost.java");
        check(page.contains("EditorClipboardHost.declare(data)") && page.contains("data.addProperty(\"hostPrefs\", true)"),
                "common capabilities declared");
        String declaration = page.substring(page.indexOf("private static void declare(JsonObject data)"),
                page.indexOf("private static String modVersion()"));
        check(declaration.contains("var about = new JsonObject()")
                && declaration.contains("about.addProperty(\"version\", modVersion())")
                && declaration.contains("data.add(\"about\", about)"),
                "every page declares about.version alongside host capabilities");
        check(page.contains("Platform.get().modVersion(\"cadeditor\")")
                && page.contains("version == null || version.isBlank() ? \"unknown\" : version")
                && page.contains("catch (RuntimeException | LinkageError unavailable)")
                && page.contains("return \"unknown\""), "loader version lookup has an unknown fallback");
        check(page.indexOf("declare(data);") < page.indexOf("OrielScreens.open(page, data)")
                && page.contains("declare(dataOrNull);"), "both page entry paths declare shared data");
        check(page.contains("EditorClipboardHost.attach(screen, clipboard)")
                && page.contains("onMessage(\"prefs\", value ->")
                && page.contains("EditorPrefs.accept(value);")
                && page.contains("screen.driver().uiScale(uiScalePreference());")
                && page.contains("RegistryBridge.attach(screen.driver())"), "common channels attached");
        check(page.contains("static final EditorClipboard clipboard = new EditorClipboard(System::nanoTime)"),
                "all pages share clipboard quota");
        check(page.contains("owner.driver().patch(\"notice\", notice)")
                && (page.contains(".screen() != owner") || page.contains(".screen != owner")),
                "page notice patches only the current owner");
        check(page.contains("notice.addProperty(\"sequence\", ++noticeSequence)"),
                "each host notice includes a fresh sequence even for repeated text");
        String navigation = sources.get("WorldEditorClient.java");
        check(navigation.contains("EditorPageHost.notice(owner,EditorI18n.tr(\"cadeditor.message.worldeditorclient.4b0fba67d8\", (e.getMessage())));")
                && navigation.contains("if(owner!=null)EditorPageHost.notice(owner,result.get(\"reason\")"),
                "local and asynchronous navigation rejection use page notice instead of hidden HUD");
        String host = sources.get("EditorClipboardHost.java");
        check(host.contains("data.addProperty(\"hostClip\", true)"), "clipboard capability declared");
        check(host.contains("owner.driver().onMessage(\"clipboard\""), "write channel registered on owner");
        check(host.contains("bridge.accept(value, mc::execute, () ->") && host.contains("== owner"),
                "main-thread dispatch and owner identity guard");
        check(host.contains("mc.keyboardHandler.setClipboard(text)"), "host write sink");
        String bridge = sources.get("EditorClipboard.java");
        check(!bridge.contains("net.minecraft") && !bridge.contains("dev.oriel"), "policy stays OS-free");
        System.out.println("PASS EditorPageHost: " + checks + " source checks (no client classes loaded)");
    }

    private static boolean exempt(String name) {
        return name.equals("EditorPageHost.java") || name.equals("EditorToast.java") || name.equals("EditorHud.java");
    }

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }
}
