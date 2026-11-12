package dev.rinorsi.editor;

import dev.rinorsi.editor.platform.Platform;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;

/** Server command only, gated by the same creative/OP policy as Editor writes. */
final class TestKitCommand {
    private TestKitCommand() {}
    static boolean allowedMode(boolean creative, boolean operator) { return creative || operator; }
    static void register(Supplier<EditorPolicy> policy) {
        Platform.get().onCommands(dispatcher -> dispatcher.register(tree(policy)));
    }
    static com.mojang.brigadier.builder.LiteralArgumentBuilder<CommandSourceStack> tree(Supplier<EditorPolicy> policy) {
        return Commands.literal("cadeditor").then(Commands.literal("testkit")
                        .requires(source -> allowed(source, policy))
                        .executes(context -> run(context.getSource(), policy, "all"))
                        .then(Commands.literal("all").executes(context -> run(context.getSource(), policy, "all")))
                        .then(Commands.literal("hotbar").executes(context -> run(context.getSource(), policy, "hotbar")))
                        .then(Commands.literal("inventory").executes(context -> run(context.getSource(), policy, "inventory")))
                        .then(Commands.literal("clear").executes(context -> run(context.getSource(), policy, "clear"))));
    }
    private static boolean allowed(CommandSourceStack source, Supplier<EditorPolicy> policy) {
        if (!(source.getEntity() instanceof ServerPlayer player) || policy.get() == null) return false;
        if (!allowedMode(player.isCreative(), Commands.hasPermission(Commands.LEVEL_GAMEMASTERS).test(source))) return false;
        try { policy.get().require(player); return true; } catch (RuntimeException ignored) { return false; }
    }
    private static int run(CommandSourceStack source, Supplier<EditorPolicy> policy, String mode) {
        String language = source.getEntity() instanceof ServerPlayer player ? player.clientInformation().language() : "en_us";
        try (var scope = EditorI18n.forLanguage(language)) { return runLocalized(source, policy, mode); }
    }
    private static int runLocalized(CommandSourceStack source, Supplier<EditorPolicy> policy, String mode) {
        try {
            if (!(source.getEntity() instanceof ServerPlayer player)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkitcommand.f975a352a0"));
            if (!allowed(source, policy)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.testkitcommand.1094fd2251"));
            policy.get().require(player);
            var indices = new ArrayList<Integer>();
            for (int i = 0; i < (mode.equals("hotbar") ? 9 : 36); i++) indices.add(i);
            if (mode.equals("all") || mode.equals("clear")) indices.add(40);
            List<ItemStack> before = indices.stream().map(i -> player.getInventory().getItem(i).copy()).toList();
            int specimens = 0; List<ItemStack> after;
            if (mode.equals("clear")) after = TestKitInventory.clear(before);
            else {
                var kit = TestKit.create(player.registryAccess(), !mode.equals("hotbar"));
                if (mode.equals("hotbar")) kit = kit.subList(0, 9);
                specimens = kit.size(); after = TestKitInventory.give(before, kit, player.registryAccess());
            }
            // All generation/packing checks finish before touching any live inventory slot.
            for (int i = 0; i < indices.size(); i++) if (!ItemStack.matches(before.get(i), after.get(i)))
                player.getInventory().setItem(indices.get(i), after.get(i));
            player.getInventory().setChanged(); player.inventoryMenu.broadcastChanges(); player.containerMenu.broadcastChanges();
            int count = specimens;
            source.sendSuccess(() -> Component.literal(mode.equals("clear")
                    ? EditorI18n.tr("cadeditor.message.testkitcommand.e43f7eb151")
                    : EditorI18n.tr("cadeditor.message.testkitcommand.96f862dea7", (count), ((mode.equals("hotbar") ? EditorI18n.tr("cadeditor.message.testkitcommand.e787cbf75c") : EditorI18n.tr("cadeditor.message.testkitcommand.8ea3219ec9", (TestKit.expectedComponents().size())))))), false);
            return 1;
        } catch (RuntimeException error) { source.sendFailure(Component.literal(error.getMessage() == null ? EditorI18n.tr("cadeditor.message.testkitcommand.bad3ad0561") : error.getMessage())); return 0; }
    }
}
