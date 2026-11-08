package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.testing.GenericModFixtures;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;

/** End-to-end detached persistence, using registered mod content; no graphics or external inputs. */
public final class GenericSchemaTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        GenericModFixtures.register();var access=EntitySchemaTest.access();var level=new EntitySchemaTestLevel(access);
        var receipts=new JsonObject();
        check(GenericSchema.ids("entity").contains(GenericModFixtures.ENTITY_ID),"registered entity enumerated");
        check(GenericSchema.ids("block_entity").contains(GenericModFixtures.ID),"registered BE enumerated");
        for(String kind:List.of("entity","block_entity")){
            String id=kind.equals("entity")?GenericModFixtures.ENTITY_ID:GenericModFixtures.ID;
            var schema=GenericSchema.template(kind,id,level);receipts.add(kind,schema);
            check(schema.get("available").getAsBoolean(),"factory template available: "+schema);
            check(!schema.get("specialized").getAsBoolean(),"unknown mod gets fallback");
            var fields=schema.getAsJsonObject("fields");
            check(fields.getAsJsonObject("energy").get("type").getAsString().equals("integer"),"integer inferred");
            check(fields.getAsJsonObject("ratio").get("type").getAsString().equals("number"),"float inferred");
            check(fields.getAsJsonObject("serial").get("default_snbt").getAsString().equals("9007199254740993L"),"long precision");
            check(fields.getAsJsonObject("enabled").get("editable").getAsString().equals("snbt_only"),"bool ambiguity explicit");
            check(fields.getAsJsonObject("reference").get("type").getAsString().equals("identifier"),"registry hits infer ID");
            check(fields.getAsJsonObject("reference").getAsJsonArray("registry_matches").size()==2,"ambiguous block/BE ID keeps both candidates");
            check(fields.getAsJsonObject("opaque").get("editable").getAsString().equals("snbt_only"),"unknown compound preserved");
            check(RegistryPages.split("generic_schema","test",array(schema),new JsonObject()).getFirst().toString().length()<=24000,"schema page budget");
        }
        var block=GenericModFixtures.BLOCK_ENTITY.create(BlockPos.ZERO,GenericModFixtures.BLOCK.defaultBlockState());
        var before=block.saveWithFullMetadata(access);var requested=changes();var edit=new JsonObject();edit.add("generic",requested);
        var next=BlockViews.apply(block,before,edit,access);
        var reopened=WorldTarget.copyBlock(block,next,access).saveWithFullMetadata(access);
        check(reopened.equals(next),"BE apply save reopen exact NBT");check(!before.equals(next),"BE change applied");
        check(before.get("opaque").equals(reopened.get("opaque")),"BE opaque numeric types retained");
        var view=new JsonObject();BlockViews.add(view,block,access,reopened);check(view.getAsJsonObject("generic").getAsJsonObject("value").get("energy").getAsString().equals("37"),"BE reopen schema current value");
        var entity=GenericModFixtures.ENTITY.create(level,EntitySpawnReason.LOAD);
        var entityBefore=WorldTarget.saveEntity(entity,access);
        var entityNext=EntityWorldEdit.prepare(entity,entityBefore,edit,level,access);
        var entityReopened=GenericModFixtures.ENTITY.create(level,EntitySpawnReason.LOAD);EntityWorldEdit.load(entityReopened,entityNext,access);
        check(WorldTarget.saveEntity(entityReopened,access).equals(entityNext),"entity apply save reopen exact NBT");
        check(entityBefore.get("opaque").equals(entityNext.get("opaque")),"entity unknown content retained");
        check(EntityWorldEdit.views(entityReopened,entityNext,access).getAsJsonObject("generic").getAsJsonObject("value").get("serial").getAsString().equals("9223372036854775806L"),"entity reopen exact large long");
        for(String invalid:List.of("{energy:'37b'}","{enabled:'0b'}","{id:'\"generic_probe:other\"'}","{new_key:'3'}","{energy:'37,extra:4'}","{energy:'37,value:38'}","{energy:37}")){
            var bad=JsonParser.parseString(invalid).getAsJsonObject();var invalidEdit=new JsonObject();invalidEdit.add("generic",bad);
            reject(()->BlockViews.apply(block,before,invalidEdit,access));
            reject(()->EntityWorldEdit.prepare(entity,entityBefore,invalidEdit,level,access));
        }
        var unknown=before.copy();unknown.putLong("ignored_by_mod",Long.MAX_VALUE);reject(()->BlockViews.apply(block,unknown,edit,access));
        var unknownEntity=entityBefore.copy();unknownEntity.putLong("ignored_by_mod",Long.MAX_VALUE);reject(()->EntityWorldEdit.prepare(entity,unknownEntity,edit,level,access));
        check(block.saveWithFullMetadata(access).equals(before),"rejects and detached edits leave source untouched");
        // Data-page SNBT remains a typed route for ambiguous fields.
        var raw=WorldNbt.parse(before.toString());raw.putBoolean("enabled",false);raw.getCompound("opaque").orElseThrow().putLong("added",Long.MAX_VALUE);
        check(WorldTarget.copyBlock(block,raw,access).saveWithFullMetadata(access).equals(raw),"SNBT opaque edit round trip");
        shapeChecks(access);componentChecks(access,receipts);
        pipelineChecks(access);
        var chest=net.minecraft.world.level.block.entity.BlockEntityTypes.CHEST.create(BlockPos.ZERO,Blocks.CHEST.defaultBlockState());
        check(BlockViews.hasSpecialized(chest),"specialized container first");reject(()->BlockViews.apply(chest,chest.saveWithFullMetadata(access),edit,access));
        var armor=net.minecraft.world.entity.EntityTypes.ARMOR_STAND.create(level,EntitySpawnReason.LOAD);
        check(GenericSchema.specialized(armor,WorldTarget.saveEntity(armor,access),access),"specialized entity first");
        reject(()->EntityWorldEdit.prepare(armor,WorldTarget.saveEntity(armor,access),edit,level,access));
        check(!GenericSchema.template("entity","minecraft:player",level).get("available").getAsBoolean(),"unavailable factory explicit");
        var catalog=new JsonObject();
        for(String kind:List.of("entity","block_entity")){
            var rows=new JsonArray();var unavailableTypes=new JsonArray();int unavailable=0,specialized=0;
            for(String id:GenericSchema.ids(kind)){
                var row=GenericSchema.template(kind,id,level);rows.add(row);
                if(!row.get("available").getAsBoolean()){unavailable++;unavailableTypes.add(row);}
                if(row.get("specialized").getAsBoolean())specialized++;
            }
            var pages=RegistryPages.split("generic_schema","test",rows,new JsonObject());
            check(pages.stream().allMatch(p->p.toString().length()<=24000),"whole registry bounded pages "+kind);
            check(pages.stream().mapToInt(p->p.getAsJsonArray("entries").size()).sum()==rows.size(),"whole registry no missing entries "+kind);
            var summary=new JsonObject();summary.addProperty("total",rows.size());summary.addProperty("unavailable",unavailable);summary.add("unavailable_types",unavailableTypes);summary.addProperty("specialized",specialized);catalog.add(kind,summary);
        }
        receipts.add("catalog",catalog);
        receipts.addProperty("checks",checks);receipts.addProperty("status","PASS");receipts.addProperty("scope","registered fixtures; detached actual Minecraft loaders; no live client/server");
        Path output=Path.of(args.length==0?"logs/generic-schema/evidence.json":args[0]);Files.createDirectories(output.toAbsolutePath().getParent());Files.writeString(output,new GsonBuilder().setPrettyPrinting().create().toJson(receipts));
        System.out.println("PASS GenericSchemaTest "+checks+" checks; registered mod BE/entity/component read edit save reopen; "+output);
    }
    private static JsonArray array(JsonObject object){var a=new JsonArray();a.add(object);return a;}
    private static void pipelineChecks(RegistryAccess access) throws Exception {
        var level=new EntitySchemaTestLevel(access) {
            @Override public BlockState getBlockState(BlockPos pos){return GenericModFixtures.BLOCK.defaultBlockState();}
        };
        var block=GenericModFixtures.BLOCK_ENTITY.create(BlockPos.ZERO,GenericModFixtures.BLOCK.defaultBlockState());
        var blockTarget=WorldTarget.forBlock(level,block);
        var entity=GenericModFixtures.ENTITY.create(level,EntitySpawnReason.LOAD);
        var ctor=WorldTarget.class.getDeclaredConstructor(net.minecraft.world.level.Level.class,net.minecraft.world.level.block.entity.BlockEntity.class,net.minecraft.world.entity.Entity.class);
        ctor.setAccessible(true);var entityTarget=ctor.newInstance(level,null,entity);
        for(var target:List.of(blockTarget,entityTarget)){
            boolean isBlock=target==blockTarget;var data=isBlock?block.data:entity.data;
            var baseline=target.sessionData();var before=target.save();
            var opened=target.snapshot(new JsonObject(),false,baseline);
            check(opened.getAsJsonObject("views").has("generic"),"normal opened snapshot generic view");
            check(WorldWire.decode(JsonParser.parseString(WorldWire.encode(opened)).getAsJsonObject()).equals(opened),"opened schema wire round trip");
            var request=new JsonObject();var sections=new JsonObject();sections.add("generic",changes());request.add(isBlock?"views":"entity",sections);
            data.opaque.putLong("concurrent_unknown",Long.MAX_VALUE); // A mod changed another field since opening.
            var plan=WorldMergePlan.prepare(target,baseline,null,request);
            check(plan.nbt().getInt("energy").orElseThrow()==37,"normal apply merge routes generic writes");
            check(plan.nbt().getCompound("opaque").orElseThrow().getLong("concurrent_unknown").orElseThrow()==Long.MAX_VALUE,"merge keeps concurrent unknown types");
            check(data.energy==12,"preparation does not mutate live target");
            var preview=target.preview(plan.nbt(),new JsonObject(),true);
            check(preview.getAsJsonObject("views").getAsJsonObject("generic").getAsJsonObject("value").get("energy").getAsString().equals("37"),"saved preview/reopen reads requested value");
            data.energy=99;reject(()->WorldMergePlan.prepare(target,baseline,null,request));
            check(data.energy==99,"conflict leaves current state intact");data.energy=12;
            var raw=target.save();raw.putInt("energy",44);raw.getCompound("opaque").orElseThrow().putLong("data_page",Long.MAX_VALUE);
            var rawRequest=new JsonObject();rawRequest.addProperty("snbt",raw.toString());
            var rawPlan=WorldMergePlan.prepare(target,target.sessionData(),null,rawRequest);
            check(rawPlan.nbt().equals(raw),"data page actual merge/save retains all typed fields");
        }
        var liveRequest=new JsonObject();var liveSections=new JsonObject();liveSections.add("generic",changes());liveRequest.add("entity",liveSections);
        check(GenericSchema.hasEdits(liveRequest)&&!GenericSchema.hasEdits(new JsonObject()),"post-write retention is scoped to generic requests");
        var liveBefore=entityTarget.save();var livePlan=WorldMergePlan.prepare(entityTarget,entityTarget.sessionData(),null,liveRequest);
        var expected=livePlan.nbt().copy();entity.distortLiveLoad=true;
        reject(()->DoubleChestEdit.write(entityTarget,livePlan,false,()->GenericSchema.requireRetained(expected,entityTarget.save())));
        check(entityTarget.save().equals(liveBefore),"actual write dropping unknown fields rejects and rolls back exact preimage");
        entity.distortLiveLoad=false;
        DoubleChestEdit.write(entityTarget,livePlan,false,()->GenericSchema.requireRetained(expected,entityTarget.save()));
        check(entityTarget.save().equals(expected),"actual target write and reread retain requested typed NBT");
    }
    private static JsonObject changes(){var out=new JsonObject();out.addProperty("energy","37");out.addProperty("serial","9223372036854775806L");out.addProperty("ratio","2.5f");out.addProperty("label","\"edited\"");out.addProperty("small","6s");out.addProperty("mode","5b");out.addProperty("scale","3.5d");out.addProperty("reference","\"generic_probe:agent\"");return out;}
    private static void shapeChecks(RegistryAccess access){
        var sample=new CompoundTag();var ops=access.createSerializationContext(NbtOps.INSTANCE);
        sample.put("item",ItemStack.CODEC.encodeStart(ops,new ItemStack(Items.STONE)).getOrThrow());
        sample.put("state",BlockState.CODEC.encodeStart(ops,Blocks.OAK_LOG.defaultBlockState().setValue(net.minecraft.world.level.block.RotatedPillarBlock.AXIS,Direction.Axis.X)).getOrThrow());
        var fake=sample.getCompound("item").orElseThrow().copy();fake.putLong("unknown",Long.MAX_VALUE);sample.put("fake",fake);
        sample.putString("item_id","missing_probe:not_registered");sample.putString("unrelated_name",GenericModFixtures.ENTITY_ID);
        sample.put("list",new ListTag());sample.putByteArray("bytes",new byte[]{1,2});
        var fields=GenericSchema.describe("block_entity",GenericModFixtures.ID,sample,access,false).getAsJsonObject("fields");
        check(fields.getAsJsonObject("item").get("type").getAsString().equals("stack"),"exact item codec classification");
        check(fields.getAsJsonObject("state").get("type").getAsString().equals("block_state"),"exact state codec classification");
        check(fields.getAsJsonObject("fake").get("type").getAsString().equals("object"),"codec dropping keys cannot claim stack");
        check(fields.getAsJsonObject("item_id").get("type").getAsString().equals("string"),"field name cannot imply ID");
        check(fields.getAsJsonObject("unrelated_name").get("type").getAsString().equals("identifier"),"value membership implies ID");
        check(fields.getAsJsonObject("list").get("editable").getAsString().equals("snbt_only"),"empty list uncertainty");
        check(fields.getAsJsonObject("bytes").get("editable").getAsString().equals("snbt_only"),"typed arrays safe fallback");
        check(fields.getAsJsonObject("bytes").get("nbt_type").getAsString().equals("byte_array"),"array storage type matches wire contract");
        var large=new CompoundTag();large.putString("large","x".repeat(20000));
        var fallback=GenericSchema.describe("block_entity",GenericModFixtures.ID,large,access,false);
        check(!fallback.get("available").getAsBoolean()&&fallback.has("editable_reason"),"oversized schema explicit unavailable without partial form");
        check(large.getString("large").orElseThrow().length()==20000,"budget fallback never mutates NBT");
    }
    private static void componentChecks(RegistryAccess access,JsonObject receipts){
        String id=GenericModFixtures.COMPONENT_ID;check(ComponentSchema.persistentIds().contains(id),"new component in live candidates");
        var candidates=new RegistrySnapshot(access,key->null).entries(net.minecraft.resources.Identifier.parse("minecraft:data_component_type"));
        check(candidates.asList().stream().anyMatch(row->row.getAsJsonObject().get("id").getAsString().equals(id)),"registry candidate export includes new mod component");
        var schema=ComponentSchema.derive(id,access).entry();receipts.add("component",schema);
        check(schema.get("source").getAsString().equals("mod:generic_probe"),"component registry source");
        check(schema.get("editable").getAsString().equals("structured"),"component codec auto form");
        var stack=new ItemStack(Items.STONE);var edit=StackCodec.snapshot(stack,access,new JsonObject(),"");
        edit.getAsJsonObject("comps").add(id,JsonParser.parseString("{\"amount\":7}"));var added=StackCodec.decode(edit,access,stack);
        check(added.get(GenericModFixtures.COMPONENT).amount()==7,"component add through normal editor codec");
        var ops=access.createSerializationContext(NbtOps.INSTANCE);var saved=ItemStack.CODEC.encodeStart(ops,added).getOrThrow();
        var reopened=ItemStack.CODEC.parse(ops,saved).getOrThrow();check(ItemStack.CODEC.encodeStart(ops,reopened).getOrThrow().equals(saved),"component persistence exact");
        var modified=StackCodec.snapshot(reopened,access,new JsonObject(),"");modified.getAsJsonObject("comps").add(id,JsonParser.parseString("{\"amount\":11}"));
        var changed=StackCodec.decode(modified,access,reopened);check(changed.get(GenericModFixtures.COMPONENT).amount()==11,"component edit");
        var removed=StackCodec.snapshot(changed,access,new JsonObject(),"");removed.getAsJsonObject("comps").remove(id);removed.getAsJsonObject("removed").addProperty(id,1);
        var without=StackCodec.decode(removed,access,changed);var reopenRemoved=ItemStack.CODEC.parse(ops,ItemStack.CODEC.encodeStart(ops,without).getOrThrow()).getOrThrow();
        check(!reopenRemoved.has(GenericModFixtures.COMPONENT),"component remove save reopen");
        modified.getAsJsonObject("comps").add(id,JsonParser.parseString("{\"amount\":101}"));reject(()->StackCodec.decode(modified,access,reopened));
    }
    private static void reject(Runnable action){try{action.run();}catch(RuntimeException expected){checks++;return;}throw new AssertionError("Expected rejection");}
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);checks++;}
}
