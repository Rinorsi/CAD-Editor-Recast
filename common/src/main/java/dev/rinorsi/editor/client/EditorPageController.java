package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.oriel.engine.dom.Document;
import dev.oriel.engine.dom.Element;
import dev.oriel.engine.host.PageControllers;
import dev.oriel.engine.input.TextSelection;
import dev.oriel.kit.Motion;
import dev.oriel.kit.Dom;
import dev.oriel.kit.Shell;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Version-pinned, optional enhancement for both packaged and live-folder pages. */
public final class EditorPageController implements PageControllers.Controller {
    private static final Logger LOG = LoggerFactory.getLogger("EditorPageController");
    private Document document;
    private String restored;

    public static void register() {
        PageControllers.register("cadeditor:ui/index.html", EditorPageController::new);
    }

    @Override public void attach(Document doc) {
        if (document == doc) return;
        if (document != null) throw new IllegalStateException("A controller belongs to one document");
        document = doc;
        Shell.setup(doc); // Also attaches Motion and Widgets. Never repeat for dynamic content.
        doc.documentElement().setAttribute("data-editor-controller", "ready");
        doc.documentElement().setAttribute("data-editor-code-indent", "ready");
        doc.addEventListener("ed:code-indent", event -> guarded(() -> {
            if (!(event.target() instanceof Element field) || !field.hasAttribute("data-code-indent")) return;
            boolean outdent = "out".equals(field.getAttribute("data-code-indent"));
            field.removeAttribute("data-code-indent");
            var edit = CodeIndent.plan(field.value(), TextSelection.start(field), TextSelection.end(field), outdent);
            if (edit == null) return;
            TextSelection.replace(field, edit.from(), edit.to(), edit.text());
            TextSelection.select(field, edit.selectionStart(), edit.selectionEnd());
        }));
        doc.addEventListener("ed:tabs", event -> guarded(() -> {
            for (Element bar : doc.querySelectorAll("[data-ed-indicator]")) {
                Element selected = doc.querySelector(bar.getAttribute("data-ed-indicator"));
                if (selected != null && bar.parentElement() != null) Motion.indicator(bar, selected);
            }
        }));
        doc.addEventListener("ed:toggle", event -> guarded(() -> {
            if (event.target() instanceof Element body && body.hasAttribute("data-ed-open")) {
                if (!animations()) {
                    boolean open = Boolean.parseBoolean(body.getAttribute("data-ed-open"));
                    if (body.parentElement() != null) body.parentElement().toggleClass("m-open", open);
                    new Dom.Style(body).set("height", open ? "auto" : "0px").set("opacity", open ? "1" : "0").set("overflow", open ? "visible" : "hidden").apply();
                    return;
                }
                Motion.toggle(body, Boolean.parseBoolean(body.getAttribute("data-ed-open")));
            }
        }));
        doc.addEventListener("ed:count", event -> guarded(() -> {
            if (!(event.target() instanceof Element number)) return;
            double from = Double.parseDouble(number.getAttribute("data-ed-from"));
            double to = Double.parseDouble(number.getAttribute("data-ed-to"));
            if (!Double.isFinite(from) || !Double.isFinite(to)) return;
            int ms = number.hasAttribute("data-ed-ms") ? Integer.parseInt(number.getAttribute("data-ed-ms")) : 250;
            String suffix = number.hasAttribute("data-ed-suffix") ? number.getAttribute("data-ed-suffix") : "";
            if (animations()) Motion.count(number, from, to, Math.clamp(ms, 1, 3000), suffix);
            else number.setTextContent(Math.round(to) + suffix);
        }));
        if (restored != null) restoreDraft(restored);
        LOG.info("Editor controller attached; Shell.setup once, dynamic events ready");
    }

    private void guarded(Runnable work) {
        try { work.run(); } catch (RuntimeException error) { LOG.warn("Ignored invalid Editor motion event", error); }
    }
    private boolean animations() { return !"reduced".equals(document.documentElement().getAttribute("data-motion")); }

    @Override public Object saveState() {
        if (document == null || document.error() != null || document.scripts() == null) return null;
        // A submitted request may be in flight: retain the driver's authoritative state instead.
        String json = document.scripts().evaluateToJson("(function(){"
                + "if(typeof Store==='undefined'||typeof UI==='undefined'||!Store.doc()||"
                + "(typeof EditorBridge!=='undefined'&&EditorBridge.pending)||typeof NestedItem!=='undefined'&&NestedItem)return null;"
                + "if(typeof flushPendingCode==='function')flushPendingCode();"
                + "var u={};for(var k in UI){var v=UI[k];if(k!=='page'&&k.indexOf('Timer')<0&&!(v&&typeof v==='object'&&(typeof v.setAttribute==='function'||v.nodeType)))u[k]=v;}"
                + "return {version:2,docs:Store.docs.map(nbtExportDocState),index:Store.index(),ui:u,open:typeof UIOpen==='undefined'?{}:UIOpen};})()", "editor-save-state");
        if (json == null || json.length() > 64 * 1024 * 1024 || json.equals("null")) return null;
        return json;
    }

    @Override public void restoreState(Object saved) {
        if (!(saved instanceof String json) || json.length() > 64 * 1024 * 1024) return;
        JsonObject value = JsonParser.parseString(json).getAsJsonObject();
        if (value.has("version") && (value.get("version").getAsInt() == 1 || value.get("version").getAsInt() == 2)) {
            restored = json;
            if (document != null) restoreDraft(json);
        }
    }

    private void restoreDraft(String json) {
        document.documentElement().setAttribute("data-editor-restore-stage", EditorI18n.tr("cadeditor.message.editorpagecontroller.79b2d9f746"));
        String result = document.scripts().evaluateToJson("(function(s){"
                + "if(typeof Store==='undefined'||typeof UI==='undefined'||!Store.doc()||!s.docs||!s.docs[s.index])return false;"
                + "var old=s.docs[s.index],current=Store.doc();"
                + "if(JSON.stringify(old.src)!==JSON.stringify(current.src))return false;"
                + "var docs=s.docs.map(nbtImportDocState);Store.docs.splice(0,Store.docs.length);for(var i=0;i<docs.length;i++)Store.docs.push(docs[i]);"
                + "for(var k in s.ui)if(Object.prototype.hasOwnProperty.call(s.ui,k))UI[k]=s.ui[k];"
                + "if(typeof UIOpen!=='undefined')for(var c in s.open)if(Object.prototype.hasOwnProperty.call(s.open,c))UIOpen[c]=s.open[c];"
                + "if(typeof applyUiMotion==='function')applyUiMotion(Prefs.get('uiAnimations',true)!==false);"
                + "if(typeof applyUiFont==='function')applyUiFont(Prefs.get('uiFont','mc'));"
                + "document.documentElement.setAttribute('data-editor-restore-stage',I18n.t('cadeditor.ui.common.painting'));"
                // Select under the loading guard, then paint once even when the restored UI was editing raw text.
                + "UI.loading=true;try{Store.select(s.index);}finally{UI.loading=false;}rebuild();"
                + "document.documentElement.setAttribute('data-editor-restored','true');"
                + "document.documentElement.setAttribute('data-editor-restore-stage',I18n.t('cadeditor.ui.common.done'));return true;"
                + "})(" + json + ");", "editor-restore-state");
        if ("true".equals(result)) LOG.info("Editor controller restored page state (same target only, one rebuild)");
        else if (result == null) LOG.warn(EditorI18n.tr("cadeditor.message.editorpagecontroller.40bd06f156"), document.documentElement().getAttribute("data-editor-restore-stage"));
        else {
            document.documentElement().setAttribute("data-editor-restore-stage", EditorI18n.tr("cadeditor.ui.common.done"));
            LOG.info("Editor controller skipped saved page state: target unavailable or changed");
        }
    }
}
