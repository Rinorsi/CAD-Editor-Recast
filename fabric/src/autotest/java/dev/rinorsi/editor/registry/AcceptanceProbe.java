package dev.rinorsi.editor.registry;

import com.google.gson.*;
import com.mojang.serialization.*;
import dev.oriel.mod.client.OrielScreen;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.client.EditorClient;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.world.item.*;
import net.minecraft.world.level.GameType;

/** Real packaged page -> EditorClient -> server apply/confirm -> fresh open. Probe jar only. */
public final class AcceptanceProbe implements ClientModInitializer {
    public static EditorClient editor;
    private final JsonObject receipt = new JsonObject();
    private final JsonArray rows = new JsonArray(), searches = new JsonArray();
    private final AcceptanceWorldProbe world = new AcceptanceWorldProbe();
    private List<String> ids;
    private int index, round, phase, search;
    private long start = System.nanoTime(), deadline, pageStart, searchStart;
    private boolean finished;
    private Object proceeded;
    private JsonObject row, wire;
    private ItemStack expected, baseline;
    private CompletableFuture<?> setup;
    private CompletableFuture<ItemStack> saved;
    private OrielScreen screen;
    private String request;
    private static final Gson JSON = new GsonBuilder().setPrettyPrinting().create();
    public void onInitializeClient() { ClientTickEvents.END_CLIENT_TICK.register(this::tick); }
    private void tick(Minecraft mc) {
        try {
            if (finished) { if(mc.level!=null)mc.disconnectWithSavingScreen();else if(mc.getSingleplayerServer()==null)mc.stop();return; }
            if(System.nanoTime()-start>1_500_000_000_000L)throw new IllegalStateException("global timeout phase="+phase);
            if(mc.level==null||mc.player==null) {
                if(mc.screen!=null&&mc.screen!=proceeded)for(var child:mc.screen.children())if(child instanceof net.minecraft.client.gui.components.Button b) {
                    String label=b.getMessage().getString();
                    if(label.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())||label.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())){proceeded=mc.screen;b.onPress(null);break;}
                }return;
            }
            if(ids==null) {
                if(mc.screen!=null)return;
                int focus=org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_FOCUSED);
                receipt.addProperty("native_window_focused",focus);
                receipt.addProperty("native_window_visible",org.lwjgl.glfw.GLFW.glfwGetWindowAttrib(mc.getWindow().handle(),org.lwjgl.glfw.GLFW.GLFW_VISIBLE));
                if(focus!=0)throw new IllegalStateException("probe window unexpectedly focused");
                ids=BuiltInRegistries.DATA_COMPONENT_TYPE.entrySet().stream().filter(e->e.getValue().codec()!=null).map(e->e.getKey().identifier().toString()).sorted().toList();
                receipt.addProperty("registry_components",ids.size());receipt.addProperty("rounds",3);
                String only=System.getProperty("editor.accept.only","");if(!only.isEmpty()){var subset=Set.of(only.split(","));ids=ids.stream().filter(subset::contains).toList();receipt.addProperty("subset",only);}
                CreativeModeTabs.tryRebuildTabContents(mc.level.enabledFeatures(),true,mc.level.registryAccess());
                if(Boolean.getBoolean("editor.accept.worldOnly"))index=ids.size();
                receipt.addProperty("scope","packaged page transport; typed server inventory; fresh host reopen; not GUI control interaction or gameplay semantics");
            }
            if(index>=ids.size()){if(world.tick(mc)){receipt.add("world",world.rows);finish(mc,"COMPLETE");}else{receipt.add("world",world.rows);write(mc);}return; }
            if(phase==0) {
                row=new JsonObject();row.addProperty("component",ids.get(index));row.addProperty("round",round+1);rows.add(row);
                try { sample(mc,ids.get(index)); } catch(RuntimeException e){row.addProperty("sample_source","unresolved");row.addProperty("failure",e.toString());advance(mc);return;}
                setup=mc.getSingleplayerServer().submit(()->{var p=mc.getSingleplayerServer().getPlayerList().getPlayer(mc.player.getUUID());p.setGameMode(GameType.CREATIVE);p.getInventory().setItem(0,baseline.copy());p.inventoryMenu.broadcastChanges();});
                phase=1;deadline=System.nanoTime()+15_000_000_000L;return;
            }
            if(System.nanoTime()>deadline){row.addProperty("timeout",true);row.addProperty("failure","timeout phase="+phase);row.add("timeout_state",openState(mc));advance(mc);return;}
            if(phase==1){if(!setup.isDone()||!mc.player.isCreative())return;setup.join();mc.player.getInventory().setSelectedSlot(0);mc.player.getInventory().setItem(0,baseline.copy());pageStart=System.nanoTime();invoke(editor,"open");phase=2;return;}
            if(phase==2||phase==7){
                if(!(mc.screen instanceof OrielScreen s)||s.driver().document()==null||!s.driver().settled())return;screen=s;
                eval("var acceptPatches={};oriel.on('patch',function(p){acceptPatches[p.key]=p.value;});true");
                if(phase==7){
                    JsonObject reopen=eval("oriel.data.stack").getAsJsonObject();
                    ItemStack actual=StackCodec.decode(reopen,mc.level.registryAccess());
                    row.addProperty("reopen_equal",ItemStack.matches(expected,actual));
                    row.addProperty("typed_fidelity",typed(expected,mc).equals(typed(actual,mc))&&typed(expected,mc).equals(typed(saved.join(),mc)));
                    row.addProperty("reopened_snbt",typed(actual,mc).toString());advance(mc);return;
                }
                row.addProperty("page_interactive_ms",(System.nanoTime()-pageStart)/1e6);
                request="accept-"+index+"-"+round;
                // Use the authoritative tokenized slot from this freshly opened host session.
                wire.add("slot",eval("oriel.data.stack.slot"));wire.addProperty("requestId",request);
                JsonObject v=new JsonObject();v.addProperty("component",ids.get(index));v.addProperty("requestId",request);v.addProperty("snbt",row.get("component_snbt").getAsString());
                eval("oriel.send('validate_component',"+v+");oriel.send('component_validate',"+v+");true");phase=3;return;
            }
            if(phase==3){
                JsonElement a=eval("acceptPatches['validate_component.result']||null"),b=eval("acceptPatches['component_validate.result']||null");if(a.isJsonNull()||b.isJsonNull())return;
                row.add("validate_component",a);row.add("component_validate",b);row.addProperty("validate_ok",a.getAsJsonObject().get("ok").getAsBoolean()&&b.getAsJsonObject().get("ok").getAsBoolean());
                if(index==0&&round==0){phase=20;deadline=System.nanoTime()+120_000_000_000L;return;}
                apply();return;
            }
            if(phase==20){
                if(search>=64){receipt.add("search_registry_sizes",new Gson().toJsonTree(SearchChannel.counts()));apply();return;}
                String rid="perf-"+search;
                if(searchStart==0){JsonObject q=new JsonObject();q.addProperty("requestId",rid);q.addProperty("kind",search<32?"items":"blocks");q.addProperty("view","acceptance-perf");q.addProperty("query",search%4==0?"":search%4==1?"stone":search%4==2?"木":"minecraft:");q.addProperty("limit",20);searchStart=System.nanoTime();eval("oriel.send('search',"+q+");true");return;}
                var r=eval("acceptPatches['search.result']||null");if(r.isJsonNull())return;var o=r.getAsJsonObject();if(!o.get("requestId").getAsString().equals(rid))return;
                if(o.has("error"))throw new IllegalStateException("perf search: "+o);if(!o.has("ready")||!o.get("ready").getAsBoolean())return;
                JsonObject measurement=new JsonObject();measurement.addProperty("kind",search<32?"items":"blocks");measurement.addProperty("cold",search==0||search==32);measurement.addProperty("ms",(System.nanoTime()-searchStart)/1e6);measurement.addProperty("matched",o.get("total").getAsInt());searches.add(measurement);searchStart=0;search++;return;
            }
            if(phase==4){var r=eval("acceptPatches.result||null");if(r.isJsonNull())return;var result=r.getAsJsonObject();if(!result.get("requestId").getAsString().equals(request))return;row.add("host_result",result);
                boolean ok=result.get("status").getAsString().equals("saved");row.addProperty("applied_ok",ok);if(!ok){row.addProperty("rejected",true);row.addProperty("failure",result.toString());advance(mc);return;}
                saved=mc.getSingleplayerServer().submit(()->mc.getSingleplayerServer().getPlayerList().getPlayer(mc.player.getUUID()).getInventory().getItem(0).copy());phase=5;return;
            }
            if(phase==5){if(!saved.isDone())return;row.addProperty("server_equal",typed(expected,mc).equals(typed(saved.join(),mc)));row.addProperty("server_snbt",typed(saved.join(),mc).toString());mc.setScreen(null);phase=6;return;}
            if(phase==6){invoke(editor,"open");phase=7;return;}
        }catch(Throwable e){e.printStackTrace();receipt.addProperty("fatal",e.toString());finish(mc,"FAILED");}
    }
    private void advance(Minecraft mc){mc.setScreen(null);phase=0;if(++round==3){round=0;index++;}write(mc);}
    private void apply()throws Exception{eval("oriel.send('apply',"+wire+");true");row.addProperty("attempted",true);phase=4;deadline=System.nanoTime()+15_000_000_000L;}
    @SuppressWarnings({"rawtypes","unchecked"})
    private void sample(Minecraft mc,String id){
        var access=mc.level.registryAccess();DataComponentType type=ComponentValidation.type(id);Codec codec=type.codec();
        ComponentSchema.Derived schema=ComponentSchema.derive(id,access);JsonElement value=null;Item item=null;Object decoded=null;
        for(var h:BuiltInRegistries.ITEM.listElements().sorted(Comparator.comparing(h->h.key().identifier().toString())).toList()){Object p=h.value().components().get(type);if(p!=null){item=h.value();decoded=p;row.addProperty("sample_source","prototype:"+h.key().identifier());break;}}
        if(decoded==null)outer:for(var tab:CreativeModeTabs.allTabs())for(var stack:tab.getDisplayItems()){Object p=stack.get(type);if(p!=null){baseline=stack.copy();baseline.setCount(1);item=stack.getItem();decoded=p;row.addProperty("sample_source","live_creative_tab:"+tab.getDisplayName().getString());break outer;}}
        if(decoded==null){for(var b:BuiltInRegistries.BLOCK)if(b instanceof net.minecraft.world.level.block.EntityBlock factory){var be=factory.newBlockEntity(net.minecraft.core.BlockPos.ZERO,b.defaultBlockState());if(be==null)continue;Tag tag=be.saveWithFullMetadata(access);var parsed=codec.parse(access.createSerializationContext(NbtOps.INSTANCE),tag).result();if(parsed.isPresent()){decoded=parsed.get();item=b.asItem();if(item==Items.AIR)item=Items.PAPER;row.addProperty("sample_source","live_block_entity_factory:"+BuiltInRegistries.BLOCK.getKey(b));break;}}}
        if(decoded==null){value=derive(schema.root(),access,0);if(value!=null){decoded=codec.parse(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow();row.addProperty("sample_source","runtime_schema_codec_probe");}}
        if(decoded==null)throw new IllegalStateException("no Codec-accepted sample; schema coverage="+schema.entry().get("coverage"));
        if(decoded instanceof net.minecraft.world.item.component.CustomData){
            var boundary=AcceptanceCodecTest.boundaries();
            var result=codec.parse(access.createSerializationContext(NbtOps.INSTANCE),boundary).result();
            if(result.isPresent()){decoded=result.get();row.addProperty("sample_source","runtime_codec_numeric_and_array_boundary_probe");}
        }
        if(item==null)item=Items.PAPER;baseline=new ItemStack(item);expected=baseline.copy();expected.set(type,decoded);
        ItemStack.validateStrict(expected).getOrThrow();
        wire=StackCodec.snapshot(expected,access,new JsonObject(),"");
        String key=id.startsWith("minecraft:")?id.substring(10):id;Tag tag=(Tag)codec.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),decoded).getOrThrow();
        // Explicit SNBT survives JS IEEE754 projection, including a value equal to a prototype default.
        wire.getAsJsonObject("comps").addProperty(key,tag.toString());JsonObject formats=new JsonObject();formats.addProperty(key,"snbt");wire.add("component_formats",formats);wire.remove("component_snbt");
        row.addProperty("item",BuiltInRegistries.ITEM.getKey(item).toString());row.addProperty("component_snbt",tag.toString());row.addProperty("sent_snbt",typed(expected,mc).toString());
    }
    private JsonElement derive(ComponentSchema.Node n,net.minecraft.core.RegistryAccess access,int depth){
        if(depth>12)return null;List<JsonElement> probes=new ArrayList<>();
        if(n.json.has("default"))probes.add(n.json.get("default"));
        if(n.json.has("values"))n.json.getAsJsonArray("values").forEach(probes::add);
        if(n.json.has("registry")){String reg=n.json.get("registry").getAsString();access.listRegistries().filter(r->r.key().identifier().toString().equals(reg)).forEach(r->r.listElements().limit(32).forEach(h->probes.add(new JsonPrimitive(h.key().identifier().toString()))));}
        if(!n.fields.isEmpty()){JsonObject obj=new JsonObject();boolean complete=true;for(var e:n.fields.entrySet()){if(e.getValue().json.has("optional")&&e.getValue().json.get("optional").getAsBoolean())continue;var v=derive(e.getValue(),access,depth+1);if(v==null){complete=false;break;}obj.add(e.getKey(),v);}if(complete)probes.add(obj);}
        for(var alt:n.alternatives){var v=derive(alt,access,depth+1);if(v!=null)probes.add(v);}
        if(n.element!=null&&n.key==null){var v=derive(n.element,access,depth+1);if(v!=null){var a=new JsonArray();int min=n.json.has("min_size")?Math.min(64,n.json.get("min_size").getAsInt()):1;for(int i=0;i<Math.max(1,min);i++)a.add(v);probes.add(a);}}
        if(n.json.has("min"))probes.add(n.json.get("min"));
        probes.addAll(List.of(new JsonObject(),new JsonArray(),new JsonPrimitive(0),new JsonPrimitive(1),new JsonPrimitive(-1),new JsonPrimitive(false),new JsonPrimitive(true),new JsonPrimitive("")));
        for(var v:probes)try{if(n.codec.parse(access.createSerializationContext(JsonOps.INSTANCE),v).isSuccess())return v;}catch(RuntimeException ignored){}return null;
    }
    private static Tag typed(ItemStack s,Minecraft mc){return ItemStack.CODEC.encodeStart(mc.level.registryAccess().createSerializationContext(NbtOps.INSTANCE),s).getOrThrow();}
    // Diagnostics only: retain the original timeout and all success assertions.
    private static JsonObject openState(Minecraft mc)throws Exception{
        var state=new JsonObject();
        state.addProperty("screen",mc.screen==null?"none":mc.screen.getClass().getName());
        state.addProperty("world_editor_active",dev.rinorsi.editor.client.WorldEditorClient.active());
        state.addProperty("selected_slot",mc.player.getInventory().getSelectedSlot());
        state.addProperty("held_stack",mc.player.getMainHandItem().isEmpty()?"empty":typed(mc.player.getMainHandItem(),mc).toString());
        for(String name:List.of("screen","opening","openingFrom","pending")){
            var field=EditorClient.class.getDeclaredField(name);field.setAccessible(true);var value=field.get(editor);
            state.addProperty("editor_"+name,value==null?"none":value instanceof String text?text:value.getClass().getName());
        }
        return state;
    }
    private static Object invoke(Object owner,String method)throws Exception{var m=owner.getClass().getDeclaredMethod(method);m.setAccessible(true);return m.invoke(owner);}
    private JsonElement eval(String js)throws Exception{Object page=((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,js)).orElseThrow();}
    private void finish(Minecraft mc,String status){receipt.addProperty("status",status);receipt.add("searches",searches);write(mc);finished=true;}
    private void write(Minecraft mc){try{receipt.add("attempts",rows);Files.writeString(mc.gameDirectory.toPath().resolve("acceptance.json"),JSON.toJson(receipt));}catch(Exception e){throw new RuntimeException(e);}}
}


