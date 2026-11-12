package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import dev.rinorsi.editor.EditorDiagnostics;
import net.minecraft.core.Rotations;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.decoration.ArmorStand;

/**
 * Applies the editor's draft pose to the armor stand inside the 3D preview.
 * Only the detached preview entity Oriel creates is touched; the real world entity is never read or written here.
 * Attribute format: {@code Head=x,y,z;Body=x,y,z;LeftArm=…;RightArm=…;LeftLeg=…;RightLeg=…;ShowArms=1;Small=0;NoBasePlate=0}.
 * Missing keys keep the preview entity's own defaults.
 */
public final class EditorStandPreview {
    public static final String ATTRIBUTE = "cad-stand";
    private static String lastFailed;

    private EditorStandPreview() {}

    public static void apply(Entity entity, String spec) {
        if (spec == null || spec.isEmpty() || !(entity instanceof ArmorStand stand)) return;
        try {
            for (String part : spec.split(";")) {
                int eq = part.indexOf('=');
                if (eq <= 0) continue;
                String key = part.substring(0, eq).trim(), value = part.substring(eq + 1).trim();
                switch (key) {
                    case "Head" -> stand.setHeadPose(rotation(value));
                    case "Body" -> stand.setBodyPose(rotation(value));
                    case "LeftArm" -> stand.setLeftArmPose(rotation(value));
                    case "RightArm" -> stand.setRightArmPose(rotation(value));
                    case "LeftLeg" -> stand.setLeftLegPose(rotation(value));
                    case "RightLeg" -> stand.setRightLegPose(rotation(value));
                    case "ShowArms" -> stand.setShowArms(flag(value));
                    case "Small" -> setSmall(stand, flag(value));
                    case "NoBasePlate" -> stand.setNoBasePlate(flag(value));
                    default -> { }
                }
            }
        } catch (RuntimeException error) {
            if (!spec.equals(lastFailed)) { lastFailed = spec; EditorDiagnostics.failure("preview.stand", spec, error); }
        }
    }

    private static Rotations rotation(String value) {
        String[] n = value.split(",");
        if (n.length != 3) throw new IllegalArgumentException(EditorI18n.tr("cadeditor.message.editorstandpreview.e563b839fb", (value)));
        return new Rotations(angle(n[0]), angle(n[1]), angle(n[2]));
    }

    private static float angle(String text) {
        float v = Float.parseFloat(text.trim());
        return Float.isFinite(v) ? v : 0f;
    }

    /** {@code ArmorStand.setSmall} is private; write the same public client flag bit it uses. */
    private static void setSmall(ArmorStand stand, boolean small) {
        byte flags = stand.getEntityData().get(ArmorStand.DATA_CLIENT_FLAGS);
        flags = (byte) (small ? flags | ArmorStand.CLIENT_FLAG_SMALL : flags & ~ArmorStand.CLIENT_FLAG_SMALL);
        stand.getEntityData().set(ArmorStand.DATA_CLIENT_FLAGS, flags);
    }

    private static boolean flag(String value) { return "1".equals(value) || "true".equals(value); }
}
