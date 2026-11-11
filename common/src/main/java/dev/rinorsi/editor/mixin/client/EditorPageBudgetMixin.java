package dev.rinorsi.editor.mixin.client;

import dev.oriel.engine.Limits;
import dev.oriel.engine.host.Host;
import dev.oriel.mod.client.DocumentDriver;
import dev.rinorsi.editor.client.EditorPageRecovery;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;

/** Local Editor budgets for large typed documents; server-owned pages keep Oriel defaults. */
@Mixin(targets = "dev.oriel.mod.internal.client.McHost", remap = false)
public abstract class EditorPageBudgetMixin implements Host {
    @Shadow @Final private DocumentDriver driver;
    @Override public Limits limits() { return EditorPageRecovery.limits(driver, Limits.current()); }
}
