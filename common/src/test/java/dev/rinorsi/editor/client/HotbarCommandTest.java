package dev.rinorsi.editor.client;

import com.mojang.brigadier.StringReader;
import dev.rinorsi.editor.EditorSessions;
import dev.rinorsi.editor.StackCodec;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.chat.Component;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;

/** Real command argument parser/Codec plus deterministic lifecycle checks; no game window. */
public final class HotbarCommandTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup = net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p -> p.apply());
        var registries = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        var original = new ItemStack(Items.DIAMOND_SWORD);
        var next = original.copy();
        next.set(DataComponents.CUSTOM_NAME, Component.literal("中文 ] run say forged / \"quoted\""));
        next.remove(DataComponents.ATTRIBUTE_MODIFIERS);
        var tag = new CompoundTag(); tag.putLong("precise", 9007199254740993L);
        next.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        for (int i = 0; i <= 35; i++) {
            String command = HotbarCommandCodec.compile(i, original, next, registries);
            String name = HotbarCommandCodec.slotName(i);
            check(net.minecraft.commands.arguments.SlotArgument.slot().parse(new StringReader(name)) == i, "native slot mapping " + i);
            String marker = " run item replace entity @s " + name + " with ";
            int start = command.indexOf(marker);
            check(start > 0 && !command.contains("mainhand"), "fixed hotbar slot " + i);
            var reader = new StringReader(command.substring(start + marker.length()));
            var parsed = new net.minecraft.commands.arguments.item.ItemParser(registries).parse(reader);
            reader.expect(' '); int count = reader.readInt();
            check(!reader.canRead(), "entire item argument consumed without injection");
            check(ItemStack.matches(next, parsed.createItemStack(count)), "native command round trip " + i);
            String predicate = command.substring(command.indexOf("nbt=") + 4, start - 1);
            var condition = (CompoundTag) net.minecraft.nbt.TagParser.create(NbtOps.INSTANCE).parseFully(predicate);
            var stored = condition.getList("Inventory").orElseThrow().getCompound(0).orElseThrow();
            var slot = net.minecraft.world.ItemStackWithSlot.CODEC.parse(registries.createSerializationContext(NbtOps.INSTANCE), stored).getOrThrow();
            check(slot.slot() == i && ItemStack.matches(slot.stack(), original), "real saved-slot codec predicate " + i);
            check(stored.get("Slot") instanceof net.minecraft.nbt.ByteTag, "native Inventory Slot byte " + i);
            String insert = HotbarCommandCodec.compile(i, ItemStack.EMPTY, next, registries);
            String pathText = insert.substring("execute unless data entity @s ".length(), insert.indexOf(" run item"));
            var path = net.minecraft.commands.arguments.NbtPathArgument.nbtPath().parse(new StringReader(pathText));
            var playerNbt = new CompoundTag(); var list = new net.minecraft.nbt.ListTag(); playerNbt.put("Inventory", list);
            check(path.countMatching(playerNbt) == 0, "empty native path allows insert " + i);
            list.add(stored);
            check(path.countMatching(playerNbt) == 1, "occupied native path rejects race " + i);
        }
        rejects(() -> HotbarCommandCodec.compile(-1, original, next, registries), "slot_invalid");
        rejects(() -> HotbarCommandCodec.compile(36, original, next, registries), "slot_invalid");
        rejects(() -> HotbarCommandCodec.compile(40, original, next, registries), "slot_invalid");
        check(HotbarCommandCodec.emptySlot("inventory", -1, i -> i == 35) == 35, "last ordinary slot usable");
        check(HotbarCommandCodec.emptySlot("inventory", -1, i -> true) == 9, "ordinary region starts at nine");
        check(HotbarCommandCodec.emptySlot("hotbar", -1, i -> true) == 0, "hotbar region starts at zero");
        rejects(() -> HotbarCommandCodec.emptySlot("inventory", -1, i -> false), "inventory_full");
        rejects(() -> HotbarCommandCodec.emptySlot("inventory", 9, i -> false), "slot_changed");
        rejects(() -> HotbarCommandCodec.emptySlot("cursor", -1, i -> true), "unsupported_slot");
        rejects(() -> ClientInventoryCommands.requireCommands(false, true), "command_unavailable");
        rejects(() -> ClientInventoryCommands.requireCommands(true, false), "command_unavailable");
        ClientInventoryCommands.requireCommands(true, true); checks++;
        rejects(() -> HotbarCommandCodec.requireLength("x".repeat(32768)), "command_too_long");
        HotbarCommandCodec.requireLength("中".repeat(32767)); checks++;
        var tooLarge = next.copy(); tooLarge.set(DataComponents.CUSTOM_NAME, Component.literal("中".repeat(32768)));
        rejects(() -> HotbarCommandCodec.compile(0, original, tooLarge, registries), "command_too_long");
        var badCount = next.copy(); badCount.setCount(2);
        try { HotbarCommandCodec.compile(0, original, badCount, registries); throw new AssertionError("count"); }
        catch (IllegalArgumentException expected) { checks++; }
        var page = StackCodec.snapshot(original, registries, new com.google.gson.JsonObject(), "test");
        page.addProperty("count", 1.5);
        try { StackCodec.decode(page, registries, original); throw new AssertionError("fractional count"); }
        catch (IllegalArgumentException expected) { checks++; }
        for (char illegal : new char[]{167, 127}) {
            var unsafeOriginal = original.copy();
            unsafeOriginal.set(DataComponents.CUSTOM_NAME, Component.literal("original" + illegal));
            rejects(() -> HotbarCommandCodec.compile(0, unsafeOriginal, next, registries), "invalid_request");
            var unsafeNext = next.copy();
            var data = new CompoundTag(); data.putString("sample", "next" + illegal);
            unsafeNext.set(DataComponents.CUSTOM_DATA, CustomData.of(data));
            rejects(() -> HotbarCommandCodec.compile(0, original, unsafeNext, registries), "invalid_request");
            check(!net.minecraft.util.StringUtil.isAllowedChatCharacter(illegal), "real transport rejects " + (int) illegal);
        }
        lifecycle();
        vaultLifecycle();
        documentReload();
        hostWiring();
        System.out.println("PASS " + checks + " hotbar command parser/codec/lifecycle checks; no game started");
    }

    private static void lifecycle() {
        Object connection = new Object(), world = new Object(), player = new Object(), menu = new Object();
        var base = new HotbarCommandSession.Context(connection, world, player, menu, 4, "old");
        var session = new HotbarCommandSession(3, base);
        session.begin(base, "request", "new", 0);
        rejects(() -> session.begin(base, "duplicate", "other", 1), "request_pending");
        check(session.pending(), "duplicate preserves in-flight request");
        check(session.observe(new HotbarCommandSession.Context(connection, world, player, menu, 4, "new"), "request", 1) == HotbarCommandSession.Outcome.WAITING, "matching local value without sync cannot save");
        check(session.observe(new HotbarCommandSession.Context(connection, world, player, menu, 5, "old"), "request", 2) == HotbarCommandSession.Outcome.WAITING, "other slot sync cannot save");
        var saved = new HotbarCommandSession.Context(connection, world, player, menu, 6, "new");
        check(session.observe(saved, "request", 3) == HotbarCommandSession.Outcome.SAVED, "new menu state and exact stack save");
        session.begin(saved, "request", "again", 4);
        check(session.observe(saved, "request", 10_000_000_004L) == HotbarCommandSession.Outcome.UNKNOWN, "timeout/rejection has unknown outcome");
        rejects(() -> session.begin(saved, "request", "retry", 10_000_000_005L), "session_stale");
        for (int i = 0; i < 4; i++) {
            var changed = new HotbarCommandSession.Context(i == 0 ? new Object() : connection, i == 1 ? new Object() : world,
                    i == 2 ? new Object() : player, i == 3 ? new Object() : menu, 5, "old");
            var stale = new HotbarCommandSession(0, base);
            rejects(() -> stale.begin(changed, "request", "new", 0), "item_changed");
            var pending = new HotbarCommandSession(0, base); pending.begin(base, "request", "new", 0);
            check(pending.observe(changed, "request", 1) == HotbarCommandSession.Outcome.UNKNOWN, "lifecycle during flight " + i);
        }
        var changed = new HotbarCommandSession.Context(connection, world, player, menu, 5, "other");
        var stale = new HotbarCommandSession(0, base);
        rejects(() -> stale.begin(changed, "request", "new", 0), "item_changed");
        var pending = new HotbarCommandSession(0, base); pending.begin(base, "request", "new", 0);
        check(pending.observe(changed, "request", 1) == HotbarCommandSession.Outcome.CHANGED, "unexpected changed stack invalidates");
        var restored = new HotbarCommandSession(0, base); restored.observe(changed, null, 1);
        rejects(() -> restored.begin(base, "request", "new", 2), "session_stale");
        var closed = new HotbarCommandSession(0, base); closed.invalidate();
        rejects(() -> closed.begin(base, "request", "new", 0), "session_stale");
        rejects(() -> new HotbarCommandSession(0, base).begin(base, "request", "old", 0), "no_changes");
    }

    private static void vaultLifecycle() {
        check(ClientInventoryCommands.fingerprint(ItemStack.EMPTY, null).equals("empty-inventory-slot"), "empty baseline avoids nonempty ItemStack CODEC");
        Object connection = new Object(), world = new Object(), player = new Object(), menu = new Object();
        var empty = new HotbarCommandSession.Context(connection, world, player, menu, 4, "empty-inventory-slot");
        var occupied = new HotbarCommandSession.Context(connection, world, player, menu, 5, "other");
        for (int index : new int[]{9, 35}) {
            var raced = new HotbarCommandSession(index, empty);
            rejects(() -> raced.begin(occupied, "race", "vault-item", 0), "item_changed");
            var session = new HotbarCommandSession(index, empty);
            session.begin(empty, "give", "vault-item", 0);
            check(session.observe(occupied, "give", 1) == HotbarCommandSession.Outcome.CHANGED, "vault occupied during network wait refuses confirmation");
            var synced = new HotbarCommandSession.Context(connection, world, player, menu, 5, "vault-item");
            var saved = new HotbarCommandSession(index, empty); saved.begin(empty, "give", "vault-item", 0);
            check(saved.observe(synced, "give", 1) == HotbarCommandSession.Outcome.SAVED && saved.confirmed(), "vault exact stack plus real revision confirms " + index);
            check(!ClientInventoryCommands.leaseBlocks(saved, true, 1, 10), "confirmed write releases shared lease");
            var closed = new HotbarCommandSession(index, empty); closed.begin(empty, "give", "vault-item", 0); closed.invalidate();
            check(ClientInventoryCommands.leaseBlocks(closed, true, 1, 10), "page reload cannot release an unconfirmed network command");
            check(!ClientInventoryCommands.leaseBlocks(closed, false, 1, 10), "other connection does not inherit old lease");
            check(!ClientInventoryCommands.leaseBlocks(closed, true, 10, 10), "unknown lease expires without retrying");
            check(closed.observe(synced, "give", 1) == HotbarCommandSession.Outcome.WAITING && !closed.confirmed(), "closed page ignores late exact sync");
            var timeout = new HotbarCommandSession(index, empty); timeout.begin(empty, "give", "vault-item", 0);
            check(timeout.observe(empty, "give", 10_000_000_000L) == HotbarCommandSession.Outcome.UNKNOWN, "vault timeout remains unknown");
            check(timeout.observe(synced, "give", 10_000_000_001L) == HotbarCommandSession.Outcome.WAITING && !timeout.confirmed(), "late vault sync cannot turn timeout into success");
        }
    }

    private static void documentReload() {
        Object connection = new Object(), world = new Object(), player = new Object(), menu = new Object();
        Object oldDocument = new Object(), newDocument = new Object();
        var base = new HotbarCommandSession.Context(connection, world, player, menu, 1, "A");
        var synced = new HotbarCommandSession.Context(connection, world, player, menu, 2, "B");
        var session = new HotbarCommandSession(9, base); session.begin(base, "old-request", "B", 0);
        var binding = new EditorClient.CommandPage(oldDocument);
        String[] baseline = {"A"}; int[] results = {0};
        java.util.function.BiConsumer<HotbarCommandSession.Outcome, String> sink = (outcome, id) -> { results[0]++; baseline[0]="B"; };
        EditorClient.pollCommand(session, synced, "old-request", 1, binding, newDocument, sink);
        check(results[0] == 0 && baseline[0].equals("A") && !session.confirmed(), "actual host poll rejects old Document saved before changing baseline");
        check(!binding.accept(newDocument), "reload page cannot submit stale A as a fresh write");
        rejects(() -> session.begin(synced, "new-page-A", "A", 2), "session_stale");
        check(ClientInventoryCommands.leaseBlocks(session, true, 2, 10_000_000_000L), "Document invalidation preserves network lease");
        EditorClient.pollCommand(session, synced, "old-request", 3, binding, oldDocument, sink);
        check(results[0] == 0 && baseline[0].equals("A"), "returning to old Document cannot revive baseline");
        var ready = new EditorClient.CommandPage(null);
        check(!ready.accept(null) && ready.accept(oldDocument), "initial not-yet-parsed document binds once ready");
    }
    private static void hostWiring() {
        Object connection = new Object(), world = new Object(), player = new Object(), menu = new Object();
        var base = new HotbarCommandSession.Context(connection, world, player, menu, 4, "old");
        var synced = new HotbarCommandSession.Context(connection, world, player, menu, 5, "new");
        var session = new HotbarCommandSession(0, base);
        session.begin(base, "boundary", "new", 100);
        var results = new java.util.ArrayList<String>();
        String[] hostBaseline = {"old"};
        java.util.function.BiConsumer<HotbarCommandSession.Outcome, String> sink = (outcome, id) -> {
            check(id != null, "no result without request ID");
            results.add(id + ":" + outcome);
            if (outcome == HotbarCommandSession.Outcome.SAVED) hostBaseline[0] = "new";
        };
        check(!EditorClient.usesGenericTimeout(true, null, "boundary", 10_000_000_050L, 10_000_000_000L), "generic earlier deadline cannot expire command request");
        EditorClient.pollCommand(session, base, "boundary", 10_000_000_099L, sink);
        check(results.isEmpty(), "before sole command deadline still pending");
        EditorClient.pollCommand(session, base, "boundary", 10_000_000_100L, sink);
        check(results.equals(java.util.List.of("boundary:UNKNOWN")), "exact deadline emits one bound unknown");
        EditorClient.pollCommand(session, synced, null, 10_000_000_101L, sink);
        check(results.size() == 1 && hostBaseline[0].equals("old"), "late sync after timeout cannot update host baseline or emit null-ID saved");
        var orphan = new HotbarCommandSession(0, base); orphan.begin(base, "orphan", "new", 0);
        EditorClient.pollCommand(orphan, synced, null, 1, sink);
        check(results.size() == 1 && !orphan.pending(), "missing live page request invalidates before success");
        var wrongId = new HotbarCommandSession(0, base); wrongId.begin(base, "old-page", "new", 0);
        EditorClient.pollCommand(wrongId, synced, "new-page", 1, sink);
        check(results.size() == 1 && !wrongId.pending(), "different live request cannot consume old success");
        var normal = new HotbarCommandSession(0, base); normal.begin(base, "normal", "new", 0);
        EditorClient.pollCommand(normal, synced, "normal", 1, sink);
        check(results.getLast().equals("normal:SAVED") && hostBaseline[0].equals("new"), "bound synchronized success updates host once");
        check(EditorClient.usesGenericTimeout(false, null, "creative", 11, 10), "creative/mod transport timeout preserved");
        check(EditorClient.usesGenericTimeout(true, "opening", null, 11, 10), "server open timeout preserved");
    }
    private static void check(boolean ok, String reason) { if (!ok) throw new AssertionError(reason); checks++; }
    private static void rejects(Runnable action, String code) {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (EditorSessions.Failure error) { check(error.code.equals(code), "expected " + code + ", got " + error.code); }
    }
}
