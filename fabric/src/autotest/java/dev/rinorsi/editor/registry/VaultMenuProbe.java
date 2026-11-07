package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.blaze3d.platform.InputConstants;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.client.VaultClient;
import java.nio.file.Files;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents;
import net.minecraft.client.*;
import net.minecraft.client.gui.screens.*;
import net.minecraft.client.input.KeyEvent;
import org.lwjgl.glfw.GLFW;

/** Standalone hidden title-screen probe; never loaded in the user's game. */
public final class VaultMenuProbe implements ClientModInitializer {
    private final long started = System.nanoTime();
    private final JsonObject receipt = new JsonObject(), captures = new JsonObject();
    private final List<String> ops = List.of("import","list","get","update","tags","stats","duplicate","export","delete","restore","save","give");
    private final String id = UUID.randomUUID().toString();
    private OrielScreen page;
    private TitleScreen previous;
    private String token;
    private int step, ticks;
    private boolean sent, listening, done;
    public void onInitializeClient() { ClientTickEvents.END_CLIENT_TICK.register(this::tick); }

    private void tick(Minecraft mc) {
        if (done) { mc.stop(); return; }
        try {
            if (System.nanoTime()-started > 180_000_000_000L) throw new AssertionError("timeout step="+step);
            check(mc.level == null && mc.player == null, "no_world_or_player");
            if (page == null) {
                if (!(mc.screen instanceof TitleScreen title) || mc.getOverlay() != null) return;
                previous = title;
                check(KeyMapping.get("key.cadeditor.vault") != null, "registered_controls_key");
                check(KeyMapping.get("key.cadeditor.vault").getDefaultKey().getValue()==GLFW.GLFW_KEY_O,"default_vault_key_o");
                for(int modifier:new int[]{GLFW.GLFW_MOD_SHIFT,GLFW.GLFW_MOD_CONTROL,GLFW.GLFW_MOD_ALT}){
                    boolean allowed=ScreenKeyboardEvents.allowKeyPress(title).invoker().allowKeyPress(title,new KeyEvent(GLFW.GLFW_KEY_O,0,modifier));
                    check(allowed&&mc.screen==previous,"modified_shortcut_ignored_"+modifier);
                }
                boolean allowed=ScreenKeyboardEvents.allowKeyPress(title).invoker().allowKeyPress(title,new KeyEvent(GLFW.GLFW_KEY_O,0,0));
                check(!allowed&&mc.screen instanceof OrielScreen,"title_shortcut_opens_page");
                page = (OrielScreen) mc.screen;
                check(page.driver().url().equals(VaultClient.PAGE), "same_editor_page");
                JsonObject data = page.driver().data().getAsJsonObject();
                check(data.get("mode").getAsString().equals("vault") && data.get("world").isJsonNull() && data.get("stack").isJsonNull(), "opening_data");
                receipt.add("initialData", data.deepCopy());
                return;
            }
            if (page.driver().document() == null || !page.driver().settled()) return;
            if (!listening) {
                eval("var vaultMenuResults={};oriel.on('patch',function(p){if(p.key==='vault.result')vaultMenuResults[p.value.requestId]=p.value;});true");
                listening = true;
            }
            if (++ticks % 6 != 0) return;
            if (step == ops.size()) {
                page.onClose();
                check(mc.screen == previous, "close_returns_previous_title");
                var key = KeyMapping.get("key.cadeditor.vault");
                key.setKey(InputConstants.Type.KEYSYM.getOrCreate(GLFW.GLFW_KEY_B));
                KeyMapping.resetMapping();
                boolean allow = ScreenKeyboardEvents.allowKeyPress(previous).invoker().allowKeyPress(previous,new KeyEvent(GLFW.GLFW_KEY_O,0,0));
                check(allow && mc.screen == previous, "old_key_inactive_after_rebind");
                allow = ScreenKeyboardEvents.allowKeyPress(previous).invoker().allowKeyPress(previous,new KeyEvent(GLFW.GLFW_KEY_B,0,0));
                check(!allow && mc.screen instanceof OrielScreen, "rebound_screen_shortcut");
                key.setKey(key.getDefaultKey()); KeyMapping.resetMapping();
                mc.screen.onClose();
                check(mc.screen == previous, "rebound_page_returns_parent");
                VaultClient.open();check(mc.screen instanceof OrielScreen,"direct_open_api");mc.screen.onClose();check(mc.screen==previous,"direct_open_returns_parent");
                receipt.addProperty("status","PASSED"); receipt.add("messages",captures); finish(mc); return;
            }
            String requestId = "vault-menu-"+step;
            if (!sent) { eval("oriel.send('vault',"+request()+");true"); sent=true; return; }
            JsonElement response = eval("vaultMenuResults['"+requestId+"']||null");
            if (response.isJsonNull()) return;
            JsonObject result = response.getAsJsonObject();
            if (result.has("error") && result.get("error").getAsString().equals("NOT_READY")) { sent=false; return; }
            var pair = new JsonObject(); pair.add("request",request()); pair.add("response",result); captures.add(requestId,pair);
            if (step >= 10) check(!result.get("ok").getAsBoolean() && result.get("error").getAsString().equals("UNAVAILABLE"), ops.get(step)+"_requires_world");
            else check(result.get("ok").getAsBoolean(), ops.get(step)+"_without_world");
            if (step == 0) check(result.getAsJsonArray("results").get(0).getAsJsonObject().get("compatibilityUnknown").getAsBoolean(), "import_unknown_compatibility");
            if (step == 1) check(result.getAsJsonArray("entries").get(0).getAsJsonObject().get("compatibilityUnknown").getAsBoolean(), "list_unknown_compatibility");
            if (step == 8) token = result.get("token").getAsString();
            step++; sent=false;
        } catch (Throwable e) { receipt.addProperty("status","FAILED"); receipt.addProperty("reason",e.toString()); receipt.add("messages",captures); e.printStackTrace(); finish(mc); }
    }
    private JsonObject request() {
        var r = new JsonObject(); r.addProperty("op",ops.get(step)); r.addProperty("requestId","vault-menu-"+step);
        if (Set.of(2,7,8).contains(step)) { var ids = new JsonArray(); ids.add(id); r.add("ids",ids); }
        if (Set.of(3,6,11).contains(step)) r.addProperty("id",id);
        if (step == 3) { r.addProperty("name","Title vault probe updated"); var tags=new JsonArray();tags.add("menu-probe");r.add("tags",tags); }
        if (step == 9) r.addProperty("token",token);
        if (step == 0) {
            var entry = new JsonObject(); entry.addProperty("id",id); entry.addProperty("name","Title vault probe"); entry.add("tags",new JsonArray()); entry.addProperty("note","");
            entry.addProperty("created",0); entry.addProperty("updated",0); entry.addProperty("mcDataVersion",net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version()); entry.addProperty("modVersion","probe"); entry.add("stack",stack());
            var entries=new JsonArray();entries.add(entry);r.add("entries",entries);r.addProperty("version",1);
        }
        if (step == 10) r.add("stack",stack());
        return r;
    }
    private JsonObject stack() {
        var stack = new JsonObject(); stack.addProperty("id",net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(net.minecraft.world.item.Items.PAPER).toString());
        stack.addProperty("count",1); stack.add("comps",new JsonObject()); stack.add("removed",new JsonObject()); return stack;
    }
    private JsonElement eval(String js) { return JsonParser.parseString(page.driver().document().scripts().evaluateToJson(js,"vault-menu-probe")); }
    private void check(boolean ok,String key) { if(!ok)throw new AssertionError(key);receipt.addProperty(key,true); }
    private void finish(Minecraft mc) { try { Files.writeString(mc.gameDirectory.toPath().resolve("vault-menu-verification.json"),receipt.toString()); }catch(Exception e){throw new RuntimeException(e);} done=true; }
}
