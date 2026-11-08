package dev.rinorsi.editor.vault;

import com.google.gson.*;
import dev.rinorsi.editor.*;

import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.permissions.*;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.*;

/** Real registries, block entity factories, typed item codecs and isolated files. No game window. */
public final class VaultTemplateTest {
    private static int checks;
    private static void check(boolean value,String text) {if(!value)throw new AssertionError(text);checks++;System.out.println("PASS "+text);}
    private static void reject(String code,Runnable fn){try{fn.run();throw new AssertionError("expected "+code);}catch(VaultStore.Failure e){check(e.code.equals(code),"rejected "+code);}catch(EditorSessions.Failure e){check(e.code.equals(code),"rejected "+code);}}
    private static JsonObject request(String op){var r=new JsonObject();r.addProperty("op",op);r.addProperty("requestId",UUID.randomUUID().toString());return r;}
    private static JsonObject get(VaultStore s,String id,VaultStore.Validator v){var r=request("get");var ids=new JsonArray();ids.add(id);r.add("ids",ids);return s.execute(r,v).getAsJsonArray("entries").get(0).getAsJsonObject();}
    private static JsonObject spec(JsonObject entry){var s=new JsonObject();s.add("kind",entry.get("kind"));s.add("template",entry.get("template"));return s;}
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        var lookup=net.minecraft.data.registries.VanillaRegistries.createWorldLookup();BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());var access=net.minecraft.core.RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);VaultStore.Validator validator=s->VaultStacks.validate(s,access);
        var dir=Files.createTempDirectory("cad-vault-templates-");var file=dir.resolve("vault.json");
        var state=Blocks.CHEST.defaultBlockState();var block=((EntityBlock)Blocks.CHEST).newBlockEntity(new BlockPos(3,70,5),state);
        var typed=PermissionTest.typed();((net.minecraft.world.Container)block).setItem(0,typed);
        var nbt=block.saveWithFullMetadata(access);var world=new JsonObject();world.addProperty("kind","block");world.addProperty("block",BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());world.add("block_state",BlockStateEdit.values(state));world.addProperty("snbt",nbt.toString());world.addProperty("revision","test-revision");world.add("slot",JsonParser.parseString("{kind:'block',x:3,y:70,z:5,dim:'minecraft:overworld',token:'test'}"));
        String blockId,playerId;JsonObject blockTemplate,playerTemplate;
        var wire=StackCodec.snapshot(typed,access,new JsonObject(),"");
        var player=new JsonObject();var container=new JsonObject();var slots=new JsonArray();
        for(int i=0;i<Inventory.INVENTORY_SIZE+Inventory.EQUIPMENT_SLOT_MAPPING.size();i++){var row=new JsonObject();row.addProperty("slot",i);row.add("stack",i==0||Inventory.EQUIPMENT_SLOT_MAPPING.containsKey(i)?wire.deepCopy():JsonParser.parseString("{empty:true}"));slots.add(row);}
        container.add("slots",slots);player.add("container",container);var ender=new JsonObject();var enderSlots=new JsonArray();var enderRow=new JsonObject();enderRow.addProperty("slot",0);enderRow.add("stack",wire.deepCopy());enderSlots.add(enderRow);ender.add("slots",enderSlots);player.add("ender",ender);
        player.add("attributes",new JsonArray());player.add("active_effects",new JsonArray());player.addProperty("playerGameType",net.minecraft.world.level.GameType.SURVIVAL.getName());
        var playerWorld=new JsonObject();playerWorld.addProperty("kind","entity");playerWorld.addProperty("revision","player-revision");playerWorld.add("slot",JsonParser.parseString("{kind:'entity',player:'self',dim:'minecraft:overworld',token:'test'}"));playerWorld.add("player",JsonParser.parseString("{name:'Probe'}"));var views=new JsonObject();views.add("player",player);playerWorld.add("views",views);
        try(var store=new VaultStore(file,1,"test",null,System::currentTimeMillis)){
            var save=request("save");save.addProperty("kind","block");save.addProperty("name","Chest");save.add("world",world);var saved=store.execute(save,validator);blockId=saved.getAsJsonObject("entry").get("id").getAsString();
            blockTemplate=get(store,blockId,validator).getAsJsonObject("template");var portable=WorldNbt.parse(blockTemplate.get("snbt").getAsString());check(!portable.contains("x")&&!portable.contains("y")&&!portable.contains("z"),"block position excluded");
            check(!saved.getAsJsonObject("entry").has("template"),"list/save row stays light");
            var again=store.execute(save,validator);check(again.getAsJsonObject("entry").get("name").getAsString().equals("Chest (2)")&&!again.get("duplicate").getAsBoolean(),"same name/content gets a new numbered entry");
            var dup=request("duplicate");dup.addProperty("id",blockId);check(store.execute(dup,validator).getAsJsonObject("entry").get("name").getAsString().equals("Chest (3)"),"duplicate names numbered");
            var p=request("save");p.addProperty("kind","player_preset");p.add("world",playerWorld);var sections=new JsonArray();new TreeSet<>(VaultTemplates.SECTIONS).forEach(sections::add);p.add("sections",sections);playerId=store.execute(p,validator).getAsJsonObject("entry").get("id").getAsString();playerTemplate=get(store,playerId,validator).getAsJsonObject("template");
            check(playerTemplate.getAsJsonObject("sections").getAsJsonObject("equipment").getAsJsonArray("slots").size()==Inventory.EQUIPMENT_SLOT_MAPPING.size(),"equipment from live vanilla mapping");
            check(!playerTemplate.toString().contains("player-revision")&&!playerTemplate.has("UUID"),"player identity/session omitted");
            check(store.flushNow(),"templates persisted");
        }
        try(var store=new VaultStore(file,1,"test",null,System::currentTimeMillis)){
            var entry=get(store,blockId,validator);check(entry.get("template").equals(blockTemplate),"block reopen exact");
            var preview=request("preview");preview.addProperty("id",blockId);preview.add("world",world);var result=store.execute(preview,validator);check(result.getAsJsonObject("summary").getAsJsonArray("overwrites").size()==2,"overwrite summary returned before apply");
            var patch=VaultTemplates.expand(result.getAsJsonObject("apply").getAsJsonObject("vault_template"),world);var next=WorldNbt.parse(patch.get("snbt").getAsString());check(nbt.equals(next),"typed block SNBT roundtrip");var copy=WorldTarget.copyBlock(block,next,access);check(copy.saveWithFullMetadata(access).equals(nbt),"native block entity load/save exact");check(BlockStateEdit.prepare(state,patch.getAsJsonObject("block_state")).equals(state),"native block state roundtrip");
            var wrong=world.deepCopy();wrong.addProperty("block",BuiltInRegistries.BLOCK.getKey(Blocks.TRAPPED_CHEST).toString());reject("block_type_mismatch",()->VaultTemplates.expand(spec(entry),wrong));
            reject("wrong_kind",()->store.stack(blockId));
            var p=get(store,playerId,validator);check(p.get("template").toString().equals(playerTemplate.toString()),"player preset reopen exact");var pp=VaultTemplates.expand(spec(p),playerWorld).getAsJsonObject("entity").getAsJsonObject("player");check(pp.getAsJsonObject("container").getAsJsonArray("slots").size()==slots.size(),"selected inventory + equipment combined");
            for(var raw:pp.getAsJsonObject("container").getAsJsonArray("slots")){var row=raw.getAsJsonObject();if(!row.getAsJsonObject("stack").has("empty"))check(ItemStack.matches(typed,StackCodec.decode(row.getAsJsonObject("stack"),access)),"typed player slot native codec roundtrip");}
            var only=spec(p);only.add("sections",JsonParser.parseString("['effects']"));var partial=VaultTemplates.expand(only,playerWorld).getAsJsonObject("entity").getAsJsonObject("player");check(partial.size()==1&&partial.has("active_effects"),"unselected player fields untouched");
            only.add("sections",JsonParser.parseString("['teleport']"));reject("BAD_REQUEST",()->VaultTemplates.expand(only,playerWorld));
            var bad=spec(p);bad.getAsJsonObject("template").getAsJsonObject("sections").addProperty("UUID","bad");reject("BAD_REQUEST",()->VaultTemplates.expand(bad,playerWorld));
            var stats=store.execute(request("stats"),validator);check(stats.get("blocks").getAsInt()==3&&stats.get("playerPresets").getAsInt()==1&&stats.get("items").getAsInt()==0,"category stats exact");
            var list=request("list");list.addProperty("kind","all");list.addProperty("sort","item");check(store.execute(list,validator).get("total").getAsInt()==4,"mixed list/search/sort");
        }
        backupChecks(dir,playerWorld,playerTemplate,validator);
        templateUpdateChecks(dir,playerTemplate,validator);
        try(var store=new VaultStore(dir.resolve("warm.json"),1,"test",null,System::currentTimeMillis)) {
            for(int i=0;i<12;i++){var save=request("save");save.addProperty("kind","block");save.add("world",world);store.execute(save,validator);}
            store.invalidateRows();check(!store.warm(validator,8),"first tick respects prewarm budget");check(store.warm(validator,8),"next tick completes template prewarm");
        }
        reject("player_forbidden",()->PlayerWorldEdit.requirePermission(PermissionSet.NO_PERMISSIONS));reject("player_forbidden",()->PlayerWorldEdit.requirePermission(LevelBasedPermissionSet.MODERATOR));PlayerWorldEdit.requirePermission(LevelBasedPermissionSet.GAMEMASTER);check(!new EditorPolicy(4,false).allows(false,false),"world policy rejects unprivileged survival");
        // Existing v1 item bytes still decode to the same stack after v3 storage is introduced.
        var oldFile=dir.resolve("old.json");var legacy=new JsonObject();legacy.addProperty("id",UUID.randomUUID().toString());legacy.addProperty("name","legacy");legacy.add("tags",new JsonArray());legacy.addProperty("note","");legacy.addProperty("created",0);legacy.addProperty("updated",0);legacy.addProperty("mcDataVersion",1);legacy.addProperty("modVersion","old");legacy.add("stack",wire);var root=new JsonObject();root.addProperty("version",1);var entries=new JsonArray();entries.add(legacy);root.add("entries",entries);Files.writeString(oldFile,root.toString());
        try(var store=new VaultStore(oldFile,1,"test",null,System::currentTimeMillis)){check(ItemStack.matches(typed,StackCodec.decode(store.stack(legacy.get("id").getAsString()),access)),"v1 no-kind item remains exact");}
        System.out.println("VaultTemplateTest: "+checks+" checks passed; fixtures="+dir);
    }
    private static void templateUpdateChecks(Path dir,JsonObject template,VaultStore.Validator validator)throws Exception {
        try(var store=new VaultStore(dir.resolve("template-updates.json"),1,"test",null,System::currentTimeMillis)){
            var save=request("save");save.addProperty("kind","player_preset");save.addProperty("name","UpdateFixture");save.addProperty("note","keep note");save.add("tags",JsonParser.parseString("['tag']"));save.add("template",template);
            String id=store.execute(save,validator).getAsJsonObject("entry").get("id").getAsString();var before=store.playerPreset(id);
            var edit=request("update");edit.addProperty("id",id);edit.add("template",template.deepCopy());edit.getAsJsonObject("template").getAsJsonObject("sections").addProperty("game_mode","creative");
            reject("target_changed",()->store.execute(edit,validator));edit.add("expectedTemplateRevision",before.get("templateRevision"));var result=store.execute(edit,validator);
            var after=store.playerPreset(id);check(after.getAsJsonObject("template").getAsJsonObject("sections").get("game_mode").getAsString().equals("creative"),"template update modifies same entry");
            check(after.get("name").equals(before.get("name"))&&after.get("tags").equals(before.get("tags"))&&after.get("note").equals(before.get("note")),"template update preserves name tags note");check(result.get("templateRevision").equals(after.get("templateRevision")),"template update returns current content revision");reject("target_changed",()->store.execute(edit,validator));
            edit.add("expectedTemplateRevision",after.get("templateRevision"));edit.getAsJsonObject("template").getAsJsonObject("sections").addProperty("game_mode","missing");reject("BAD_REQUEST",()->store.execute(edit,validator));check(store.playerPreset(id).equals(after),"invalid template changes no entry");
            var oversized=JsonParser.parseString("{sections:{attributes:[{id:'minecraft:max_health',base:20,modifiers:[]}]}}").getAsJsonObject();var modifier=JsonParser.parseString("{id:'probe:big',amount:0,operation:'add_value'}").getAsJsonObject();modifier.addProperty("id","probe:"+"a".repeat(70000));oversized.getAsJsonObject("sections").getAsJsonArray("attributes").get(0).getAsJsonObject().getAsJsonArray("modifiers").add(modifier);edit.add("template",oversized);
            reject("ENTRY_TOO_LARGE",()->store.execute(edit,validator));check(store.playerPreset(id).equals(after),"overquota template keeps original entry intact");
            check(store.flushNow(),"updated template flush");
        }
    }
    private static void backupChecks(Path dir,JsonObject world,JsonObject template,VaultStore.Validator validator)throws Exception {
        var evidence=new JsonArray();int[] validations={0};VaultStore.Validator counted=s->{validations[0]++;return validator.validate(s);};
        try(var store=new VaultStore(dir.resolve("backups.json"),1,"test",null,System::currentTimeMillis)) {
            var r=request("has_backup");r.addProperty("kind","player_preset");r.add("world",world);
            check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"empty vault backup misses");
            var save=request("save");save.addProperty("kind","player_preset");save.add("template",template);var saved=store.execute(save,validator);String id=saved.getAsJsonObject("entry").get("id").getAsString();long revision=saved.get("revision").getAsLong();
            var hit=backup(store,r,counted,evidence);check(hit.get("backed_up").getAsBoolean()&&hit.get("id").getAsString().equals(id)&&hit.has("name"),"world capture backup hit with id and name");
            check(hit.get("revision").getAsLong()==revision,"has_backup does not change revision");
            int before=validations[0];backup(store,r,counted,evidence);int cachedCost=validations[0]-before;
            int inputStacks=0;for(var raw:template.getAsJsonObject("sections").entrySet())if(raw.getValue().isJsonObject()&&raw.getValue().getAsJsonObject().has("slots"))for(var row:raw.getValue().getAsJsonObject().getAsJsonArray("slots"))if(!row.getAsJsonObject().getAsJsonObject("stack").has("empty"))inputStacks++;
            check(cachedCost==inputStacks,"repeat backup normalizes input once and reuses saved hashes");
            r.remove("world");r.add("template",template.deepCopy());r.add("sections",JsonParser.parseString("['inventory']"));check(backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"subset inventory matches a superset entry");
            var altered=template.deepCopy();altered.getAsJsonObject("sections").addProperty("game_mode","creative");r.add("template",altered);check(backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"unselected changed section does not affect match");
            r.remove("sections");check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"selected changed section misses");
            r.add("template",template.deepCopy());r.add("sections",JsonParser.parseString("['inventory']"));var slots=r.getAsJsonObject("template").getAsJsonObject("sections").getAsJsonObject("inventory").getAsJsonArray("slots");var reversed=new JsonArray();for(int i=slots.size()-1;i>=0;i--)reversed.add(slots.get(i));r.getAsJsonObject("template").getAsJsonObject("sections").getAsJsonObject("inventory").add("slots",reversed);
            check(backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"slot array order is normalized");
            var full=template.deepCopy();var row=full.getAsJsonObject("sections").getAsJsonObject("inventory").getAsJsonArray("slots").get(0).getAsJsonObject();row.getAsJsonObject("stack").addProperty("count",2);r.add("template",full);reject("INVALID_STACK",()->store.execute(r,counted));row.getAsJsonObject("stack").addProperty("id","minecraft:stone");check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"changed valid item misses");
            full=template.deepCopy();row=full.getAsJsonObject("sections").getAsJsonObject("inventory").getAsJsonArray("slots").get(0).getAsJsonObject();var sidecar=row.getAsJsonObject("stack").getAsJsonObject("component_snbt");String custom=sidecar.get("custom_data").getAsString();sidecar.addProperty("custom_data",custom.replace("9007199254740993L","9007199254740992L"));r.add("template",full);check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"exact typed long change misses despite same browser numeric projection");
            r.add("template",template);r.add("sections",JsonParser.parseString("['effects','effects']"));reject("BAD_REQUEST",()->store.execute(r,counted));r.add("sections",JsonParser.parseString("[]"));reject("BAD_REQUEST",()->store.execute(r,counted));
            r.add("sections",JsonParser.parseString("['inventory']"));r.addProperty("kind","block");reject("wrong_kind",()->store.execute(r,counted));r.addProperty("kind","player_preset");
            VaultStore.Validator unavailable=s->{throw new VaultStore.Failure("UNAVAILABLE","没有世界");};reject("UNAVAILABLE",()->store.execute(r,unavailable));
            var delete=request("delete");delete.add("ids",JsonParser.parseString("['"+id+"']"));store.execute(delete,validator);check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"deleted entry cannot hit a stale hash cache");
            save.add("template",JsonParser.parseString("{sections:{effects:[]}}"));store.execute(save,validator);r.add("template",template);r.add("sections",JsonParser.parseString("['effects']"));check(backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"partial saved entry matches its selected section");r.remove("sections");check(!backup(store,r,counted,evidence).get("backed_up").getAsBoolean(),"partial saved entry cannot cover missing sections");
        }
        Files.writeString(dir.resolve("backup-evidence.json"),evidence.toString());
        System.out.println("Backup evidence: "+dir.resolve("backup-evidence.json"));
    }
    private static JsonObject backup(VaultStore store,JsonObject request,VaultStore.Validator validator,JsonArray evidence){var response=store.execute(request,validator);var row=new JsonObject();row.add("request",request.deepCopy());row.add("response",response.deepCopy());evidence.add(row);return response;}
}
