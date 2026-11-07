package dev.rinorsi.editor.client;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.oriel.mod.client.OrielScreen;
import dev.oriel.mod.client.OrielScreens;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.StackCodec;
import java.util.UUID;
import net.fabricmc.api.ClientModInitializer;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ServerboundSetCreativeModeSlotPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import org.lwjgl.glfw.GLFW;

public final class EditorClient implements ClientModInitializer {
    private KeyMapping key;
    private OrielScreen screen;
    private EditorSoundPreview soundPreview;
    private final EditorClipboard clipboard = new EditorClipboard(System::nanoTime);
    private final EditorUiLog uiLog = EditorUiLog.live();
    private JsonObject slot;
    private ItemStack original;
    private String baseline;
    private String opening;
    private String pending;
    private ItemStack awaitingVanilla;
    private long deadline;
    private boolean connected;
    private Screen openingFrom;
    private boolean openNextTick;
    private net.minecraft.world.inventory.AbstractContainerMenu closeNextTick;
    private static final String PAGE = "cadeditor:ui/index.html";

    @Override public void onInitializeClient() {
        WorldEditorClient.initialize();
        dev.rinorsi.editor.registry.RegistryBridge.initialize();
        EditorPageController.register();
        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> { EditorPrefs.flush(); uiLog.close(); });
        key = KeyMappingHelper.registerKeyMapping(new KeyMapping("打开物品工坊", GLFW.GLFW_KEY_I, KeyMapping.Category.INVENTORY));
        ClientCommandRegistrationCallback.EVENT.register((dispatcher, registry) -> dispatcher.register(
                LiteralArgumentBuilder.<FabricClientCommandSource>literal("cade").executes(context -> {
                    openNextTick = true; return 1;
                })));
        ScreenEvents.AFTER_INIT.register((client, current, width, height) -> {
            if (current instanceof AbstractContainerScreen<?>) ScreenKeyboardEvents.allowKeyPress(current).register((s, event) -> {
                if (!key.matches(event)) return true;
                open();
                return false;
            });
        });
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (soundPreview != null) soundPreview.tick();
            if (closeNextTick != null) {
                var closing = closeNextTick; closeNextTick = null;
                if (client.player != null && client.player.containerMenu == closing) client.player.closeContainer();
            }
            if (openNextTick) { openNextTick = false; open(); }
            while (key.consumeClick()) if (client.screen == null) open();
            tick(client);
        });
        ClientPlayNetworking.registerGlobalReceiver(EditorPackets.Reply.TYPE, (packet, context) ->
                context.client().execute(() -> receive(packet.json())));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            if (soundPreview != null) { soundPreview.stop(); soundPreview = null; }
            EditorPrefs.flush();
            screen = null; slot = null; pending = null; opening = null; awaitingVanilla = null; closeNextTick = null; openNextTick = false;
        });
    }

    private void open() {
        var mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null || screen != null || opening != null || WorldEditorClient.active()) return;
        try {
            if (mc.getResourceManager().getResource(Identifier.parse(PAGE)).isEmpty())
                StackCodec.fail("缺少物品工坊页面 cadeditor:ui/index.html，请检查 Editor jar 是否包含界面资源");
            JsonObject target = new JsonObject();
            ItemStack stack = mc.player.getMainHandItem();
            int inventoryIndex = mc.player.getInventory().getSelectedSlot();
            if (mc.screen instanceof AbstractContainerScreen<?> container && container.hoveredSlot != null && container.hoveredSlot.hasItem()) {
                var hovered = container.hoveredSlot;
                if (container instanceof CreativeModeInventoryScreen creative && creative.isInventoryOpen()
                        && hovered.container == mc.player.getInventory()) {
                    // Creative inventory wrappers store the inventory-menu slot number, not the backing inventory index.
                    hovered = mc.player.inventoryMenu.getSlot(hovered.getContainerSlot());
                }
                stack = hovered.getItem();
                if (hovered.container == mc.player.getInventory()) inventoryIndex = hovered.getContainerSlot();
                else {
                    inventoryIndex = -1;
                    // Creative catalogue entries are templates, not an owned item stack.
                    if (container.getMenu() != mc.player.containerMenu || container.getMenu().containerId == 0)
                        StackCodec.fail("该项不是玩家持有的槽位，请切到生存物品栏或把物品拿在主手");
                    target.addProperty("kind", "menu");
                    target.addProperty("menuId", container.getMenu().containerId);
                    target.addProperty("index", hovered.index);
                }
            }
            if (inventoryIndex >= 0) {
                target.addProperty("kind", "inventory");
                target.addProperty("index", inventoryIndex);
            }
            if (stack.isEmpty()) StackCodec.fail("没有选中物品，请悬停已有物品或拿在主手");
            connected = ClientPlayNetworking.canSend(EditorPackets.Request.TYPE);
            original = stack.copy();
            openingFrom = mc.screen;
            if (connected) {
                opening = "open-" + UUID.randomUUID();
                deadline = System.nanoTime() + 10_000_000_000L;
                JsonObject request = request("open", opening);
                request.add("slot", target);
                send(request);
            } else {
                slot = target;
                show(StackCodec.snapshot(stack, mc.level.registryAccess(), target, "本地所选槽位（服务端未安装物品工坊）"));
            }
        } catch (RuntimeException e) { opening = null; message(e.getMessage()); }
    }

    private void show(JsonObject item) {
        slot = StackCodec.object(item, "slot").deepCopy();
        baseline = item.has("baseline") ? StackCodec.string(item, "baseline")
                : EditorSessions.fingerprint(original, Minecraft.getInstance().level.registryAccess());
        JsonObject data = new JsonObject();
        data.add("stack", item);
        data.add("prefs", EditorPrefs.read());
        data.addProperty("hostPrefs", true);
        data.addProperty("hostClip", true);
        data.addProperty("hostAudio", true);
        screen = OrielScreens.open(PAGE, data);
        dev.rinorsi.editor.registry.RegistryBridge.attach(screen.driver());
        OrielScreen owner = screen;
        EditorSoundPreview preview = new EditorSoundPreview(state -> owner.driver().patch("sound_preview", state));
        soundPreview = preview;
        screen.driver().onMessage("sound_preview", value -> {
            var mc = Minecraft.getInstance();
            mc.execute(() -> { if (screen == owner && mc.screen == owner) preview.accept(value); });
        });
        screen.driver().onMessage("log", uiLog::accept);
        screen.driver().onMessage("clipboard", value -> {
            var mc = Minecraft.getInstance();
            clipboard.accept(value, mc::execute, () -> screen == owner && mc.screen == owner,
                    text -> mc.keyboardHandler.setClipboard(text));
        });
        screen.driver().onMessage("prefs", EditorPrefs::accept).onMessage("apply", this::apply).onClose(() -> {
            preview.stop();
            if (soundPreview == preview) soundPreview = null;
            EditorPrefs.flush();
            if (connected && slot != null && Minecraft.getInstance().getConnection() != null) {
                var close = request("close", "close-" + UUID.randomUUID());
                close.add("slot", slot);
                send(close);
            }
            var mc = Minecraft.getInstance();
            // Closing a menu changes the Screen too. Defer until outside Screen.removed to avoid re-entry.
            if (mc.player != null && mc.player.containerMenu != mc.player.inventoryMenu) closeNextTick = mc.player.containerMenu;
            screen = null; pending = null; awaitingVanilla = null; slot = null;
        });
    }

    private void apply(JsonElement value) {
        var mc = Minecraft.getInstance();
        String requestId = "";
        try {
            if (mc.player == null || mc.level == null) EditorSessions.fail("not_allowed", "已经离开世界；草稿已保留");
            JsonObject edit = value.getAsJsonObject();
            requestId = StackCodec.string(edit, "requestId");
            if (pending != null) StackCodec.fail("上一笔修改尚未得到回执");
            if (!EditorSessions.sameSlot(slot, StackCodec.object(edit, "slot")))
                EditorSessions.fail("slot_invalid", "页面槽位与打开时不一致；草稿已保留");
            ItemStack next = StackCodec.decode(edit, mc.level.registryAccess(), original);
            dev.rinorsi.editor.registry.EntitySchemaValidation.validateStack(next, mc.level);
            pending = requestId;
            deadline = System.nanoTime() + 10_000_000_000L;
            if (connected) {
                JsonObject request = edit.deepCopy();
                request.addProperty("op", "apply");
                // Bind to the host's last confirmed stack, never to mutable page draft data.
                request.addProperty("baseline", baseline);
                send(request);
            } else {
                if (!mc.player.isCreative()) EditorSessions.fail("not_allowed", "服务端未安装物品工坊：只有创造模式可写回玩家自己的物品");
                if (!StackCodec.string(slot, "kind").equals("inventory")) EditorSessions.fail("not_allowed", "容器槽位写回需要服务端安装物品工坊");
                int index = StackCodec.integer(slot, "index", 0, mc.player.getInventory().getContainerSize() - 1);
                if (!sameInventoryItem(mc, index, "local-apply"))
                    EditorSessions.fail("item_changed", "物品在你编辑期间变了（玩家背包槽位 " + index + "；无法判定修改者）；草稿已保留，没有覆盖当前物品");
                int creativeSlot = mc.player.inventoryMenu.slots.stream()
                        .filter(s -> s.container == mc.player.getInventory() && s.getContainerSlot() == index)
                        .mapToInt(s -> s.index).filter(i -> i >= 1 && i <= 45).findFirst().orElseThrow();
                // Do not mutate the client inventory: only an actual server update can confirm this fallback.
                awaitingVanilla = next;
                mc.player.connection.send(new ServerboundSetCreativeModeSlotPacket(creativeSlot, next));
            }
        } catch (RuntimeException e) {
            pending = null; reject(requestId, e.getMessage(), e instanceof EditorSessions.Failure failure ? failure.code : "invalid_request");
        }
    }

    private boolean sameInventoryItem(Minecraft mc, int index, String phase) {
        var actual = mc.player.getInventory().getItem(index);
        boolean same = dev.rinorsi.editor.StackComparison.matches(actual, original, mc.level.registryAccess());
        if (!same) org.slf4j.LoggerFactory.getLogger("EditorClient").warn(
                "[CAD-Editor-Recast] Item comparison mismatch phase={} inventory_index={} item={} components={}",
                phase, index, net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(actual.getItem()),
                dev.rinorsi.editor.StackComparison.differences(actual, original, mc.level.registryAccess()));
        return same;
    }

    private void receive(String json) {
        var mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;
        JsonObject result = JsonParser.parseString(json).getAsJsonObject();
        result = dev.rinorsi.editor.world.WorldWire.decode(result);
        if (WorldEditorClient.receive(result)) return;
        String id = StackCodec.string(result, "requestId");
        String status = StackCodec.string(result, "status");
        if (opening != null && id.equals(opening)) {
            opening = null;
            if (!status.equals("opened")) { message(StackCodec.string(result, "reason")); return; }
            if (mc.screen != openingFrom) { message("打开期间界面发生变化，请重新选择物品"); return; }
            var item = StackCodec.object(result, "item");
            original = StackCodec.decode(item, mc.level.registryAccess(), original);
            show(item);
            return;
        }
        if (screen == null || pending == null || !id.equals(pending)) return;
        try {
            if (status.equals("commit")) {
                int index = StackCodec.integer(slot, "index", 0, mc.player.getInventory().getContainerSize() - 1);
                if (!mc.player.isCreative() || !sameInventoryItem(mc, index, "commit"))
                    EditorSessions.fail("item_changed", "创造模式或物品发生变化，已取消写回；草稿已保留");
                var next = StackCodec.decode(StackCodec.object(result, "item"), mc.level.registryAccess(), original);
                int creativeSlot = StackCodec.integer(result, "creativeSlot", 1, 45);
                mc.player.connection.send(new ServerboundSetCreativeModeSlotPacket(creativeSlot, next));
                var confirm = request("confirm", id);
                confirm.add("slot", slot);
                confirm.addProperty("baseline", baseline);
                var committedItem = StackCodec.object(result, "item");
                confirm.addProperty("commitBaseline", committedItem.has("baseline") ? StackCodec.string(committedItem, "baseline")
                        : EditorSessions.fingerprint(next, mc.level.registryAccess()));
                send(confirm);
                return;
            }
            pending = null;
            if (status.equals("saved")) {
                var item = StackCodec.object(result, "item");
                original = StackCodec.decode(item, mc.level.registryAccess(), original);
                baseline = item.has("baseline") ? StackCodec.string(item, "baseline")
                        : EditorSessions.fingerprint(original, mc.level.registryAccess());
                // Vanilla accepts creative-slot writes without echoing them to this client.
                // Predict nothing: synchronize only after our server confirms the actual stack.
                if (mc.player.isCreative() && StackCodec.string(slot, "kind").equals("inventory")) {
                    int index = StackCodec.integer(slot, "index", 0, mc.player.getInventory().getContainerSize() - 1);
                    mc.player.getInventory().setItem(index, original.copy());
                }
                screen.driver().patch("stack", item);
            }
            screen.driver().patch("result", result);
        } catch (RuntimeException e) {
            pending = null; reject(id, e.getMessage(), e instanceof EditorSessions.Failure failure ? failure.code : "invalid_request");
        }
    }

    private void tick(Minecraft mc) {
        EditorPrefs.tick();
        if (awaitingVanilla != null && mc.player != null && slot != null) {
            int index = slot.get("index").getAsInt();
            if (ItemStack.matches(mc.player.getInventory().getItem(index), awaitingVanilla)) {
                original = mc.player.getInventory().getItem(index).copy();
                JsonObject result = new JsonObject();
                result.addProperty("status", "saved");
                result.addProperty("requestId", pending);
                result.add("item", StackCodec.snapshot(original, mc.level.registryAccess(), slot, "玩家物品槽位"));
                screen.driver().patch("stack", result.get("item"));
                screen.driver().patch("result", result);
                awaitingVanilla = null; pending = null;
            }
        }
        if ((opening != null || pending != null) && System.nanoTime() > deadline) {
            if (opening != null) { opening = null; message("服务器读取物品超时，请重新打开"); }
            if (pending != null) {
                String id = pending; pending = null; awaitingVanilla = null;
                reject(id, "未收到服务器确认，结果未知；草稿已保留。请关闭后重读物品，勿重复提交", "request_timeout");
            }
        }
    }
    private void reject(String requestId, String reason) {
        reject(requestId, reason, "invalid_request");
    }
    private void reject(String requestId, String reason, String code) {
        JsonObject result = new JsonObject();
        result.addProperty("status", "rejected");
        result.addProperty("requestId", requestId);
        result.addProperty("code", code);
        result.addProperty("reason", reason == null ? "物品修改失败" : reason);
        if (screen != null) screen.driver().patch("result", result); else message(reason);
    }
    private static JsonObject request(String op, String requestId) {
        JsonObject result = new JsonObject(); result.addProperty("op", op); result.addProperty("requestId", requestId); return result;
    }
    private static void send(JsonObject request) {
        String json = request.toString();
        if (json.length() > EditorPackets.MAX_JSON) StackCodec.fail("物品数据超过骨架消息上限");
        ClientPlayNetworking.send(new EditorPackets.Request(json));
    }
    private static void message(String text) {
        var player = Minecraft.getInstance().player;
        if (player != null) player.sendSystemMessage(Component.literal(text == null ? "无法打开物品工坊" : text));
    }
}
