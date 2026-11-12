package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielHud;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.IntSupplier;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.slf4j.LoggerFactory;

/** Client notifications; chat is used only when HUD delivery fails. */
public final class EditorToast {
    public enum Level { INFO, OK, WARN, ERROR }
    private static final Identifier ID = Identifier.parse("cadeditor:toast");
    private static final Delivery DELIVERY = new Delivery(new Hud() {
        public void register() { OrielHud.register(ID, "cadeditor:ui/toast.html", OrielHud.Input.NONE); }
        public boolean isShown() { return OrielHud.isShown(ID); }
        public void show() {
            if (OrielHud.show(ID) == null) throw new IllegalStateException("OrielHud.show returned no toast driver");
        }
        public void scale(int value) {
            var driver = OrielHud.show(ID).uiScale(value);
            if (driver.document() != null) driver.document().documentElement().setAttribute("data-motion", animations() ? "full" : "reduced");
        }
        public void push(JsonObject data) { data.addProperty("animations", animations()); OrielHud.push(ID, data); }
    }, message -> Minecraft.getInstance().gui.hud.getChat().addClientSystemMessage(message),
            failure -> LoggerFactory.getLogger("EditorToast").warn("Oriel toast unavailable; falling back to labelled chat", failure),
            EditorPageHost::uiScalePreference);

    private EditorToast() {}
    private static boolean animations() { var value = EditorPrefs.read().get("uiAnimations"); return value == null || value.getAsBoolean(); }

    public static void initialize() { Minecraft.getInstance().execute(DELIVERY::initialize); }

    public static void show(Level level, String text) {
        Minecraft.getInstance().execute(() -> DELIVERY.show(level, text));
    }

    static void refreshScale() { DELIVERY.refreshScale(); }

    interface Hud {
        void register();
        boolean isShown();
        void show();
        void scale(int value);
        void push(JsonObject data);
    }

    /** All calls run on the client thread; dependencies let tests avoid Minecraft/OS state. */
    static final class Delivery {
        private final Hud hud;
        private final Consumer<Component> chat;
        private final Consumer<Throwable> warning;
        private final IntSupplier scalePreference;
        private boolean registered;
        private Throwable registrationFailure;
        private long sequence;

        Delivery(Hud hud, Consumer<Component> chat, Consumer<Throwable> warning, IntSupplier scalePreference) {
            this.hud = hud; this.chat = chat; this.warning = warning;
            this.scalePreference = scalePreference;
        }

        void initialize() {
            if (registered) return;
            try { hud.register(); registered = true; registrationFailure = null; }
            catch (RuntimeException | LinkageError failure) { registrationFailure = failure; }
        }

        void show(Level level, String text) {
            Level actual = level == null ? Level.INFO : level;
            String message = text == null ? EditorI18n.tr("cadeditor.message.editortoast.79be13bdf0") : text;
            if (!registered && registrationFailure == null) initialize();
            if (!registered) {
                fallback(actual, message, registrationFailure);
                return;
            }
            try {
                var data = new JsonObject();
                data.addProperty("text", message);
                data.addProperty("level", actual.name().toLowerCase(Locale.ROOT));
                data.addProperty("title", EditorI18n.tr("cadeditor.ui.screens.75bc6c2d23"));
                data.addProperty("seq", ++sequence);
                if (!hud.isShown()) hud.show();
                hud.scale(scalePreference.getAsInt());
                hud.push(data);
            } catch (RuntimeException | LinkageError failure) { fallback(actual, message, failure); }
        }

        /** Resize the existing overlay without replacing its message, sequence or expiry timer. */
        void refreshScale() {
            try { if (registered && hud.isShown()) hud.scale(scalePreference.getAsInt()); }
            catch (RuntimeException | LinkageError failure) { warning.accept(failure); }
        }

        private void fallback(Level level, String text, Throwable failure) {
            warning.accept(failure);
            ChatFormatting color = switch (level) {
                case INFO -> ChatFormatting.WHITE;
                case OK -> ChatFormatting.GREEN;
                case WARN -> ChatFormatting.YELLOW;
                case ERROR -> ChatFormatting.RED;
            };
            chat.accept(Component.empty()
                    .append(Component.literal(EditorI18n.tr("cadeditor.message.editortoast.ee643c825a")).withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD))
                    .append(Component.literal(text).withStyle(color)));
        }
    }
}
