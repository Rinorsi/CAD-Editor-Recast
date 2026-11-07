package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.oriel.mod.client.*;
import java.nio.file.*;
import java.util.*;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;

/** Both unnegotiated and negotiated documents in one hidden real world, without system input. */
public final class LazyCatalogProbe implements ClientModInitializer {
    private static final String SCRIPT="<html><body><script>var catalogs={},done={},keys={},results={},feature=null,meta=null;oriel.on('patch',function(p){keys[p.key]=(keys[p.key]||0)+1;if(p.key==='registry.client_features')feature=p.value;else if(p.key==='registry.meta')meta=p.value;else if(p.key==='search.result'){if(p.value.ready||p.value.error)results[p.value.requestId]=p.value;}else if(p.key.indexOf('registry.')===0&&p.value.entries){var k=p.key.substring(9),a=catalogs[k]||(catalogs[k]=[]);for(var i=0;i<p.value.entries.length;i++)a.push(p.value.entries[i]);if(p.value.done)done[k]=true;}});</script></body></html>";
    private final String[] kinds={"items","blocks","sounds","tags:item","item_model"};
    private OrielScreen screen;private Object proceeded;private int phase,kind,operation;private boolean sent,finished;private long start=System.nanoTime(),readyAt;
    private final JsonObject receipt=new JsonObject();private JsonObject legacy;
    public void onInitializeClient(){ClientTickEvents.END_CLIENT_TICK.register(this::tick);}
    private void tick(Minecraft mc){try{
        if(finished){if(mc.level!=null)mc.disconnectWithSavingScreen();else if(mc.getSingleplayerServer()==null)mc.stop();return;}
        if(System.nanoTime()-start>240_000_000_000L)throw new AssertionError("timeout phase="+phase+" kind="+kind+" operation="+operation);
        if(mc.level==null||mc.player==null){if(mc.screen!=null&&mc.screen!=proceeded&&(mc.screen instanceof net.minecraft.client.gui.screens.BackupConfirmScreen||mc.screen instanceof net.minecraft.client.gui.screens.worldselection.ConfirmExperimentalFeaturesScreen))for(var child:mc.screen.children())if(child instanceof net.minecraft.client.gui.components.Button b){String l=b.getMessage().getString();if(l.equals(net.minecraft.network.chat.Component.translatable("selectWorld.backupJoinSkipButton").getString())||l.equals(net.minecraft.network.chat.CommonComponents.GUI_PROCEED.getString())){proceeded=mc.screen;b.onPress(null);break;}}return;}
        if(screen==null){if(mc.screen!=null)return;open();return;}
        if(screen.driver().document()==null||!screen.driver().settled())return;
        if(phase==0){eval("oriel.send('registry',{name:'tags:item'});oriel.send('registry',{name:'item_model'});true");phase=1;return;}
        if(phase==1){if(!eval("!!meta&&done.items&&done.blocks&&done.sounds&&done['tags:item']&&done.item_model&&done.enchantments").getAsBoolean())return;
            check(screen.driver().pageErrorCount()==0,"legacy_page_errors_zero");legacy=eval("catalogs").getAsJsonObject();check(!legacy.getAsJsonArray("items").isEmpty(),"legacy_items");check(!eval("!!feature||!!meta.lazy").getAsBoolean(),"legacy_no_negotiation_fields");
            JsonObject sizes=new JsonObject();for(String k:kinds)sizes.addProperty(k,legacy.getAsJsonArray(k).size());receipt.add("legacy_counts",sizes);receipt.add("legacy_keys",eval("keys"));
            // Verify real row sets as well as exact ordering/values after re-encoding from the compact index.
            RegistrySnapshot snapshot=new RegistrySnapshot(mc.level.registryAccess(),id->{var e=mc.getSoundManager().getSoundEvent(id);return e==null?null:e.getSubtitle();});
            for(String k:new String[]{"items","blocks","sounds"}){var expected=RegistryIndex.build("minecraft:"+RegistrySnapshot.KINDS.get(k),"probe",new ArrayList<>(snapshot.entries(net.minecraft.resources.Identifier.withDefaultNamespace(RegistrySnapshot.KINDS.get(k))).asList().stream().map(JsonElement::getAsJsonObject).toList()));
                JsonArray actual=legacy.getAsJsonArray(k);check(expected.size==actual.size(),"legacy_count_parity_"+k);for(var row:actual){JsonObject source=expected.find(row.getAsJsonObject().get("id").getAsString());checkRow(row.getAsJsonObject(),source,"legacy_shape_"+k);}}
            open();phase=2;return;
        }
        if(phase==2){eval("oriel.send('registry',{name:'client_features',features:['lazy-catalog-v1']});true");phase=3;return;}
        if(phase==3){if(!eval("!!feature&&!!meta&&!!meta.lazy&&done.enchantments").getAsBoolean())return;
            check(eval("feature.accepted[0]==='lazy-catalog-v1'").getAsBoolean(),"feature_accepted");receipt.add("client_features",eval("feature"));receipt.add("meta",eval("meta"));readyAt=System.nanoTime();phase=4;return;}
        if(phase==4){
            if(!sent){String k=kinds[kind],id="q"+kind+"_"+operation;JsonObject query=new JsonObject();query.addProperty("requestId",id);query.addProperty("kind",k);query.addProperty("view",operation==0?"picker-"+kind:"lookup");query.addProperty("limit",12);if(operation==0){JsonObject filters=new JsonObject();JsonArray namespaces=new JsonArray();namespaces.add("minecraft");filters.add("namespaces",namespaces);query.add("filters",filters);}
                if(operation==1){JsonArray ids=new JsonArray();JsonArray old=legacy.getAsJsonArray(k);ids.add(old.get(old.size()-1).getAsJsonObject().get("id").getAsString());ids.add("missing:unknown");ids.add(old.get(0).getAsJsonObject().get("id").getAsString());query.add("ids",ids);}
                eval("oriel.send('search',"+query+");true");sent=true;return;
            }
            String id="q"+kind+"_"+operation;JsonElement value=eval("results["+new JsonPrimitive(id)+"]||null");if(value.isJsonNull())return;JsonObject result=value.getAsJsonObject();check(!result.has("error")&&result.get("ready").getAsBoolean(),"search_ready_"+id);check(result.toString().length()<=24000,"response_bound_"+id);
            JsonArray rows=result.getAsJsonArray("entries"),old=legacy.getAsJsonArray(kinds[kind]);
            for(var row:rows){JsonObject wire=row.getAsJsonObject().deepCopy();wire.remove("namespace");JsonObject expected=null;for(var prior:old)if(prior.getAsJsonObject().get("id").equals(wire.get("id"))){expected=prior.getAsJsonObject();break;}checkRow(wire,expected,"search_row_parity_"+kinds[kind]);}
            if(operation==1){check(rows.size()==2&&result.getAsJsonArray("missing").get(0).getAsString().equals("missing:unknown")&&rows.get(0).getAsJsonObject().get("id").equals(old.get(old.size()-1).getAsJsonObject().get("id")),"lookup_order_missing_"+kind);}
            else {check(!rows.isEmpty()&&result.has("namespaces"),"search_namespace_"+kind);if(kind==4)check(result.getAsJsonArray("namespaces").size()>1,"namespaces_not_reduced_by_filter");}
            receipt.add(id,result);sent=false;if(++operation==2){operation=0;kind++;}if(kind==kinds.length)phase=5;return;
        }
        if(phase==5){if(System.nanoTime()-readyAt<2_000_000_000L)return;
            check(eval("!keys['registry.items']&&!keys['registry.blocks']&&!keys['registry.sounds']&&!keys['registry.tags:item']&&!keys['registry.item_model']").getAsBoolean(),"lazy_no_catalog_pushes");
            check(eval("meta.lazy.items.count==="+legacy.getAsJsonArray("items").size()+"&&meta.lazy.blocks.count>0&&meta.lazy.sounds.count>0&&meta.lazy['tags:item'].count>0&&meta.lazy.item_model.count>0").getAsBoolean(),"lazy_counts_actual");
            receipt.add("lazy_keys",eval("keys"));receipt.add("final_meta",eval("meta"));check(screen.driver().pageErrorCount()==0,"page_errors_zero");
            check(legacyCacheSize()==0,"lazy_no_retained_catalog_cache");
            eval("var too=[];for(var n=0;n<65;n++)too.push('minecraft:diamond_sword');oriel.send('search',{requestId:'too-many',view:'lookup',kind:'items',ids:too});true");phase=7;return;
        }
        if(phase==7){JsonElement response=eval("results['too-many']||null");if(response.isJsonNull())return;check(response.getAsJsonObject().get("error").getAsString().equals("BAD_REQUEST"),"lookup_65_bad_request");eval("oriel.send('registry',{name:'items'});true");phase=6;return;}
        if(phase==6){if(!eval("!!done.items").getAsBoolean())return;check(eval("catalogs.items.length").getAsInt()==legacy.getAsJsonArray("items").size(),"explicit_escape_hatch");check(legacyCacheSize()==0,"explicit_escape_not_cached");receipt.addProperty("status","PASSED");write(mc);finished=true;}
    }catch(Throwable error){error.printStackTrace();receipt.addProperty("status","FAILED");receipt.addProperty("error",error.toString());write(mc);finished=true;}}
    private int legacyCacheSize()throws Exception{var documents=RegistryBridge.class.getDeclaredField("DOCUMENTS");documents.setAccessible(true);Object state=((Map<?,?>)documents.get(null)).get(screen.driver());var cache=state.getClass().getDeclaredField("legacyCatalogs");cache.setAccessible(true);return ((Map<?,?>)cache.get(state)).size();}
    private void checkRow(JsonObject actual,JsonObject expected,String name){if(expected==null||!actual.keySet().equals(expected.keySet())||!actual.equals(expected))throw new AssertionError(name+" actual="+actual+" expected="+expected);receipt.addProperty(name,true);}
    private void open(){screen=OrielScreens.openInline(SCRIPT,new JsonObject());RegistryBridge.attach(screen.driver());}
    private JsonElement eval(String js)throws Exception{Object page=((Optional<?>)Class.forName("dev.oriel.mod.client.OrielAutomation").getMethod("screen").invoke(null)).orElseThrow();return (JsonElement)((Optional<?>)page.getClass().getMethod("eval",String.class).invoke(page,js)).orElseThrow();}
    private void check(boolean ok,String name){if(!ok)throw new AssertionError(name);receipt.addProperty(name,true);}
    private void write(Minecraft mc){try{Files.writeString(mc.gameDirectory.toPath().resolve("lazy-verification.json"),receipt.toString());}catch(Exception e){throw new RuntimeException(e);}}
}
