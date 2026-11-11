package dev.rinorsi.editor.client;

import dev.rinorsi.editor.platform.Platform;
import dev.rinorsi.editor.platform.ClientPlatform;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.EditorPackets;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.EditorWriteLog;
import java.util.UUID;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.network.protocol.game.ServerboundSetCreativeModeSlotPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import com.mojang.blaze3d.platform.InputConstants;

public final class EditorClient  {
    private KeyMapping key;
    private final dev.rinorsi.editor.EditorWire.Receiver transfer = new dev.rinorsi.editor.EditorWire.Receiver();
    private OrielScreen screen;
    private JsonObject slot;
    private ItemStack original;
    private String baseline;
    private String opening;
    private String pending;
    private ItemStack creativePrediction;
    private String creativeRequestId;
    private HotbarCommandSession commandSession;
    private CommandPage commandPage;
    private long deadline;
    private boolean connected;
    private String traceSession = "-";
    private long writeStarted;
    private Screen openingFrom;
    private boolean openNextTick;
    private net.minecraft.world.inventory.AbstractContainerMenu closeNextTick;
    private static final String PAGE = "cadeditor:ui/index.html";

    public void onInitializeClient() {
        EditorPageHost.initialize();
        ClientPlatform.get().onStarted(client -> {
            EditorKeyBindings.removeUnavailableLibraryHome(client);
            EditorToast.initialize();
        });
        WorldEditorClient.initialize();
        VaultClient.initialize(() -> screen != null || opening != null || WorldEditorClient.active());
        dev.rinorsi.editor.registry.RegistryBridge.initialize();
        EditorPageController.register();
        ClientPlatform.get().onStopping(client -> { EditorPrefs.flush(); EditorPageHost.closeLog(); });
        key = ClientPlatform.get().registerKey(new KeyMapping("key.cadeditor.edit", InputConstants.KEY_I, EditorKeyBindings.CATEGORY));
        ClientPlatform.get().onCommands(dispatcher -> dispatcher.register(
                LiteralArgumentBuilder.<Object>literal("cade").executes(context -> {
                    openNextTick = true; return 1;
                })));
        ClientPlatform.get().onScreenKey((current, event) -> {
            if (!(current instanceof AbstractContainerScreen<?>) || !key.matches(event)) return true;
            open(); return false;
        });
        ClientPlatform.get().onTick(client -> {
            if (closeNextTick != null) {
                var closing = closeNextTick; closeNextTick = null;
                if (client.player != null && client.player.containerMenu == closing) client.player.closeContainer();
            }
            if (openNextTick) { openNextTick = false; open(); }
            while (key.consumeClick()) if (client.gui.screen() == null) open();
            tick(client);
        });
        ClientPlatform.get().receive(packet -> {
            try { receive(packet.json()); }
            catch (RuntimeException failure) {
                EditorWriteLog.failure("client.receive.failure", pending != null ? pending : opening, traceContext(), failure);
                // Unrelated/malformed replies must not claim that a pending save failed.
            }
        });
        ClientPlatform.get().onDisconnect(client -> {
            transfer.clear();
            if (pending != null || opening != null) EditorWriteLog.warning("client.disconnect.pending", pending != null ? pending : opening, traceContext());
            EditorPrefs.flush();
            if (commandSession != null) commandSession.invalidate();
            commandSession = null;
            screen = null; slot = null; pending = null; opening = null; creativePrediction = null; closeNextTick = null; openNextTick = false;
        });
    }

    private void open() {
        var mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null || screen != null || opening != null || WorldEditorClient.active() || mc.gui.screen() instanceof OrielScreen) return;
        boolean hasHoveredItem=mc.gui.screen() instanceof AbstractContainerScreen<?> container&&container.hoveredSlot!=null&&container.hoveredSlot.hasItem();
        boolean shift=mc.options.keyShift.isDown()||com.mojang.blaze3d.platform.InputConstants.isKeyDown(InputConstants.KEY_LSHIFT)||com.mojang.blaze3d.platform.InputConstants.isKeyDown(InputConstants.KEY_RSHIFT);
        var action=EditDispatch.decide(hasHoveredItem,shift,WorldEditorClient.hit(),mc.player.getMainHandItem().isEmpty());
        if(action==EditDispatch.Action.SELF){WorldEditorClient.openSelf();return;}
        if(action==EditDispatch.Action.ENTITY||action==EditDispatch.Action.BLOCK){WorldEditorClient.openTarget(action==EditDispatch.Action.ENTITY);return;}
        traceSession = UUID.randomUUID().toString();
        EditorWriteLog.event("client.open.begin", "-", traceContext());
        try {
            if (mc.getResourceManager().getResource(Identifier.parse(PAGE)).isEmpty())
                StackCodec.fail("缺少物品工坊页面 cadeditor:ui/index.html，请检查 Editor jar 是否包含界面资源");
            JsonObject target = new JsonObject();
            ItemStack stack = mc.player.getMainHandItem();
            int inventoryIndex = mc.player.getInventory().getSelectedSlot();
            if (mc.gui.screen() instanceof AbstractContainerScreen<?> container && container.hoveredSlot != null && container.hoveredSlot.hasItem()) {
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
            connected = ClientPlatform.get().canSend(EditorPackets.Request.TYPE);
            EditorWriteLog.event("client.open.target", "-", traceContext() + " target=" + target + " " + stackSummary(stack));
            original = stack.copy();
            openingFrom = mc.gui.screen();
            if (connected) {
                opening = "open-" + UUID.randomUUID();
                deadline = System.nanoTime() + 10_000_000_000L;
                JsonObject request = request("open", opening);
                request.add("slot", target);
                send(request);
            } else {
                slot = target;
                commandSession = !mc.player.isCreative() && inventoryIndex >= 0 && inventoryIndex <= 35
                        ? new HotbarCommandSession(inventoryIndex, commandContext(mc, inventoryIndex)) : null;
                var snapshot = StackCodec.snapshot(stack, mc.level.registryAccess(), target, commandSession != null
                        ? "命令写回自己的普通背包第1～36格；原版可能通知本人、管理员并记录日志"
                        : "本地所选槽位（服务端未安装物品工坊）");
                if (!mc.player.isCreative()) snapshot.addProperty("capability", commandSession == null
                        ? "该目标需要服务端模组；纯客户端命令仅支持自己的普通背包第1～36格，不含装备、副手或容器"
                        : ClientInventoryCommands.capabilityHint(mc));
                show(snapshot);
            }
        } catch (RuntimeException e) {
            EditorWriteLog.failure("client.open.failure", opening, traceContext(), e);
            opening = null; message(e.getMessage());
        }
    }

    private void show(JsonObject item) {
        slot = StackCodec.object(item, "slot").deepCopy();
        baseline = item.has("baseline") ? StackCodec.string(item, "baseline")
                : EditorSessions.fingerprint(original, Minecraft.getInstance().level.registryAccess());
        item.addProperty("baseline", baseline);
        JsonObject data = new JsonObject();
        data.add("stack", item);
        data.add("prefs", EditorPrefs.read());
        screen = EditorPageHost.open(PAGE, data);
        EditorWriteLog.event("client.page.opened", opening, traceContext());
        commandPage = commandSession == null ? null : new CommandPage(screen.driver().document());
        OrielScreen owner = screen;
        screen.driver().onMessage("apply", value -> Minecraft.getInstance().execute(() -> {
            if (screen == owner && Minecraft.getInstance().gui.screen() == owner) apply(value);
        })).onClose(() -> {
            if (pending != null) EditorWriteLog.warning("client.page.close.pending", pending, traceContext() + " outcome=unknown no_automatic_retry=true");
            EditorPrefs.flush();
            if (connected && slot != null && Minecraft.getInstance().getConnection() != null) {
                var close = request("close", "close-" + UUID.randomUUID());
                close.add("slot", slot);
                send(close);
            }
            var mc = Minecraft.getInstance();
            // Closing a menu changes the Screen too. Defer until outside Screen.removed to avoid re-entry.
            if (!(owner instanceof EditorLayerScreen layer && layer.keepsMenu())
                    && mc.player != null && mc.player.containerMenu != mc.player.inventoryMenu) closeNextTick = mc.player.containerMenu;
            if (commandSession != null) commandSession.invalidate();
            commandSession = null;
            screen = null; pending = null; creativePrediction = null; slot = null;
        });
    }

    private void apply(JsonElement value) {
        var mc = Minecraft.getInstance();
        String requestId = "";
        String stage = "client.apply.request";
        boolean ownsPending = false;
        boolean creativeSent = false;
        try {
            if (mc.player == null || mc.level == null) EditorSessions.fail("not_allowed", "已经离开世界；草稿已保留");
            JsonObject edit = value.getAsJsonObject();
            requestId = StackCodec.string(edit, "requestId");
            EditorWriteLog.event(stage, requestId, traceContext());
            if (commandSession != null && !commandDocumentCurrent())
                EditorSessions.fail("session_stale", "页面已重载或未就绪，请关闭后重新读取物品；草稿已保留，不能继续提交旧数据");
            if (pending != null) StackCodec.fail("上一笔修改尚未得到回执");
            if (!EditorSessions.sameSlot(slot, StackCodec.object(edit, "slot")))
                EditorSessions.fail("slot_invalid", "页面槽位与打开时不一致；草稿已保留");
            stage = "client.apply.decode";
            ItemStack next = StackCodec.decode(edit, mc.level.registryAccess(), original);
            stage = "client.apply.entity_validation";
            dev.rinorsi.editor.registry.EntitySchemaValidation.validateStack(next, mc.level);
            EditorWriteLog.event("client.apply.validated", requestId, traceContext() + " " + stackSummary(next));
            pending = requestId;
            writeStarted = System.nanoTime();
            ownsPending = true;
            if (commandSession == null) deadline = System.nanoTime() + 10_000_000_000L;
            if (connected) {
                stage = "client.apply.mod_transport";
                JsonObject request = edit.deepCopy();
                request.addProperty("op", "apply");
                // Bind to the host's last confirmed stack, never to mutable page draft data.
                request.addProperty("baseline", baseline);
                send(request);
            } else {
                if (commandSession != null) {
                    stage = "client.apply.command_transport";
                    ClientInventoryCommands.send(mc, commandSession, requestId, original, next);
                    return;
                }
                stage = "client.apply.creative_preflight";
                if (!mc.player.isCreative()) EditorSessions.fail("not_connected", "服务器未安装物品工坊；命令写回仅支持自己普通背包 0..35（主手绑定打开时槽位）。装备、副手、容器和其他目标需要服务端支持");
                if (!StackCodec.string(slot, "kind").equals("inventory")) EditorSessions.fail("not_allowed", "容器槽位写回需要服务端安装物品工坊");
                int index = StackCodec.integer(slot, "index", 0, mc.player.getInventory().getContainerSize() - 1);
                if (!sameInventoryItem(mc, index, "local-apply"))
                    EditorSessions.fail("item_changed", "物品在你编辑期间变了（玩家背包槽位 " + index + "；无法判定修改者）；草稿已保留，没有覆盖当前物品");
                int creativeSlot = mc.player.inventoryMenu.slots.stream()
                        .filter(s -> s.container == mc.player.getInventory() && s.getContainerSlot() == index)
                        .mapToInt(s -> s.index).filter(i -> i >= 1 && i <= 45).findFirst().orElseThrow();
                stage = "client.apply.creative_send";
                mc.player.connection.send(new ServerboundSetCreativeModeSlotPacket(creativeSlot, next));
                creativeSent = true;
                EditorWriteLog.event("client.creative.sent", requestId, traceContext()
                        + " packet=ServerboundSetCreativeModeSlotPacket inventory_index=" + index
                        + " creative_slot=" + creativeSlot + " " + stackSummary(next) + " confirmation=none");
                // Match vanilla creative inventory behaviour: the server need not echo accepted slots.
                // This is local prediction, never evidence that a plugin accepted the write.
                stage = "client.apply.creative_prediction";
                mc.player.getInventory().setItem(index, next.copy());
                mc.player.getInventory().setChanged();
                original = next.copy();
                baseline = EditorSessions.fingerprint(original, mc.level.registryAccess());
                var submitted = request("apply", requestId);
                submitted.addProperty("status", "sent");
                submitted.addProperty("confirmed", false);
                submitted.addProperty("fingerprint", baseline);
                submitted.addProperty("code", "submitted");
                submitted.addProperty("reason", "已提交创造模式修改，服务器未提供保存确认；草稿已保留。如服务器回退物品，请重新读取后核对");
                pending = null; creativePrediction = next.copy(); creativeRequestId = requestId;
                screen.driver().patch("result", submitted);
                EditorWriteLog.event("client.creative.local_prediction", requestId, traceContext() + elapsed()
                        + " inventory_index=" + index + " outcome=submitted confirmed=false draft_retained=true");
            }
        } catch (RuntimeException e) {
            EditorWriteLog.failure(stage, requestId, traceContext(), e);
            if (ownsPending) {
                pending = null;
                if (commandSession != null && commandSession.pending()) commandSession.invalidate();
            }
            if (creativeSent) reject(requestId, "创造修改已发出，但本地处理出错，结果未知；请重新读取物品核对，草稿已保留", "result_unknown");
            else reject(requestId, e.getMessage(), e instanceof EditorSessions.Failure failure ? failure.code : "invalid_request");
        }
    }

    private static HotbarCommandSession.Context commandContext(Minecraft mc, int index) {
        return ClientInventoryCommands.context(mc, index);
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
        json=transfer.accept(json);if(json==null)return;
        var mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;
        JsonObject result = JsonParser.parseString(json).getAsJsonObject();
        result = dev.rinorsi.editor.world.WorldWire.decode(result);
        if (dev.rinorsi.editor.registry.VaultChannel.receive(result)) return;
        if (WorldEditorClient.receive(result)) return;
        String id = StackCodec.string(result, "requestId");
        String status = StackCodec.string(result, "status");
        EditorWriteLog.event("client.mod.reply", id, traceContext() + " status=" + status
                + " matches_open=" + id.equals(opening) + " matches_pending=" + id.equals(pending));
        if (opening != null && id.equals(opening)) {
            opening = null;
            if (!status.equals("opened")) {
                EditorWriteLog.warning("client.open.rejected", id, traceContext() + " reason=" + StackCodec.string(result, "reason"));
                message(StackCodec.string(result, "reason")); return;
            }
            if (mc.gui.screen() != openingFrom) {
                EditorWriteLog.warning("client.open.screen_changed", id, traceContext());
                message("打开期间界面发生变化，请重新选择物品"); return;
            }
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
                EditorWriteLog.event("client.creative.sent", id, traceContext()
                        + " packet=ServerboundSetCreativeModeSlotPacket inventory_index=" + index
                        + " creative_slot=" + creativeSlot + " " + stackSummary(next) + " confirmation=mod_confirm");
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
                EditorWriteLog.event("client.mod.saved", id, traceContext() + elapsed());
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
            if (status.equals("rejected")) EditorWriteLog.warning("client.mod.rejected", id,
                    traceContext() + " code=" + result.get("code") + " reason=" + result.get("reason"));
            screen.driver().patch("result", result);
        } catch (RuntimeException e) {
            EditorWriteLog.failure("client.mod.reply_apply", id, traceContext(), e);
            pending = null; reject(id, e.getMessage(), e instanceof EditorSessions.Failure failure ? failure.code : "invalid_request");
        }
    }

    private void tick(Minecraft mc) {
        EditorPrefs.tick();
        if (commandSession != null && commandDocumentCurrent()) {
            pollCommand(commandSession, commandContext(mc, commandSession.index()), pending, System.nanoTime(), commandPage,
                    screen.driver().document(), (outcome, id) -> {
                if (outcome == HotbarCommandSession.Outcome.SAVED) {
                    original = mc.player.getInventory().getItem(commandSession.index()).copy();
                    var item = StackCodec.snapshot(original, mc.level.registryAccess(), slot, "自己的普通背包（服务器同步已确认）");
                    baseline = EditorSessions.fingerprint(original, mc.level.registryAccess());
                    var result = request("apply", id);
                    result.addProperty("status", "saved");
                    result.add("item", item);
                    screen.driver().patch("stack", item);
                    screen.driver().patch("result", result);
                    EditorWriteLog.event("client.command.saved", id, traceContext() + elapsed());
                    pending = null;
                } else {
                    EditorWriteLog.warning("client.command.unconfirmed", id, traceContext() + elapsed() + " outcome=" + outcome);
                    pending = null;
                    reject(id, "未能确认写回结果（可能权限不足、条件不符、目标改变或连接中断）；请关闭后重读。草稿已保留，不会自动重发", "result_unknown");
                }
            });
        }
        if (creativePrediction != null && mc.player != null && slot != null) {
            int index = slot.get("index").getAsInt();
            var actual = mc.player.getInventory().getItem(index);
            if (!ItemStack.matches(actual, creativePrediction)) {
                var predicted = creativePrediction;
                creativePrediction = null;
                try {
                    EditorWriteLog.warning("client.creative.changed_after_submission", creativeRequestId, traceContext() + elapsed()
                            + " inventory_index=" + index + " actual_" + stackSummary(actual)
                            + " differences=" + dev.rinorsi.editor.StackComparison.differences(actual, predicted, mc.level.registryAccess())
                            + " source_unknown=true reread_required=true");
                } catch (RuntimeException failure) {
                    EditorWriteLog.failure("client.creative.observation_failure", creativeRequestId, traceContext(), failure);
                }
            }
        }
        if (usesGenericTimeout(commandSession != null, opening, pending, System.nanoTime(), deadline)) {
            if (opening != null) {
                EditorWriteLog.warning("client.open.timeout", opening, traceContext() + " timeout_ms=10000");
                opening = null; message("服务器读取物品超时，请重新打开");
            }
            if (pending != null) {
                EditorWriteLog.warning("client.apply.timeout", pending, traceContext() + elapsed()
                        + " outcome=unknown permission_denial_not_proven=true");
                String id = pending; pending = null;
                reject(id, "未收到服务器确认，结果未知；草稿已保留。请关闭后重读物品，勿重复提交", "request_timeout");
            }
        }
    }
    /** Oriel reload replaces Document without onClose. Never migrate an old write implicitly. */
    static final class CommandPage {
        private Object document;
        private boolean stale, notified;
        CommandPage(Object document) { this.document = document; }
        boolean accept(Object current) {
            if (stale) return false;
            if (document == null) { document = current; return current != null; }
            if (document != current) stale = true;
            return !stale;
        }
    }

    private boolean commandDocumentCurrent() {
        if (screen == null || commandPage == null) return false;
        if (commandPage.accept(screen.driver().document())) return true;
        if (commandPage.stale) {
            commandSession.invalidate(); pending = null;
            if (!commandPage.notified && screen.driver().document() != null) {
                EditorWriteLog.warning("client.command.document_stale", commandSession.requestId(), traceContext());
                commandPage.notified = true;
                var state = new JsonObject(); state.addProperty("stale", true);
                state.addProperty("reason", "页面已重载，旧物品不能继续写回。请关闭后重新读取物品；草稿已保留，上一笔结果请核对背包");
                screen.driver().patch("inventory_session", state);
            }
        }
        return false;
    }

    static void pollCommand(HotbarCommandSession session, HotbarCommandSession.Context current, String activeRequestId,
                            long now, CommandPage page, Object document,
                            java.util.function.BiConsumer<HotbarCommandSession.Outcome, String> result) {
        if (!page.accept(document)) { session.invalidate(); return; }
        pollCommand(session, current, activeRequestId, now, result);
    }
    // One terminal callback, bound to a still-live page request. Kept independent
    // of Minecraft so timeout/later-sync ordering is exercised by JVM tests.
    static void pollCommand(HotbarCommandSession session, HotbarCommandSession.Context current, String activeRequestId,
                            long now, java.util.function.BiConsumer<HotbarCommandSession.Outcome, String> result) {
        var outcome = session.observe(current, activeRequestId, now);
        if (outcome != HotbarCommandSession.Outcome.WAITING && activeRequestId != null && activeRequestId.equals(session.requestId()))
            result.accept(outcome, activeRequestId);
    }
    static boolean usesGenericTimeout(boolean commandMode, String opening, String pending, long now, long deadline) {
        return (opening != null || (!commandMode && pending != null)) && now > deadline;
    }
    private void reject(String requestId, String reason) {
        reject(requestId, reason, "invalid_request");
    }
    private void reject(String requestId, String reason, String code) {
        EditorWriteLog.warning("client.apply.rejected", requestId, traceContext() + " code=" + code + " reason=" + reason);
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
        dev.rinorsi.editor.EditorWire.requirePayload(json);
        ClientPlatform.get().send(new EditorPackets.Request(json));
        EditorWriteLog.event("client.mod.sent", request.get("requestId").getAsString(),
                "op=" + request.get("op").getAsString() + " payload_chars=" + json.length());
    }
    private String elapsed() {
        return " elapsed_ms=" + (writeStarted == 0 ? -1 : (System.nanoTime() - writeStarted) / 1_000_000);
    }
    private String traceContext() {
        var mc = Minecraft.getInstance();
        var player = mc.player;
        String route = connected ? "server_mod" : commandSession != null ? "command" : "vanilla_creative";
        return "session=" + traceSession + " route=" + route + " mod_channel=" + connected
                + " creative=" + (player != null && player.isCreative())
                + " infinite_materials=" + (player != null && player.hasInfiniteMaterials())
                + " gamemaster=" + (player != null && player.permissions().hasPermission(net.minecraft.server.permissions.Permissions.COMMANDS_GAMEMASTER))
                + " integrated_server=" + (mc.getSingleplayerServer() != null)
                + " menu_id=" + (player == null ? -1 : player.containerMenu.containerId)
                + " menu_revision=" + (player == null ? -1 : player.containerMenu.getStateId());
    }
    private static String stackSummary(ItemStack stack) {
        return stack == null ? "item=none" : "item=" + net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()) + " count=" + stack.getCount();
    }
    private static void message(String text) {
        EditorToast.show(EditorToast.Level.ERROR, text == null ? "无法打开物品工坊" : text);
    }
}
