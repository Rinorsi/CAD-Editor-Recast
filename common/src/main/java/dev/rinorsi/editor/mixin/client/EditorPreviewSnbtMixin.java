package dev.rinorsi.editor.mixin.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import dev.oriel.mod.client.DocumentDriver;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.ComponentValidation;
import dev.rinorsi.editor.EditorDiagnostics;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.Minecraft;
import net.minecraft.nbt.CompoundTag;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Use the editor's typed SNBT parser for its item/model previews as well as Apply. */
@Mixin(targets = "dev.oriel.mod.internal.client.replaced.ItemStacks", remap = false)
public abstract class EditorPreviewSnbtMixin {
    @Unique private static final Map<DocumentDriver, String> cadeditor$lastProblem = new WeakHashMap<>();

    // Oriel has no per-page item parser hook. Other pages retain its vanilla parser.
    @Inject(method = "snbt", at = @At("HEAD"), cancellable = true)
    private static void cadeditor$typedPreview(String text, String what, CallbackInfoReturnable<CompoundTag> result) {
        if (text == null || (!text.contains("NaN") && !text.contains("Infinity"))) return;
        if (!(Minecraft.getInstance().gui.screen() instanceof OrielScreen screen)
            || !"cadeditor:ui/index.html".equals(screen.driver().name())) return;
        var driver = screen.driver();
        if (driver.serverSession()) return;
        try {
            // A preview contains several components; each component still has its own Apply budget.
            var parsed = ComponentValidation.parseSnbt(text, 1_048_576);
            if (!(parsed instanceof CompoundTag compound)) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorpreviewsnbtmixin.0acf5e4a9a"));
            result.setReturnValue(compound);
        } catch (RuntimeException error) {
            EditorDiagnostics.failure("preview.snbt", what, error);
            String signature = text.length() + ":" + text.hashCode();
            if (!signature.equals(cadeditor$lastProblem.put(driver, signature))) {
                var problem = new JsonObject();
                problem.addProperty("signature", signature);
                String message = String.valueOf(error.getMessage());
                problem.addProperty("error", message.substring(0, Math.min(1000, message.length())));
                try { driver.patch("preview.problem", problem); }
                catch (RuntimeException delivery) { EditorDiagnostics.failure("preview.problem.delivery", what, delivery); }
            }
            result.setReturnValue(null);
        }
    }
}
