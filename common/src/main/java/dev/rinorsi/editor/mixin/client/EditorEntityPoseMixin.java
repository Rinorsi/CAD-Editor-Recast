package dev.rinorsi.editor.mixin.client;

import dev.oriel.engine.dom.Element;
import dev.oriel.mod.internal.client.replaced.TurnableContent;
import dev.rinorsi.editor.client.EditorStandPreview;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Oriel's {@code <entity>} has no pose input. Let the preview armor stand follow the page's {@code cad-stand} attribute,
 * both when the preview entity is created and when the attribute changes. It never touches world entities.
 */
@Mixin(targets = "dev.oriel.mod.internal.client.replaced.EntityContent", remap = false)
public abstract class EditorEntityPoseMixin extends TurnableContent {
    @Shadow private Entity created;

    protected EditorEntityPoseMixin(Element element) { super(element); }

    // RETURN, not TAIL: applyComponents returns early when the element has no components, which is the usual armor stand case.
    @Inject(method = "applyComponents", at = @At("RETURN"))
    private void cadeditor$poseOnCreate(Entity entity, CallbackInfo ci) {
        EditorStandPreview.apply(entity, this.element.getAttribute(EditorStandPreview.ATTRIBUTE));
    }

    @Inject(method = "attributeChanged", at = @At("TAIL"))
    private void cadeditor$poseOnChange(String name, CallbackInfo ci) {
        if (EditorStandPreview.ATTRIBUTE.equals(name) && this.created != null) {
            EditorStandPreview.apply(this.created, this.element.getAttribute(name));
        }
    }
}
