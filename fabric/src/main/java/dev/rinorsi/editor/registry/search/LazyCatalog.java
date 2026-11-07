package dev.rinorsi.editor.registry.search;

import java.util.*;

/** Per-document protocol policy, independent of Minecraft. */
public final class LazyCatalog {
    public static final String FEATURE = "lazy-catalog-v1";
    public static final int THRESHOLD = 600;
    private static final Set<String> ALWAYS = Set.of("items","item","blocks","block","sounds","sound_event","loot_table","loot_tables","recipe","recipes","item_model","camera_overlay","profile_texture","profile_cape","profile_elytra");
    public static boolean lazy(String kind, int count) {
        String path=kind.startsWith("minecraft:")?kind.substring(10):kind;
        return kind.startsWith("tags:")||ALWAYS.contains(path)||count>THRESHOLD;
    }
    private Object document;
    private boolean first=true, enabled;
    public void document(Object current){if(document!=current){document=current;first=true;enabled=false;}}
    public boolean message(String name, Collection<String> features){
        if(first&&name.equals("client_features"))enabled=features.contains(FEATURE);
        first=false;return enabled;
    }
    public boolean enabled(){return enabled;}
}
