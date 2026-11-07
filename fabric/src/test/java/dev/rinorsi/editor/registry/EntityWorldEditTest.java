package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.item.*;
import net.minecraft.world.item.trading.*;

/** Detached real factories/codecs; server receipts are produced by EntityWorldEditServerProbe. */
public final class EntityWorldEditTest {
    private static int checks;
    private static RegistryAccess access;
    private static EntitySchemaTestLevel level;
    private static final JsonObject captured=new JsonObject();
    public static void main(String[] args)throws Exception{
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();access=EntitySchemaTest.access();level=new EntitySchemaTestLevel(access);
        var zombie=create(EntityType.ZOMBIE);var opened=WorldTarget.saveEntity(zombie,access);
        var draft=opened.copy();draft.putString("CustomName","walking name");
        zombie.setPos(2,64,3);zombie.setDeltaMovement(0.1,0,0.2);zombie.setAirSupply(290);zombie.setRemainingFireTicks(10);
        var current=WorldTarget.saveEntity(zombie,access);check(WorldNbt.revision(opened).equals(WorldNbt.revision(current)),"movement and air/fire do not conflict");
        var defaultInstance=opened.copy();defaultInstance.put("attributes",WorldNbt.parse("{a:[{id:'minecraft:movement_speed',base:0.23000000417232513d}]}").get("a"));check(WorldNbt.revision(opened).equals(WorldNbt.revision(defaultInstance)),"AI lazy supplier-default attribute instance does not conflict");
        ((CompoundTag)defaultInstance.getList("attributes").orElseThrow().get(0)).putDouble("base",0.4);check(!WorldNbt.revision(opened).equals(WorldNbt.revision(defaultInstance)),"actual attribute base modification still conflicts");
        var merged=EntityVolatile.rebase(opened,draft,current,false);var prepared=WorldTarget.copyEntity(zombie,merged,level,access);
        check(prepared.get("Pos").equals(current.get("Pos"))&&prepared.get("Motion").equals(current.get("Motion")),"name edit retains current motion");
        var session=new WorldEditSessions();var player=UUID.randomUUID();var slot=JsonParser.parseString("{kind:'entity',dim:'minecraft:overworld',uuid:'"+zombie.getStringUUID()+"',token:'test'}").getAsJsonObject();var sessionState=session.open(player,slot,opened);
        session.require(player,slot,sessionState.revision,current);checks++;
        ((LivingEntity)zombie).setHealth(9);check(session.require(player,slot,sessionState.revision,WorldTarget.saveEntity(zombie,access))!=null,"health change deferred to per-path merge");
        var teleported=draft.copy();teleported.put("Pos",WorldNbt.parse("{p:[1d,2d,3d]}").get("p"));reject(()->EntityVolatile.rebase(opened,teleported,current,false),"position protected");
        var brain=draft.copy();brain.put("Brain",WorldNbt.parse("{memories:{}}"));if(!Objects.equals(opened.get("Brain"),brain.get("Brain")))reject(()->EntityVolatile.rebase(opened,brain,current,false),"brain protected");
        var undo=EntityVolatile.rebase(opened,opened,current,true);check(undo.get("Pos").equals(current.get("Pos")),"undo retains current position");
        var baby=opened.copy();baby.putInt("Age",-24000);var older=baby.copy();older.putInt("Age",-23990);
        check(WorldNbt.revision(baby).equals(WorldNbt.revision(older)),"age counter ignored within baby stage");
        older.putInt("Age",0);check(!WorldNbt.revision(baby).equals(WorldNbt.revision(older)),"age stage transition conflicts");
        var grown=EntityVolatile.rebase(baby,older,baby,false);check(grown.getInt("Age").orElseThrow()==0,"explicit baby/adult change retained");
        var effect=opened.copy();effect.put("active_effects",WorldNbt.parse("{effects:[{id:'minecraft:speed',duration:100,amplifier:0b,hidden_effect:{duration:200,amplifier:0b}}]}").get("effects"));
        var ticking=effect.copy();var effectRow=(CompoundTag)ticking.getList("active_effects").orElseThrow().get(0);effectRow.putInt("duration",99);effectRow.getCompound("hidden_effect").orElseThrow().putInt("duration",199);
        check(WorldNbt.revision(effect).equals(WorldNbt.revision(ticking)),"effect and hidden duration countdown ignored");
        var mergedEffects=EntityVolatile.rebase(effect,effect,ticking,false);check(mergedEffects.get("active_effects").equals(ticking.get("active_effects")),"countdown inherited without rewind");
        effectRow.putByte("amplifier",(byte)1);check(!WorldNbt.revision(effect).equals(WorldNbt.revision(ticking)),"effect amplifier concurrent edit conflicts");
        var stand=create(EntityType.ARMOR_STAND);var pose=edit(stand,"{pose:{Head:[10,20,30],Body:[0,15,0],LeftArm:[-90,0,0],RightArm:[90,0,0],LeftLeg:[0,0,-10],RightLeg:[0,0,10],ShowArms:true,Small:true,Marker:true,Invisible:true,NoBasePlate:true},equipment:[{slot:'mainhand',stack:{id:'minecraft:stick',count:1,comps:{},removed:{}}}]}");
        check(pose.getCompound("Pose").orElseThrow().size()==6,"six poses");check(pose.getBoolean("Small").orElseThrow(),"small stand");
        reject(()->edit(stand,"{pose:{Head:[1,2]}}"),"pose wrong arity");reject(()->edit(stand,"{pose:{ShowArms:2}}"),"flag bool guard");reject(()->edit(stand,"{equipment:[{slot:'unknown',stack:{empty:true}}]}"),"slot guard");
        capture("armor_stand",stand,pose);
        for(var type:List.of(EntityType.ITEM_FRAME,EntityType.GLOW_ITEM_FRAME)){var frame=create(type);var saved=edit(frame,"{item_frame:{item:{id:'minecraft:diamond',count:1,comps:{},removed:{}},ItemRotation:7,Invisible:true,Fixed:true,ItemDropChance:0.5}}");check(saved.getByte("ItemRotation").orElseThrow()==7,"frame rotation");reject(()->edit(frame,"{item_frame:{ItemRotation:8}}"),"frame rotation bound");capture(type.toString(),frame,saved);}
        var painting=create(EntityType.PAINTING);String variant=access.lookupOrThrow(Registries.PAINTING_VARIANT).listElements().findFirst().orElseThrow().key().identifier().toString();capture("painting",painting,edit(painting,"{painting:{variant:'"+variant+"'}}"));reject(()->edit(painting,"{painting:{variant:'missing:paint'}}"),"painting registry");reject(()->edit(painting,"{painting:{facing:2}}"),"painting facing locked");
        for(var type:List.of(EntityType.ITEM_DISPLAY,EntityType.BLOCK_DISPLAY,EntityType.TEXT_DISPLAY)){
            var display=create(type);var data=new JsonObject();var values=JsonParser.parseString("{transformation:{translation:[1,2,3],scale:[2,1,1],left_rotation:[0,0,0,1],right_rotation:{axis:[0,1,0],angle:0.5}},billboard:'center',brightness:{block:15,sky:0},view_range:2.0,shadow_radius:1.5,shadow_strength:0.5,glow_color_override:123,interpolation_duration:20,start_interpolation:5}").getAsJsonObject();
            if(type==EntityType.TEXT_DISPLAY){values.addProperty("line_width",120);values.addProperty("background",-16777216);values.addProperty("alignment","left");values.addProperty("text_opacity",-1);values.addProperty("shadow",true);values.addProperty("see_through",true);}
            if(type==EntityType.ITEM_DISPLAY)values.add("item",EntityWorldEdit.stack(new ItemStack(Items.DIAMOND),access));
            if(type==EntityType.BLOCK_DISPLAY)values.add("block_state",JsonParser.parseString("{Name:'minecraft:stone'}"));data.add("display",values);
            var saved=EntityWorldEdit.prepare(display,WorldTarget.saveEntity(display,access),data,level,access);check(saved.contains("transformation"),"transform saved");capture(type.toString(),display,saved);
            reject(()->edit(display,"{display:{brightness:{block:16,sky:0}}}"),"brightness codec bound");reject(()->edit(display,"{display:{billboard:'unknown'}}"),"billboard codec");
            // A matrix can express shear; vanilla decomposes it into its saved SVD form.
            var shear=edit(display,"{display:{transformation:[1,0.25,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}");check(shear.get("transformation") instanceof CompoundTag,"shear matrix accepted and decomposed");
        }
        reject(()->edit(zombie,"{display:{view_range:2}}"),"display type guard");reject(()->edit(zombie,"{pose:{Head:[0,0,0]}}"),"pose type guard");reject(()->edit(zombie,"{offers:[]}"),"merchant/server guard");
        var cat=create(EntityType.CAT);var mount=create(EntityType.ZOMBIE);var unmounted=EntitySessionData.pack(WorldTarget.saveEntity(cat,access),cat);EntityRiding.tryRide(cat,mount);check(cat.getVehicle()==mount,"real vanilla cat rides zombie");
        var mounted=EntitySessionData.pack(WorldTarget.saveEntity(cat,access),cat);check(!WorldNbt.revision(unmounted).equals(WorldNbt.revision(mounted)),"vehicle relationship participates in rider revision without forged NBT");check(EntitySessionData.data(mounted).equals(WorldTarget.saveEntity(cat,access)),"internal relationship marker excluded from wire SNBT");
        capture("cat_riding_zombie",mount,WorldTarget.saveEntity(mount,access));reject(()->EntityRiding.tryRide(mount,cat),"cycle guard");var other=create(EntityType.CAT);reject(()->EntityRiding.tryRide(other,mount),"canAddPassenger capacity");cat.stopRiding();check(cat.getVehicle()==null,"dismount");EntityRiding.tryRide(other,mount);mount.ejectPassengers();check(other.getVehicle()==null,"eject");
        var offers=new MerchantOffers();offers.add(new MerchantOffer(new ItemCost(Items.EMERALD,2),new ItemStack(Items.BREAD,3),12,5,0.05f));
        var raw=MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),offers).getOrThrow();var normalized=EntityWorldEdit.offers(offers,access);var roundtrip=EntityWorldEdit.decodeOffers(normalized,access,raw);check(raw.equals(MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),roundtrip).getOrThrow()),"trade cost predicate exact roundtrip");
        normalized.get(0).getAsJsonObject().addProperty("uses",2);var updated=EntityWorldEdit.decodeOffers(normalized,access,raw);check(updated.get(0).getUses()==2,"offer uses codec");normalized.get(0).getAsJsonObject().getAsJsonObject("buy").addProperty("count",0);reject(()->EntityWorldEdit.decodeOffers(normalized,access,raw),"trade stack guard");
        var predicates=new MerchantOffers();predicates.add(new MerchantOffer(new ItemCost(Items.DIAMOND_SWORD).withComponents(b->b.expect(net.minecraft.core.component.DataComponents.DAMAGE,0)),new ItemStack(Items.EMERALD),10,1,0.0f));
        var predicateTag=MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),predicates).getOrThrow();var predicateWire=EntityWorldEdit.offers(predicates,access);
        var predicateRoundtrip=EntityWorldEdit.decodeOffers(predicateWire,access,null);check(predicateTag.equals(MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),predicateRoundtrip).getOrThrow()),"explicit-default ingredient predicate survives without original row");
        var tradeCapture=new JsonObject();tradeCapture.add("codec",EntitySchema.json(raw));tradeCapture.add("offers",EntityWorldEdit.offers(offers,access));captured.add("trade_codec_only",tradeCapture);
        Path output=Path.of(args.length==0?"logs/world-entity/captured-jvm.json":args[0]);Files.createDirectories(output.toAbsolutePath().getParent());Files.writeString(output,new GsonBuilder().serializeNulls().setPrettyPrinting().create().toJson(captured));
        System.out.println("PASS EntityWorldEditTest "+checks+" checks; detached factories, no server/network/client started");
    }
    private static Entity create(EntityType<?> type){return EntitySchema.create(type,level);}
    private static CompoundTag edit(Entity e,String json){return EntityWorldEdit.prepare(e,WorldTarget.saveEntity(e,access),JsonParser.parseString(json).getAsJsonObject(),level,access);}
    private static void capture(String id,Entity source,CompoundTag nbt){var row=new JsonObject();row.addProperty("mode","detached-real-factory");row.addProperty("snbt",nbt.toString());var copy=source.getType().create(level,EntitySpawnReason.COMMAND);EntityWorldEdit.load(copy,nbt,access);row.add("views",EntityWorldEdit.views(copy,nbt,access));row.add("schema",EntityWorldSchema.describe(copy,access));captured.add(id,row);
        var entries=new JsonArray();entries.add(EntitySchema.describe(source.getType(),level,access));check(RegistryPages.split("entity_schema","entity-world-test",entries).size()==1,"new schema fits actual registry transport "+id);
    }
    private static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    private static void reject(Runnable run,String label){try{run.run();}catch(RuntimeException expected){check(expected.getMessage()!=null&&!expected.getMessage().isBlank(),label+" readable rejection");return;}throw new AssertionError("accepted invalid: "+label);}
}
