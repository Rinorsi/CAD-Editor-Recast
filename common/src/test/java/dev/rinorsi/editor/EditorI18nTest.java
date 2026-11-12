package dev.rinorsi.editor;

/** Locale isolation and formatting without loading client/game classes. */
public final class EditorI18nTest {
    private static void equal(Object expected, Object actual) {
        if (!java.util.Objects.equals(expected, actual)) throw new AssertionError(expected + " != " + actual);
    }
    public static void main(String[] args) throws Exception {
        equal(EditorI18n.catalog("zh_cn").keySet(), EditorI18n.catalog("en_us").keySet());
        equal("fr_fr", EditorI18n.normalize("fr-FR"));
        equal("en_us", EditorI18n.normalize("../../bad"));
        equal(EditorI18n.catalog("en_us"), EditorI18n.catalog("missing_locale"));
        try (var extra = EditorI18n.forLanguage("qaa_test")) {
            equal("Test save", EditorI18n.tr("cadeditor.ui.common.save"));
            equal("Cancel", EditorI18n.tr("cadeditor.ui.common.cancel"));
        }
        equal("zh_cn", EditorI18n.normalize("zh-CN"));
        equal("100% user%1$s $1", EditorI18n.format("100%% %1$s %2$s", "user%1$s", "$1"));
        equal("first / second / first", EditorI18n.format("%s / %s / %1$s", "first", "second"));
        equal("∞ / NaN / null", EditorI18n.format("%1$s / %2$s / %3$s", "∞", "NaN", (Object) null));
        EditorI18n.client(() -> "zh_cn", key -> key.equals("cadeditor.ui.common.save") ? "资源包保存" : null);
        equal("资源包保存", EditorI18n.tr("cadeditor.ui.common.save"));
        try (var en = EditorI18n.forLanguage("en_us")) {
            equal("Save", EditorI18n.tr("cadeditor.ui.common.save"));
            try (var zh = EditorI18n.forLanguage("zh_cn")) {
                equal("保存", EditorI18n.tr("cadeditor.ui.common.save"));
            }
            equal("Save", EditorI18n.tr("cadeditor.ui.common.save"));
            var result = new java.util.concurrent.atomic.AtomicReference<String>();
            var thread = new Thread(() -> {
                try (var zh = EditorI18n.forLanguage("zh_cn")) { result.set(EditorI18n.tr("cadeditor.ui.common.save")); }
            });
            thread.start(); thread.join(); equal("保存", result.get());
            equal("Save", EditorI18n.tr("cadeditor.ui.common.save"));
        }
        equal("资源包保存", EditorI18n.tr("cadeditor.ui.common.save"));
        try {
            try (var en = EditorI18n.forLanguage("en_us")) { throw new IllegalArgumentException("expected"); }
        } catch (IllegalArgumentException expected) { equal("zh_cn", EditorI18n.locale()); }
        System.out.println("PASS i18n catalogs, positional formatting, resource overrides and per-player language isolation");
    }
}
