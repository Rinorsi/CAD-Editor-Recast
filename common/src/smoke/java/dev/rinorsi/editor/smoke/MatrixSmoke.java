package dev.rinorsi.editor.smoke;

import com.google.gson.*;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.client.EditorClient;
import net.minecraft.client.Minecraft;
import net.minecraft.world.item.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.GameType;
import java.util.*;
import java.util.concurrent.*;
import java.nio.file.*;

/** Separate test mod: packaged page -> host apply -> server inventory -> fresh reopen. */
public final class MatrixSmoke {
    public static EditorClient editor;
    private static int phase;
    private static long started = System.nanoTime(), deadline = started + 240_000_000_000L;
    private static boolean finished;
    private static Object proceeded;
    private static CompletableFuture<?> setup;
    private static CompletableFuture<ItemStack> saved;
    private static ItemStack expected;
    private static final JsonObject receipt = new JsonObject();
    private static void open(Minecraft mc) throws Exception {
        mc.hitResult = null;
        var method=EditorClient.class.getDeclaredMethod("open");method.setAccessible(true);method.invoke(editor);
    }
    public static void tick(Minecraft mc) {
        if (finished) { if(mc.level!=null)mc.disconnectWithSavingScreen(); else if(mc.getSingleplayerServer()==null)mc.stop(); return; }
        try {
            if(System.nanoTime()>deadline)throw new IllegalStateException("smoke timeout phase="+phase);
            if(mc.level==null || mc.player==null) {
                if(mc.gui.screen()!=null && proceeded!=mc.gui.screen())for(var child:mc.gui.screen().children())if(child instanceof net.minecraft.client.gui.components.Button button) {
                    String label=button.getMessage().getString();
                    if(label.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString()) || label.equals(Component.translatable("selectWorld.backupJoinSkipButton").getString())) { proceeded=mc.gui.screen();button.onPress(null);break; }
                }
                return;
            }
            if(phase==0) {
                if(mc.gui.screen()!=null || editor==null)return;
                //? if <26.3 {
                /*if(org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_FOCUSED)!=0 || org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_VISIBLE)!=0)throw new IllegalStateException("window must be hidden and unfocused");
                *///?} else {
                long flags=org.lwjgl.sdl.SDLVideo.SDL_GetWindowFlags(mc.getWindow().handle());
                if((flags&org.lwjgl.sdl.SDLVideo.SDL_WINDOW_HIDDEN)==0 || (flags&org.lwjgl.sdl.SDLVideo.SDL_WINDOW_INPUT_FOCUS)!=0)throw new IllegalStateException("SDL window must be hidden and unfocused");
                //?}
                receipt.addProperty("hidden_unfocused",true);
                expected=new ItemStack(Items.DIAMOND_SWORD);expected.set(DataComponents.CUSTOM_NAME,Component.literal("Matrix smoke saved"));expected.set(DataComponents.DAMAGE,7);
                setup=mc.getSingleplayerServer().submit(()->{var p=mc.getSingleplayerServer().getPlayerList().getPlayer(mc.player.getUUID());p.setGameMode(GameType.CREATIVE);p.getInventory().setItem(0,new ItemStack(Items.DIAMOND_SWORD));p.inventoryMenu.broadcastChanges();});
                phase=1;deadline=System.nanoTime()+90_000_000_000L;return;
            }
            if(phase==1) {
                if(!setup.isDone()||!mc.player.isCreative())return;setup.join();mc.player.getInventory().setSelectedSlot(0);mc.player.getInventory().setItem(0,new ItemStack(Items.DIAMOND_SWORD));open(mc);phase=2;return;
            }
            if(phase==2 || phase==6) {
                if(!(mc.gui.screen() instanceof OrielScreen screen)||screen.driver().document()==null||!screen.driver().settled())return;
                if(phase==6) {
                    var reopened=StackCodec.decode(eval("oriel.data.stack").getAsJsonObject(),mc.level.registryAccess());
                    if(!ItemStack.matches(expected,reopened))throw new IllegalStateException("fresh reopen mismatch");
                    receipt.addProperty("reopen_equal",true);finish(mc,null);return;
                }
                receipt.addProperty("editor_opened",true);
                var wire=StackCodec.snapshot(expected,mc.level.registryAccess(),eval("oriel.data.stack.slot").getAsJsonObject(),"");wire.addProperty("requestId","matrix-smoke");
                eval("var matrixResult=null;oriel.on('patch',function(p){if(p.key==='result')matrixResult=p.value;});oriel.send('apply',"+wire+");true");phase=3;return;
            }
            if(phase==3) {
                var result=eval("matrixResult");if(result.isJsonNull())return;
                if(!result.getAsJsonObject().get("status").getAsString().equals("saved"))throw new IllegalStateException("save rejected: "+result);
                receipt.add("save_receipt",result);
                saved=mc.getSingleplayerServer().submit(()->mc.getSingleplayerServer().getPlayerList().getPlayer(mc.player.getUUID()).getInventory().getItem(0).copy());phase=4;return;
            }
            if(phase==4) {
                if(!saved.isDone())return;
                if(!ItemStack.matches(expected,saved.join()))throw new IllegalStateException("server inventory mismatch");
                receipt.addProperty("server_equal",true);mc.gui.setScreen(null);phase=5;return;
            }
            if(phase==5){open(mc);phase=6;}
        } catch(Throwable error){error.printStackTrace();finish(mc,error);}
    }
    private static JsonElement eval(String script)throws Exception {
        Object page=((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();
        return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,script)).orElseThrow();
    }
    private static void finish(Minecraft mc,Throwable error) {
        receipt.addProperty("status",error==null?"PASSED":"FAILED");receipt.addProperty("minecraft",net.minecraft.SharedConstants.getCurrentVersion().name());receipt.addProperty("phase",phase);
        if(error!=null)receipt.addProperty("error",error.toString());
        try{Files.writeString(mc.gameDirectory.toPath().resolve("matrix-smoke.json"),new GsonBuilder().setPrettyPrinting().create().toJson(receipt));}catch(Exception e){throw new RuntimeException(e);}
        finished=true;
    }
}
