package dev.rinorsi.editor.client;

import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

public final class EditorToastTest {
    private static int checks;
    private static void check(boolean value, String name) {
        if (!value) throw new AssertionError(name);
        checks++;
    }
    private static final class Hud implements EditorToast.Hud {
        String fail = ""; boolean shown; int scale = -1;
        final List<String> calls = new ArrayList<>();
        final List<JsonObject> data = new ArrayList<>();
        private void call(String name) { calls.add(name); if (fail.equals(name)) throw new IllegalStateException(name+" unavailable"); }
        public void register() { call("register"); }
        public boolean isShown() { call("isShown"); return shown; }
        public void show() { call("show"); shown = true; }
        public void scale(int value) { call("scale"); scale = value; }
        public void push(JsonObject value) { call("push"); data.add(value.deepCopy()); }
    }
    public static void main(String[] args) {
        var hud = new Hud(); var chat = new ArrayList<Component>(); var warnings = new ArrayList<Throwable>();
        var delivery = new EditorToast.Delivery(hud,chat::add,warnings::add,()->2);
        delivery.initialize(); delivery.initialize();
        delivery.show(EditorToast.Level.OK, "保存完成");
        check(hud.calls.equals(List.of("register","isShown","show","scale","push")), "register once then show before push");
        check(chat.isEmpty() && warnings.isEmpty(), "normal HUD never sends chat or warning");
        JsonObject first = hud.data.getFirst();
        check(first.get("text").getAsString().equals("保存完成") && first.get("level").getAsString().equals("ok"), "page text and level");
        check(first.get("title").getAsString().equals("物品工坊") && first.get("seq").getAsLong()==1, "page title and initial sequence");
        delivery.show(EditorToast.Level.WARN, "没有目标");
        check(hud.calls.equals(List.of("register","isShown","show","scale","push","isShown","scale","push")), "visible HUD pushes without showing again");
        check(hud.data.getLast().get("seq").getAsLong()==2 && hud.data.getLast().get("level").getAsString().equals("warn"), "replacement increments sequence");
        hud.shown=false; delivery.show(EditorToast.Level.INFO, "重新打开");
        check(hud.calls.get(hud.calls.size()-3).equals("show"), "auto-hidden HUD shows again");

        check(hud.scale==2,"toast applies editor preference before push");
        for(int value=0;value<=4;value++){
            var scaled=new Hud();int[] preference={value};
            var live=new EditorToast.Delivery(scaled,chat::add,warnings::add,()->preference[0]);
            live.show(EditorToast.Level.ERROR,"缩放错误提示");
            check(scaled.scale==value,"show uses current preference "+value);
            var message=scaled.data.getLast().deepCopy();int pushes=scaled.data.size();
            preference[0]=(value+1)%5;live.refreshScale();
            check(scaled.scale==preference[0],"visible toast refresh uses new preference");
            check(scaled.data.size()==pushes&&scaled.data.getLast().equals(message),"resize does not resend text or reset sequence/timer");
            scaled.shown=false;int calls=scaled.calls.size();live.refreshScale();
            check(scaled.calls.size()==calls+1&&!scaled.shown,"hidden toast is not reopened by preference change");
            live.show(EditorToast.Level.OK,"下一条提示");check(scaled.scale==preference[0],"new HUD inherits changed preference");
        }
        for (String stage : List.of("register","isShown","show","scale","push")) {
            var broken=new Hud(); broken.fail=stage; chat.clear(); warnings.clear();
            var failing=new EditorToast.Delivery(broken,chat::add,warnings::add,()->2);
            failing.initialize(); failing.show(EditorToast.Level.ERROR, "距离太远");
            check(chat.size()==1 && warnings.size()==1, stage+" exception emits one fallback and warning");
            check(chat.getFirst().getString().equals("[物品工坊] 距离太远"), stage+" fallback preserves text and prefix");
            check(warnings.getFirst().getMessage().contains(stage), stage+" fallback logs cause");
        }
        for (EditorToast.Level level : EditorToast.Level.values()) {
            var broken=new Hud(); broken.fail="push"; chat.clear(); warnings.clear();
            new EditorToast.Delivery(broken,chat::add,warnings::add,()->2).show(level,"权限提示");
            var parts=chat.getFirst().getSiblings();
            check(parts.getFirst().getStyle().isBold() && parts.getFirst().getStyle().getColor().equals(net.minecraft.network.chat.TextColor.fromLegacyFormat(ChatFormatting.AQUA)), level+" prefix bold aqua");
            ChatFormatting expected=switch(level) {case INFO->ChatFormatting.WHITE;case OK->ChatFormatting.GREEN;case WARN->ChatFormatting.YELLOW;case ERROR->ChatFormatting.RED;};
            check(parts.get(1).getStyle().getColor().equals(net.minecraft.network.chat.TextColor.fromLegacyFormat(expected)), level+" body severity color");
            check(!parts.get(1).getStyle().isBold(), level+" body does not inherit prefix bold");
        }
        chat.clear();warnings.clear();
        var unavailable=new EditorToast.Delivery(new EditorToast.Hud() {
            public void register(){throw new NoClassDefFoundError("OrielHud");}
            public boolean isShown(){throw new AssertionError();}
            public void show(){throw new AssertionError();}
            public void scale(int value){throw new AssertionError();}
            public void push(JsonObject data){throw new AssertionError();}
        },chat::add,warnings::add,()->2);
        unavailable.show(EditorToast.Level.INFO,"HUD缺失");
        check(chat.size()==1 && warnings.getFirst() instanceof LinkageError, "missing Oriel class also falls back");
        System.out.println("PASS EditorToastTest "+checks+" checks; injected HUD/chat, no client or OS access");
    }
}
