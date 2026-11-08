package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.OrielHud;
import java.util.Locale;
import java.util.function.Consumer;
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
        public void push(JsonObject data) { OrielHud.push(ID, data); }
    }, message -> Minecraft.getInstance().gui.hud.getChat().addClientSystemMessage(message),
            failure -> LoggerFactory.getLogger("EditorToast").warn("Oriel toast unavailable; falling back to labelled chat", failure));

    private EditorToast() {}

    public static void initialize() { Minecraft.getInstance().execute(DELIVERY::initialize); }

    public static void show(Level level, String text) {
        Minecraft.getInstance().execute(() -> DELIVERY.show(level, text));
    }

    interface Hud {
        void register();
        boolean isShown();
        void show();
        void push(JsonObject data);
    }

    /** All calls run on the client thread; dependencies let tests avoid Minecraft/OS state. */
    static final class Delivery {
        private final Hud hud;
        private final Consumer<Component> chat;
        private final Consumer<Throwable> warning;
        private boolean registered;
        private Throwable registrationFailure;
        private long sequence;

        Delivery(Hud hud, Consumer<Component> chat, Consumer<Throwable> warning) {
            this.hud = hud; this.chat = chat; this.warning = warning;
        }

        void initialize() {
            if (registered) return;
            try { hud.register(); registered = true; registrationFailure = null; }
            catch (RuntimeException | LinkageError failure) { registrationFailure = failure; }
        }

        void show(Level level, String text) {
            Level actual = level == null ? Level.INFO : level;
            String message = text == null ? "操作未完成" : text;
            if (!registered && registrationFailure == null) initialize();
            if (!registered) {
                fallback(actual, message, registrationFailure);
                return;
            }
            try {
                var data = new JsonObject();
                data.addProperty("text", message);
                data.addProperty("level", actual.name().toLowerCase(Locale.ROOT));
                data.addProperty("title", "物品工坊");
                data.addProperty("seq", ++sequence);
                if (!hud.isShown()) hud.show();
                hud.push(data);
            } catch (RuntimeException | LinkageError failure) { fallback(actual, message, failure); }
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
                    .append(Component.literal("[物品工坊] ").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD))
                    .append(Component.literal(text).withStyle(color)));
        }
    }
}
