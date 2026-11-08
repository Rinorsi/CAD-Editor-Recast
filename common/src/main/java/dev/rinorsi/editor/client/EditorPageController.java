package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.oriel.engine.dom.Document;
import dev.oriel.engine.dom.Element;
import dev.oriel.engine.host.PageControllers;
import dev.oriel.kit.Motion;
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
        doc.addEventListener("ed:tabs", event -> guarded(() -> {
            for (Element bar : doc.querySelectorAll("[data-ed-indicator]")) {
                Element selected = doc.querySelector(bar.getAttribute("data-ed-indicator"));
                if (selected != null && bar.parentElement() != null) Motion.indicator(bar, selected);
            }
        }));
        doc.addEventListener("ed:toggle", event -> guarded(() -> {
            if (event.target() instanceof Element body && body.hasAttribute("data-ed-open")) {
                Motion.toggle(body, Boolean.parseBoolean(body.getAttribute("data-ed-open")));
            }
        }));
        doc.addEventListener("ed:count", event -> guarded(() -> {
            if (!(event.target() instanceof Element number)) return;
            double from = Double.parseDouble(number.getAttribute("data-ed-from"));
            double to = Double.parseDouble(number.getAttribute("data-ed-to"));
            if (!Double.isFinite(from) || !Double.isFinite(to)) return;
            int ms = number.hasAttribute("data-ed-ms") ? Integer.parseInt(number.getAttribute("data-ed-ms")) : 250;
            Motion.count(number, from, to, Math.clamp(ms, 1, 3000), number.hasAttribute("data-ed-suffix") ? number.getAttribute("data-ed-suffix") : "");
        }));
        if (restored != null) restoreDraft(restored);
        LOG.info("Editor controller attached; Shell.setup once, dynamic events ready");
    }

    private void guarded(Runnable work) {
        try { work.run(); } catch (RuntimeException error) { LOG.warn("Ignored invalid Editor motion event", error); }
    }

    @Override public Object saveState() {
        if (document == null || document.scripts() == null) return null;
        // A submitted request may be in flight: retain the driver's authoritative state instead.
        String json = document.scripts().evaluateToJson("(function(){"
                + "if(typeof Store==='undefined'||typeof UI==='undefined'||!Store.doc()||"
                + "(typeof EditorBridge!=='undefined'&&EditorBridge.pending))return null;"
                + "var u={};for(var k in UI){var v=UI[k];if(k!=='page'&&!(v&&typeof v==='object'&&(typeof v.setAttribute==='function'||v.nodeType)))u[k]=v;}"
                + "return {version:1,docs:Store.docs,index:Store.index(),ui:u,open:typeof UIOpen==='undefined'?{}:UIOpen};})()", "editor-save-state");
        if (json == null || json.length() > 2_000_000 || json.equals("null")) return null;
        return json;
    }

    @Override public void restoreState(Object saved) {
        if (!(saved instanceof String json) || json.length() > 2_000_000) return;
        JsonObject value = JsonParser.parseString(json).getAsJsonObject();
        if (value.has("version") && value.get("version").getAsInt() == 1) {
            restored = json;
            if (document != null) restoreDraft(json);
        }
    }

    private void restoreDraft(String json) {
        document.scripts().evaluate("(function(s){"
                + "if(typeof Store==='undefined'||typeof UI==='undefined'||!Store.doc()||!s.docs||!s.docs[s.index])return;"
                + "var old=s.docs[s.index],current=Store.doc();"
                + "if(JSON.stringify(old.src)!==JSON.stringify(current.src))return;"
                + "Store.docs.splice(0,Store.docs.length);for(var i=0;i<s.docs.length;i++)Store.docs.push(s.docs[i]);"
                + "for(var k in s.ui)if(Object.prototype.hasOwnProperty.call(s.ui,k))UI[k]=s.ui[k];"
                + "if(typeof UIOpen!=='undefined')for(var c in s.open)if(Object.prototype.hasOwnProperty.call(s.open,c))UIOpen[c]=s.open[c];"
                + "Store.select(s.index);rebuild();"
                + "document.documentElement.setAttribute('data-editor-restored','true');"
                + "})(" + json + ");", "editor-restore-state");
        LOG.info("Editor controller restored page state (same target only)");
    }
}
