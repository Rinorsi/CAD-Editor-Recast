package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.*;
import dev.rinorsi.editor.StackCodec;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.CustomData;

/** Opt-in isolated hidden client. Never installed in the normal user's game. */
public final class VaultProbe implements ClientModInitializer {
  private OrielScreen screen;
  private Object proceeded;
  private boolean sent, finished;
  private int step;
  private final long started = System.nanoTime();
  private final JsonObject receipt = new JsonObject();
  private final JsonObject captures = new JsonObject();
  private final List<String> created = new ArrayList<>();
  private ItemStack expected;
  private JsonObject wire;
  private String firstId, deleteToken, uploadToken, uploadText;
  private JsonObject lastRequest;
  private static final List<String> OPS =
      List.of(
          "save",
          "list",
          "get",
          "update",
          "tags",
          "stats",
          "duplicate",
          "export",
          "delete",
          "restore",
          "import",
          "upload",
          "upload",
          "save",
          "get",
          "give",
          "list",
          "stats",
          "delete");

  public void onInitializeClient() {
    ClientTickEvents.END_CLIENT_TICK.register(this::tick);
  }

  private void tick(Minecraft mc) {
    try {
      if (finished) {
        if (mc.level != null) mc.disconnectWithSavingScreen();
        else if (mc.getSingleplayerServer() == null) mc.stop();
        return;
      }
      if (System.nanoTime() - started > 240_000_000_000L)
        throw new AssertionError("timeout step " + step);
      if (mc.level == null || mc.player == null) {
        if (mc.screen != null
            && mc.screen != proceeded
            && (mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen
                || mc.screen
                    instanceof
                    net.minecraft.client.gui.screens.worldselection
                        .ConfirmExperimentalFeaturesScreen))
          for (var child : mc.screen.children())
            if (child instanceof net.minecraft.client.gui.components.Button b) {
              String label = b.getMessage().getString();
              if (label.equals(
                      net.minecraft.network.chat.Component.translatable(
                              "selectWorld.backupJoinSkipButton")
                          .getString())
                  || label.equals(
                      net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())) {
                proceeded = mc.screen;
                b.onPress(null);
                break;
              }
            }
        return;
      }
      if (screen == null) {
        if (mc.screen != null) return;
        expected = new ItemStack(Items.PAPER);
        var tag = new net.minecraft.nbt.CompoundTag();
        tag.putLong("precise", 9007199254740993L);
        tag.putFloat("fraction", 0.8f);
        tag.putByteArray("bytes", new byte[] {1, -2});
        tag.putIntArray("ints", new int[] {3, 4});
        tag.putLongArray("longs", new long[] {Long.MAX_VALUE});
        expected.set(DataComponents.CUSTOM_DATA, CustomData.of(tag));
        expected.set(
            DataComponents.CUSTOM_NAME, net.minecraft.network.chat.Component.literal("实机保险库探针"));
        wire = StackCodec.snapshot(expected, mc.level.registryAccess(), new JsonObject(), "");
        uploadText = wire.toString();
        screen =
            OrielScreens.openInline(
                "<html><body><script>var"
                    + " results={},events=[];oriel.on('patch',function(p){if(p.key==='vault.result'){results[p.value.requestId]=p.value;events.push(p.value);}});</script></body></html>",
                new JsonObject());
        RegistryBridge.attach(screen.driver());
        return;
      }
      if (screen.driver().document() == null || !screen.driver().settled()) return;
      String id = "vault-live-" + step;
      if (!sent) {
        lastRequest = request(step, id);
        if (step == 16) {
          JsonObject stale = lastRequest.deepCopy();
          stale.addProperty("requestId", "stale-list");
          eval("oriel.send('vault'," + stale + ");true");
        }
        eval("oriel.send('vault'," + lastRequest + ");true");
        sent = true;
        return;
      }
      JsonElement value = eval("results[" + new JsonPrimitive(id) + "]||null");
      if (value.isJsonNull()) return;
      JsonObject result = value.getAsJsonObject();
      if (result.has("error") && result.get("error").getAsString().equals("NOT_READY")) {
        eval("delete results[" + new JsonPrimitive(id) + "];true");
        sent = false;
        return;
      }
      JsonObject pair = new JsonObject();
      pair.add("request", lastRequest);
      pair.add("response", result);
      captures.add(id, pair);
      check(result.toString().length() <= 24000, "response_bound_" + step);
      if (step == 15) {
        if (mc.player.isCreative())
          check(
              result.get("ok").getAsBoolean() && !result.get("confirmed").getAsBoolean(),
              "creative_give_sent_only");
        else check(result.get("error").getAsString().equals("NOT_ALLOWED"), "survival_give_denied");
      } else check(result.get("ok").getAsBoolean(), "ok_" + step);
      if (step == 0) {
        firstId = result.getAsJsonObject("entry").get("id").getAsString();
        created.add(firstId);
      }
      if (step == 2 || step == 14) {
        JsonObject stack =
            result.getAsJsonArray("entries").get(0).getAsJsonObject().getAsJsonObject("stack");
        check(
            ItemStack.matches(expected, StackCodec.decode(stack, mc.level.registryAccess())),
            "real_js_typed_round_trip_" + step);
      }
      if (step == 6 || step == 13)
        created.add(result.getAsJsonObject("entry").get("id").getAsString());
      if (step == 8) deleteToken = result.get("token").getAsString();
      if (step == 11) uploadToken = result.get("token").getAsString();
      if (step == 16)
        check(
            eval("!events.some(function(r){return r.requestId==='stale-list';})").getAsBoolean(),
            "latest_list_wins");
      if (step == 17) {
        if (!result.get("persisted").getAsBoolean()) {
          eval("delete results[" + new JsonPrimitive(id) + "];true");
          sent = false;
          return;
        }
        check(true, "background_atomic_write_completed");
      }
      if (++step == OPS.size()) {
        check(screen.driver().pageErrorCount() == 0, "zero_page_errors");
        receipt.add("messages", captures);
        receipt.addProperty("status", "PASSED");
        receipt.addProperty("creative", mc.player.isCreative());
        write(mc);
        finished = true;
        return;
      }
      sent = false;
    } catch (Throwable failure) {
      failure.printStackTrace();
      receipt.add("messages", captures);
      receipt.addProperty("status", "FAILED");
      receipt.addProperty("error", failure.toString());
      write(mc);
      finished = true;
    }
  }

  private JsonObject request(int step, String id) {
    JsonObject r = new JsonObject();
    r.addProperty("op", OPS.get(step));
    r.addProperty("requestId", id);
    switch (step) {
      case 0 -> {
        r.add("stack", wire);
        r.addProperty("name", "实机保存");
      }
      case 1, 16 -> {
        r.addProperty("query", "shiji");
        r.addProperty("view", "vault");
      }
      case 2, 14 -> {
        JsonArray ids = new JsonArray();
        ids.add(step == 2 ? firstId : created.get(created.size() - 1));
        r.add("ids", ids);
      }
      case 3 -> {
        r.addProperty("id", firstId);
        r.addProperty("name", "实机收藏");
        JsonArray tags = new JsonArray();
        tags.add("武器");
        r.add("tags", tags);
      }
      case 6, 15 -> r.addProperty("id", firstId);
      case 7 -> r.addProperty("all", true);
      case 8 -> {
        JsonArray ids = new JsonArray();
        ids.add(firstId);
        r.add("ids", ids);
      }
      case 9 -> r.addProperty("token", deleteToken);
      case 10 -> {
        JsonObject e = new JsonObject();
        String newId = UUID.randomUUID().toString();
        created.add(newId);
        e.addProperty("id", newId);
        e.addProperty("name", "实机导入");
        e.add("tags", new JsonArray());
        e.addProperty("note", "");
        e.addProperty("created", System.currentTimeMillis());
        e.addProperty("updated", System.currentTimeMillis());
        e.addProperty(
            "mcDataVersion",
            net.minecraft.SharedConstants.getCurrentVersion().dataVersion().version());
        e.addProperty("modVersion", "probe");
        e.add("stack", wire);
        JsonArray a = new JsonArray();
        a.add(e);
        r.add("entries", a);
      }
      case 11 -> r.addProperty("text", uploadText.substring(0, uploadText.length() / 2));
      case 12 -> {
        r.addProperty("token", uploadToken);
        r.addProperty("text", uploadText.substring(uploadText.length() / 2));
      }
      case 13 -> {
        r.addProperty("uploadToken", uploadToken);
        r.addProperty("force", true);
      }
      case 18 -> {
        JsonArray ids = new JsonArray();
        created.forEach(ids::add);
        r.add("ids", ids);
      }
    }
    return r;
  }

  private JsonElement eval(String js) throws Exception {
    Object page =
        ((Optional<?>)
                Class.forName("dev.oriel.mod.client.OrielAutomation")
                    .getMethod("screen")
                    .invoke(null))
            .orElseThrow();
    return (JsonElement)
        ((Optional<?>) page.getClass().getMethod("eval", String.class).invoke(page, js))
            .orElseThrow();
  }

  private void check(boolean ok, String key) {
    if (!ok) throw new AssertionError(key);
    receipt.addProperty(key, true);
  }

  private void write(Minecraft mc) {
    try {
      Files.writeString(
          mc.gameDirectory.toPath().resolve("vault-verification.json"), receipt.toString());
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }
}
