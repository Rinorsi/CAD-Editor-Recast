package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielScreen;
import dev.oriel.mod.client.OrielScreens;
import dev.rinorsi.editor.registry.RegistryBridge;

/** Common channels for every editor page, including custom OrielScreen subclasses. */
final class EditorPageHost {
    private static final EditorClipboard clipboard = new EditorClipboard(System::nanoTime);

    private EditorPageHost() {}

    static OrielScreen open(String page, JsonObject data) {
        declare(data);
        var screen = OrielScreens.open(page, data);
        attachCommon(screen, null);
        return screen;
    }

    static void attachCommon(OrielScreen screen, JsonObject dataOrNull) {
        if (dataOrNull != null) {
            declare(dataOrNull);
            screen.driver().pushData(dataOrNull.toString());
        }
        EditorClipboardHost.attach(screen, clipboard);
        screen.driver().onMessage("prefs", EditorPrefs::accept);
        RegistryBridge.attach(screen.driver());
    }

    private static void declare(JsonObject data) {
        EditorClipboardHost.declare(data);
        data.addProperty("hostPrefs", true);
    }
}
