package dev.rinorsi.editor.vault;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.*;
import net.minecraft.network.protocol.game.ClientboundSetPlayerInventoryPacket;
import net.minecraft.server.level.ServerPlayer;

/** Only the detached stack is sent; local vault ids/files are never server capabilities. */
public final class VaultGiveServer {
    private static final java.util.Map<java.util.UUID, GiveReceipts> RECEIPTS = new java.util.HashMap<>();
    private VaultGiveServer() {}
    public static void remove(java.util.UUID player) { RECEIPTS.remove(player); }
    public static void clear() { RECEIPTS.clear(); }
    public static JsonObject give(ServerPlayer player, JsonObject request) {
        InventoryWrites.rateLimit(player.getUUID());
        // Never trust client abilities or a previous acknowledgement as permission.
        if (!EditorPolicy.gameMaster(player)) EditorSessions.fail("permission_denied", EditorI18n.tr("cadeditor.message.vaultgiveserver.4aaf05b1ce"));
        if (player.isCreative()) EditorSessions.fail("creative_path_required", EditorI18n.tr("cadeditor.message.vaultgiveserver.df3c77632e"));
        if (player.connection == null || !player.isAlive())
            EditorSessions.fail("not_connected", EditorI18n.tr("cadeditor.message.vaultgiveserver.6fac38444e"));
        EditorWire.requirePayload(request.toString());
        VaultStore.checkDepth(request);
        JsonObject reply = RECEIPTS.computeIfAbsent(player.getUUID(), ignored -> new GiveReceipts()).execute(request, () -> write(player, request));
        // Record the mutation before network sends, so a send failure can never make a retry insert twice.
        player.inventoryMenu.sendAllDataToRemote();
        if (player.containerMenu != player.inventoryMenu) player.containerMenu.sendAllDataToRemote();
        int index = reply.get("inventoryIndex").getAsInt();
        player.connection.send(new ClientboundSetPlayerInventoryPacket(index, player.getInventory().getItem(index).copy()));
        return reply;
    }
    private static JsonObject write(ServerPlayer player, JsonObject request) {
        net.minecraft.world.item.ItemStack stack;
        try { stack = StackCodec.decode(StackCodec.object(request, "stack"), player.registryAccess()); }
        catch (RuntimeException invalid) { throw new EditorSessions.Failure("invalid_stack", EditorI18n.tr("cadeditor.message.vaultgiveserver.1b69f35edc", (invalid.getMessage()))); }
        dev.rinorsi.editor.registry.EntitySchemaValidation.validateStack(stack, player.level());
        int index = InventoryWrites.insert(player.getInventory(), stack, request);
        var reply = new JsonObject();
        reply.addProperty("op", "vault_give");
        reply.addProperty("requestId", StackCodec.string(request, "requestId"));
        reply.addProperty("status", "given");
        reply.addProperty("code", "ok");
        reply.addProperty("ok", true);
        reply.addProperty("confirmed", true);
        reply.addProperty("inventoryIndex", index);
        reply.addProperty("path", "server");
        var item = new JsonObject(); item.addProperty("id", net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()).toString()); item.addProperty("count", stack.getCount()); reply.add("item", item);
        reply.addProperty("reason", index < 9 ? EditorI18n.tr("cadeditor.message.vaultgiveserver.45216fc6b9", ((index+1))) : EditorI18n.tr("cadeditor.message.vaultgiveserver.cc08d67454", ((index-8)), (index)));
        return reply;
    }
}
