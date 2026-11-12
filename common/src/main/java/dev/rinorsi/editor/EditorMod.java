package dev.rinorsi.editor;

import dev.rinorsi.editor.platform.Platform;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.UUID;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Server-owned concurrency protection; cache loss is recoverable using the caller's baseline. */
public final class EditorMod  {
    private static final EditorSessions SESSIONS = new EditorSessions();
    private static final java.util.Map<UUID,EditorWire.Receiver> TRANSFERS = new java.util.HashMap<>();
    private static final Logger LOG = LoggerFactory.getLogger("EditorSessions");
    private static EditorPolicy policy;

    public void onInitialize() {
        Platform.get().onServerStarting(server -> TRANSFERS.clear());
        Platform.get().onServerStopped(server -> TRANSFERS.clear());
        Platform.get().onServerStarting(server -> dev.rinorsi.editor.vault.VaultGiveServer.clear());
        Platform.get().onServerStopped(server -> dev.rinorsi.editor.vault.VaultGiveServer.clear());
        Platform.get().onDataReload(() -> dev.rinorsi.editor.registry.EntitySchemaValidation.invalidate());
        dev.rinorsi.editor.world.WorldEditor.initialize();
        TestKitCommand.register(() -> policy);
        Platform.get().onServerStarting(server -> { policy = EditorPolicy.load(); SESSIONS.clear(); dev.rinorsi.editor.vault.InventoryWrites.clear(); LOG.info("Editor session cache reset: server starting"); });
        Platform.get().onServerStopped(server -> { SESSIONS.clear(); dev.rinorsi.editor.vault.InventoryWrites.clear(); LOG.info("Editor session cache reset: server stopped"); });
        Platform.get().onDisconnect(player -> {
            TRANSFERS.remove(player.getUUID());
            SESSIONS.remove(player.getUUID()); LOG.info("Editor session removed: disconnect {}", player.getUUID());
            dev.rinorsi.editor.vault.InventoryWrites.remove(player.getUUID());
            dev.rinorsi.editor.vault.VaultGiveServer.remove(player.getUUID());
        });
        Platform.get().receive((player, packet) -> {
            try (var language = EditorI18n.forLanguage(player.clientInformation().language())) {
                handle(player, packet.json());
            }
        });
    }

    private static void handle(ServerPlayer player, String json) {
        String requestId = "";
        boolean vaultGive = false;
        try {
            if (json.length() > EditorPackets.MAX_JSON) EditorSessions.fail("payload_too_large", EditorI18n.tr("cadeditor.message.editormod.a85c5bd848"));
            json=TRANSFERS.computeIfAbsent(player.getUUID(),ignored->new EditorWire.Receiver()).accept(json);
            if(json==null)return;
            JsonObject request = JsonParser.parseString(json).getAsJsonObject();
            request = dev.rinorsi.editor.world.WorldWire.decode(request);
            vaultGive = request.has("op") && request.get("op").getAsString().equals("vault_give");
            if (vaultGive) {
                requestId = StackCodec.string(request, "requestId");
                if (requestId.isEmpty() || requestId.length() > 80) EditorSessions.fail("invalid_request", EditorI18n.tr("cadeditor.message.editormod.10c33b396f"));
                send(player, dev.rinorsi.editor.vault.VaultGiveServer.give(player, request)); return;
            }
            if (dev.rinorsi.editor.world.WorldEditor.route(player, request, () -> policy)) return;
            requestId = StackCodec.string(request, "requestId");
            if (requestId.length() > 80) StackCodec.fail(EditorI18n.tr("cadeditor.message.editormod.149064e062"));
            dev.rinorsi.editor.vault.InventoryWrites.rateLimit(player.getUUID());
            dev.rinorsi.editor.vault.VaultStore.checkDepth(request);
            String operation = StackCodec.string(request, "op");
            EditorWriteLog.event("server.request.received", requestId, "op=" + operation
                    + " creative=" + player.isCreative() + " gamemaster=" + EditorPolicy.gameMaster(player)
                    + " payload_chars=" + json.length());
            JsonObject slot;
            try { slot = StackCodec.object(request, "slot"); EditorSessions.sameSlot(slot, slot); }
            catch (RuntimeException e) { EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.editormod.afc1cd076c")); return; }
            if (operation.equals("close")) {
                SESSIONS.close(player.getUUID(), slot);
                LOG.info("Editor close received: {}", player.getUUID()); return;
            }
            Target target = target(player, slot, operation.equals("open"));
            if (operation.equals("open")) {
                JsonObject canonical = new JsonObject();
                canonical.addProperty("kind", target.inventoryIndex >= 0 ? "inventory" : "menu");
                canonical.addProperty("index", target.inventoryIndex >= 0 ? target.inventoryIndex : target.menuSlot.index);
                if (target.menu != null) canonical.addProperty("menuId", target.menu.containerId);
                canonical.addProperty("token", UUID.randomUUID().toString());
                var session = SESSIONS.open(player.getUUID(), canonical, target.current(player));
                var reply = result("opened", requestId);
                reply.add("item", target.snapshot(session.original, player, session.slot));
                LOG.info("Editor session opened/replaced: {} {}", player.getUUID(), canonical);
                send(player, reply); return;
            }
            if (!operation.equals("apply") && !operation.equals("confirm")) StackCodec.fail(EditorI18n.tr("cadeditor.message.editormod.3d6f5afdc1", (operation)));
            policy.require(player);
            EditorWriteLog.event("server.permission.allowed", requestId, "op=" + operation
                    + " inventory_index=" + target.inventoryIndex);
            var current = target.current(player);
            if (operation.equals("confirm")) {
                if (!player.isCreative() || target.inventoryIndex < 0)
                    EditorSessions.fail("not_allowed", EditorI18n.tr("cadeditor.message.editormod.3ebc103ced"));
                boolean missing = SESSIONS.get(player.getUUID()) == null;
                var session = SESSIONS.confirm(player.getUUID(), slot, requestId, optionalBaseline(request, "commitBaseline"),
                        current, player.registryAccess());
                if (missing) LOG.info("Editor confirm recovered from committed baseline: {}", player.getUUID());
                saved(player, target, session, requestId); return;
            }
            boolean missing = SESSIONS.get(player.getUUID()) == null;
            var session = SESSIONS.apply(player.getUUID(), slot, optionalBaseline(request, "baseline"), current, player.registryAccess());
            if (missing) LOG.info("Editor apply recovered from unchanged baseline: {}", player.getUUID());
            ItemStack next = StackCodec.decode(request, player.registryAccess(), session.original);
            dev.rinorsi.editor.registry.EntitySchemaValidation.validateStack(next, player.level());
            if (target.menuSlot != null && !target.menuSlot.mayPlace(next))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.editormod.285f2deaf8"));
            if (target.menuSlot != null && next.getCount() > target.menuSlot.getMaxStackSize(next))
                EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.editormod.a85dd78a0c"));
            if (player.isCreative() && !EditorPolicy.gameMaster(player) && target.inventoryIndex >= 0) {
                session.prepared = next; session.preparedRequest = requestId;
                var reply = result("commit", requestId);
                reply.add("item", target.snapshot(next, player, session.slot));
                reply.addProperty("creativeSlot", target.creativeSlot(player));
                send(player, reply);
            } else {
                if (target.inventoryIndex >= 0) player.getInventory().setItem(target.inventoryIndex, next);
                else { target.menuSlot.set(next); target.menuSlot.setChanged(); }
                player.getInventory().setChanged(); player.inventoryMenu.broadcastChanges(); player.containerMenu.broadcastChanges();
                if (target.inventoryIndex >= 0) player.connection.send(new net.minecraft.network.protocol.game.ClientboundSetPlayerInventoryPacket(target.inventoryIndex, next.copy()));
                session.original = next.copy(); session.prepared = null;
                saved(player, target, session, requestId);
            }
        } catch (RuntimeException e) {
            if (!(e instanceof IllegalArgumentException)) EditorDiagnostics.failure("item.request", "request=" + requestId, e);
            var reply = result("rejected", requestId);
            String code = e instanceof EditorSessions.Failure failure ? failure.code : "invalid_request";
            if (code.equals("item_changed")) code = "slot_changed";
            if (vaultGive) reply.addProperty("op", "vault_give");
            reply.addProperty("code", code);
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            reply.addProperty("reason", reason.length() > 1500 ? reason.substring(0, 1500) : reason);
            LOG.warn("Editor request rejected: player={} request={} code={} reason={}", player.getUUID(), requestId, code, reason);
            send(player, reply);
        }
    }

    private static String optionalBaseline(JsonObject request, String key) {
        if (!request.has(key)) return null;
        var value = request.get(key);
        if (!value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
            EditorSessions.fail("session_lost", EditorI18n.tr("cadeditor.message.editormod.5e01390dd5"));
        return value.getAsString();
    }

    private static Target target(ServerPlayer player, JsonObject slot, boolean opening) {
        if (!player.isAlive() || (player.isSpectator() && !EditorPolicy.gameMaster(player))) EditorSessions.fail("permission_denied", EditorI18n.tr("cadeditor.message.editormod.fcb9bea31c"));
        try {
            String kind = StackCodec.string(slot, "kind");
            Target target;
            if (kind.equals("inventory")) {
                int index = StackCodec.integer(slot, "index", 0, player.getInventory().getContainerSize() - 1);
                target = new Target(index, null, null);
            } else if (kind.equals("menu")) {
                var menu = player.containerMenu;
                if (menu == player.inventoryMenu || !menu.stillValid(player)
                        || StackCodec.integer(slot, "menuId", 0, Integer.MAX_VALUE) != menu.containerId)
                    throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editormod.63c2a9f877"));
                var menuSlot = menu.getSlot(StackCodec.integer(slot, "index", 0, menu.slots.size() - 1));
                if (!menuSlot.mayPickup(player) || !menuSlot.isActive()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editormod.a2a2c2d947"));
                target = new Target(-1, menu, menuSlot);
            } else throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editormod.eb6a68fefa"));
            if (opening && target.current(player).isEmpty()) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editormod.281e244db5"));
            return target;
        } catch (RuntimeException e) {
            EditorSessions.fail("slot_invalid", EditorI18n.tr("cadeditor.message.editormod.8abdd684ef", (e.getMessage()))); return null;
        }
    }

    private static void saved(ServerPlayer player, Target target, EditorSessions.State session, String requestId) {
        var reply = result("saved", requestId);
        reply.add("item", target.snapshot(session.original, player, session.slot)); send(player, reply);
    }
    private static JsonObject result(String status, String requestId) {
        var result = new JsonObject(); result.addProperty("status", status); result.addProperty("requestId", requestId);
        result.addProperty("code", status.equals("rejected") ? "invalid_request" : "ok");
        result.addProperty("reason", switch (status) { case "opened" -> EditorI18n.tr("cadeditor.message.editormod.4ab47946e7"); case "saved" -> EditorI18n.tr("cadeditor.message.editormod.1601f9aa9e"); case "commit" -> EditorI18n.tr("cadeditor.message.editormod.cf156a315a"); default -> EditorI18n.tr("cadeditor.message.editormod.0fbd4b71b2"); });
        return result;
    }
    private static void send(ServerPlayer player, JsonObject json) {
        String text = json.toString();
        String status = json.get("status").getAsString();
        if (text.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > EditorWire.MAX_JSON_BYTES) {
            EditorWriteLog.warning("server.reply.oversize", json.get("requestId").getAsString(),
                    "status=" + status + " payload_chars=" + text.length() + " outcome_requires_reread=true");
            var error = result("rejected", json.get("requestId").getAsString());
            error.addProperty("code", "payload_too_large");
            error.addProperty("reason", EditorI18n.tr("cadeditor.message.editormod.e9546cdf62")); text = error.toString();
            status = "rejected";
        }
        Platform.get().send(player, new EditorPackets.Reply(text));
        EditorWriteLog.event("server.reply.sent", json.get("requestId").getAsString(),
                "status=" + status + " payload_chars=" + text.length());
    }

    private record Target(int inventoryIndex, AbstractContainerMenu menu, Slot menuSlot) {
        ItemStack current(ServerPlayer player) { return inventoryIndex >= 0 ? player.getInventory().getItem(inventoryIndex) : menuSlot.getItem(); }
        int creativeSlot(ServerPlayer player) {
            return player.inventoryMenu.slots.stream()
                    .filter(s -> s.container == player.getInventory() && s.getContainerSlot() == inventoryIndex)
                    .mapToInt(s -> s.index).filter(i -> i >= 1 && i <= 45).findFirst()
                    .orElseThrow(() -> new EditorSessions.Failure("slot_invalid", EditorI18n.tr("cadeditor.message.editormod.0e8d797329")));
        }
        JsonObject snapshot(ItemStack stack, ServerPlayer player, JsonObject slot) {
            String label = inventoryIndex >= 0 ? (inventoryIndex < 9 ? EditorI18n.tr("cadeditor.message.editormod.2bf6acf86f", ((inventoryIndex + 1))) : EditorI18n.tr("cadeditor.message.editormod.6b6ea484a9", (inventoryIndex)))
                    : EditorI18n.tr("cadeditor.message.editormod.2e3a2a027e", (menuSlot.index));
            if (inventoryIndex == player.getInventory().getSelectedSlot()) label += EditorI18n.tr("cadeditor.ui.worldplayer.ac19b9acb8");
            var snapshot = StackCodec.snapshot(stack, player.registryAccess(), slot, label);
            snapshot.addProperty("baseline", EditorSessions.fingerprint(stack, player.registryAccess())); return snapshot;
        }
    }
}
