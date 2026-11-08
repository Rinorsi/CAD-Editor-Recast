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
        var zombie=create(net.minecraft.world.entity.EntityTypes.ZOMBIE);var opened=WorldTarget.saveEntity(zombie,access);
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
        var stand=create(net.minecraft.world.entity.EntityTypes.ARMOR_STAND);var pose=edit(stand,"{pose:{Head:[10,20,30],Body:[0,15,0],LeftArm:[-90,0,0],RightArm:[90,0,0],LeftLeg:[0,0,-10],RightLeg:[0,0,10],ShowArms:true,Small:true,Marker:true,Invisible:true,NoBasePlate:true},equipment:[{slot:'mainhand',stack:{id:'minecraft:stick',count:1,comps:{},removed:{}}}]}");
        check(pose.getCompound("Pose").orElseThrow().size()==6,"six poses");check(pose.getBoolean("Small").orElseThrow(),"small stand");
        reject(()->edit(stand,"{pose:{Head:[1,2]}}"),"pose wrong arity");reject(()->edit(stand,"{pose:{ShowArms:2}}"),"flag bool guard");reject(()->edit(stand,"{equipment:[{slot:'unknown',stack:{empty:true}}]}"),"slot guard");
        capture("armor_stand",stand,pose);
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.ITEM_FRAME,net.minecraft.world.entity.EntityTypes.GLOW_ITEM_FRAME)){var frame=create(type);var saved=edit(frame,"{item_frame:{item:{id:'minecraft:diamond',count:1,comps:{},removed:{}},ItemRotation:7,Invisible:true,Fixed:true,ItemDropChance:0.5}}");check(saved.getByte("ItemRotation").orElseThrow()==7,"frame rotation");reject(()->edit(frame,"{item_frame:{ItemRotation:8}}"),"frame rotation bound");capture(type.toString(),frame,saved);}
        var painting=create(net.minecraft.world.entity.EntityTypes.PAINTING);String variant=access.lookupOrThrow(Registries.PAINTING_VARIANT).listElements().findFirst().orElseThrow().key().identifier().toString();capture("painting",painting,edit(painting,"{painting:{variant:'"+variant+"'}}"));reject(()->edit(painting,"{painting:{variant:'missing:paint'}}"),"painting registry");reject(()->edit(painting,"{painting:{facing:2}}"),"painting facing locked");
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.ITEM_DISPLAY,net.minecraft.world.entity.EntityTypes.BLOCK_DISPLAY,net.minecraft.world.entity.EntityTypes.TEXT_DISPLAY)){
            var display=create(type);var data=new JsonObject();var values=JsonParser.parseString("{transformation:{translation:[1,2,3],scale:[2,1,1],left_rotation:[0,0,0,1],right_rotation:{axis:[0,1,0],angle:0.5}},billboard:'center',brightness:{block:15,sky:0},view_range:2.0,shadow_radius:1.5,shadow_strength:0.5,glow_color_override:123,interpolation_duration:20,start_interpolation:5}").getAsJsonObject();
            if(type==net.minecraft.world.entity.EntityTypes.TEXT_DISPLAY){values.addProperty("line_width",120);values.addProperty("background",-16777216);values.addProperty("alignment","left");values.addProperty("text_opacity",-1);values.addProperty("shadow",true);values.addProperty("see_through",true);}
            if(type==net.minecraft.world.entity.EntityTypes.ITEM_DISPLAY)values.add("item",EntityWorldEdit.stack(new ItemStack(Items.DIAMOND),access));
            if(type==net.minecraft.world.entity.EntityTypes.BLOCK_DISPLAY)values.add("block_state",JsonParser.parseString("{Name:'minecraft:stone'}"));data.add("display",values);
            var saved=EntityWorldEdit.prepare(display,WorldTarget.saveEntity(display,access),data,level,access);check(saved.contains("transformation"),"transform saved");capture(type.toString(),display,saved);
            reject(()->edit(display,"{display:{brightness:{block:16,sky:0}}}"),"brightness codec bound");reject(()->edit(display,"{display:{billboard:'unknown'}}"),"billboard codec");
            // A matrix can express shear; vanilla decomposes it into its saved SVD form.
            var shear=edit(display,"{display:{transformation:[1,0.25,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}");check(shear.get("transformation") instanceof CompoundTag,"shear matrix accepted and decomposed");
        }
        reject(()->edit(zombie,"{display:{view_range:2}}"),"display type guard");reject(()->edit(zombie,"{pose:{Head:[0,0,0]}}"),"pose type guard");reject(()->edit(zombie,"{offers:[]}"),"merchant/server guard");
        var cat=create(net.minecraft.world.entity.EntityTypes.CAT);var mount=create(net.minecraft.world.entity.EntityTypes.ZOMBIE);var unmounted=EntitySessionData.pack(WorldTarget.saveEntity(cat,access),cat);EntityRiding.tryRide(cat,mount);check(cat.getVehicle()==mount,"real vanilla cat rides zombie");
        var mounted=EntitySessionData.pack(WorldTarget.saveEntity(cat,access),cat);check(!WorldNbt.revision(unmounted).equals(WorldNbt.revision(mounted)),"vehicle relationship participates in rider revision without forged NBT");check(EntitySessionData.data(mounted).equals(WorldTarget.saveEntity(cat,access)),"internal relationship marker excluded from wire SNBT");
        capture("cat_riding_zombie",mount,WorldTarget.saveEntity(mount,access));reject(()->EntityRiding.tryRide(mount,cat),"cycle guard");var other=create(net.minecraft.world.entity.EntityTypes.CAT);reject(()->EntityRiding.tryRide(other,mount),"canAddPassenger capacity");cat.stopRiding();check(cat.getVehicle()==null,"dismount");EntityRiding.tryRide(other,mount);mount.ejectPassengers();check(other.getVehicle()==null,"eject");
        ownerViews();
        droppedItemViews();
        fallingAndExplosiveViews();
        endermanAndExistingViews();
        remainingSimpleViews();
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
    private static void ownerViews(){
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.WOLF,net.minecraft.world.entity.EntityTypes.CAT,net.minecraft.world.entity.EntityTypes.PARROT)){
            var tame=(TamableAnimal)create(type);var id=UUID.randomUUID();tame.setOwnerReference(EntityReference.of(id));tame.setTame(true,false);tame.setOrderedToSit(true);
            var saved=WorldTarget.saveEntity(tame,access);var view=EntityWorldEdit.views(tame,saved,access).getAsJsonObject("owner");
            check(view.get("Owner").getAsString().equals(id.toString()),"owner UUID read");
            check(edit(tame,"{owner:{Owner:'"+id+"'}}").contains("Owner"),"existing offline owner retained");
            var cleared=edit(tame,"{owner:{Owner:null}}");check(!cleared.contains("Owner"),"owner cleared");
            var copy=(TamableAnimal)create(type);EntityWorldEdit.load(copy,cleared,access);check(!copy.isTame()&&copy.isOrderedToSit(),"clear untames without altering Sitting");
            check(saved.getBoolean("Sitting").orElseThrow(),"vanilla Sitting path");
            reject(()->edit(tame,"{owner:{Owner:'not-a-uuid'}}"),"owner format");
            reject(()->edit(tame,"{owner:{Owner:'00000000-0000-0000-0000-000000000001'}}"),"owner must be online");
            reject(()->edit(tame,"{owner:{UUID:null}}"),"identity cannot masquerade as owner");
        }
        reject(()->edit(create(net.minecraft.world.entity.EntityTypes.ZOMBIE),"{owner:{Owner:null}}"),"owner target guard");
    }
    private static void droppedItemViews(){
        var item=(net.minecraft.world.entity.item.ItemEntity)create(net.minecraft.world.entity.EntityTypes.ITEM);item.setItem(new ItemStack(Items.STICK));
        var before=WorldTarget.saveEntity(item,access);var views=EntityWorldEdit.views(item,before,access);
        check(views.getAsJsonObject("dropped_item").getAsJsonObject("Item").get("id").getAsString().equals("minecraft:stick"),"dropped item read");
        var saved=edit(item,"{dropped_item:{Item:{id:'minecraft:diamond',count:2,comps:{custom_name:{text:'Drop'}},removed:{}},PickupDelay:100,Age:-100}}");
        check(saved.getShort("PickupDelay").orElseThrow()==100&&saved.getShort("Age").orElseThrow()==-100,"drop counters typed short");
        var copy=(net.minecraft.world.entity.item.ItemEntity)create(net.minecraft.world.entity.EntityTypes.ITEM);EntityWorldEdit.load(copy,saved,access);
        check(copy.getItem().getCount()==2&&copy.getItem().getHoverName().getString().equals("Drop"),"drop full stack roundtrip");
        for(String bad:List.of("{PickupDelay:32768}","{Age:1.5}","{Age:null}","{Item:{empty:true}}","{Item:{id:'missing:item',count:1,comps:{},removed:{}}}","{UUID:'bad'}"))reject(()->edit(item,"{dropped_item:"+bad+"}"),"drop rejects "+bad);
        reject(()->edit(create(net.minecraft.world.entity.EntityTypes.ZOMBIE),"{dropped_item:{Age:1}}"),"drop target guard");
        check(WorldTarget.saveEntity(item,access).equals(before),"drop validation leaves source untouched");
    }
    private static void fallingAndExplosiveViews(){
        var falling=create(net.minecraft.world.entity.EntityTypes.FALLING_BLOCK);var saved=edit(falling,"{falling_block:{BlockState:{Name:'minecraft:oak_log',Properties:{axis:'x'}},Time:12,DropItem:false,HurtEntities:true,FallHurtAmount:2.5,FallHurtMax:40,CancelDrop:true}}");
        var copy=create(net.minecraft.world.entity.EntityTypes.FALLING_BLOCK);EntityWorldEdit.load(copy,saved,access);var view=EntityWorldEdit.views(copy,saved,access).getAsJsonObject("falling_block");
        check(view.get("Time").getAsInt()==12&&!view.get("DropItem").getAsBoolean(),"falling read and boolean write");
        check(view.getAsJsonObject("BlockState").getAsJsonObject("Properties").get("axis").getAsString().equals("x"),"falling state codec");
        for(String bad:List.of("{BlockState:{Name:'missing:block'}}","{BlockState:{Name:'minecraft:oak_log',Properties:{axis:'bad'}}}","{DropItem:1}","{Time:1.5}","{Time:null}","{Pos:[0,0,0]}"))reject(()->edit(falling,"{falling_block:"+bad+"}"),"falling rejects "+bad);
        var tnt=create(net.minecraft.world.entity.EntityTypes.TNT);var primed=edit(tnt,"{tnt:{fuse:120}}");check(primed.getShort("fuse").orElseThrow()==120,"TNT fuse");
        EntityWorldEdit.load(tnt,primed,access);check(EntityWorldEdit.views(tnt,primed,access).getAsJsonObject("tnt").get("fuse").getAsInt()==120,"TNT fuse read");
        reject(()->edit(tnt,"{tnt:{fuse:32768}}"),"TNT short bound");reject(()->edit(tnt,"{tnt:{Fuse:1}}"),"TNT case-sensitive path");
        var creeper=create(net.minecraft.world.entity.EntityTypes.CREEPER);var creeperNbt=edit(creeper,"{creeper:{Fuse:50,ExplosionRadius:5}}");EntityWorldEdit.load(creeper,creeperNbt,access);
        var creeperView=EntityWorldEdit.views(creeper,creeperNbt,access).getAsJsonObject("creeper");check(creeperView.get("Fuse").getAsInt()==50&&creeperView.get("ExplosionRadius").getAsInt()==5,"creeper fuse and radius read/write");
        reject(()->edit(creeper,"{creeper:{ExplosionRadius:128}}"),"creeper byte bound");reject(()->edit(creeper,"{creeper:{Fuse:'50'}}"),"creeper strict integer");
        for(String section:List.of("falling_block","tnt","creeper"))reject(()->edit(create(net.minecraft.world.entity.EntityTypes.ZOMBIE),"{"+section+":{}}"),"simple target guard "+section);
    }
    private static void endermanAndExistingViews(){
        var enderman=create(net.minecraft.world.entity.EntityTypes.ENDERMAN);check(EntityWorldEdit.views(enderman,WorldTarget.saveEntity(enderman,access),access).getAsJsonObject("enderman").get("carriedBlockState").isJsonNull(),"empty enderman hand");
        var saved=edit(enderman,"{enderman:{carriedBlockState:{Name:'minecraft:oak_log',Properties:{axis:'z'}}}}");EntityWorldEdit.load(enderman,saved,access);
        check(EntityWorldEdit.views(enderman,saved,access).getAsJsonObject("enderman").getAsJsonObject("carriedBlockState").get("Name").getAsString().equals("minecraft:oak_log"),"enderman block read/write");
        check(!edit(enderman,"{enderman:{carriedBlockState:null}}").contains("carriedBlockState"),"enderman clear");
        reject(()->edit(enderman,"{enderman:{carriedBlockState:{Name:'minecraft:air'}}}"),"enderman loader drops air");
        reject(()->edit(enderman,"{enderman:{carriedBlockState:{Name:'minecraft:oak_log',Properties:{axis:'invalid'}}}}"),"enderman state property");
        reject(()->edit(create(net.minecraft.world.entity.EntityTypes.ZOMBIE),"{enderman:{carriedBlockState:null}}"),"enderman target guard");
        for(var type:List.of(net.minecraft.world.entity.EntityTypes.SLIME,net.minecraft.world.entity.EntityTypes.MAGMA_CUBE,net.minecraft.world.entity.EntityTypes.PHANTOM)){
            var schema=EntitySchema.describe(type,level,access);boolean size=false;
            for(var raw:schema.getAsJsonArray("variants")){var row=raw.getAsJsonObject();if(row.get("id").getAsString().endsWith("/size"))size=row.getAsJsonArray("options").size()>1;}
            check(size,"existing live size variants "+type);
        }
        var schema=EntitySchema.describe(net.minecraft.world.entity.EntityTypes.CREEPER,level,access);boolean powered=false;
        for(var raw:schema.getAsJsonArray("extras"))if(raw.getAsJsonObject().get("key").getAsString().equals("powered"))powered=true;
        check(powered,"existing powered extras");
        schema=EntitySchema.describe(net.minecraft.world.entity.EntityTypes.WOLF,level,access);boolean sitting=false;
        for(var raw:schema.getAsJsonArray("extras")){var row=raw.getAsJsonObject();if(row.has("id")&&row.get("id").getAsString().equals("sitting"))sitting=row.get("key").getAsString().equals("Sitting");}
        check(sitting,"existing Sitting extras");
    }
    private static void remainingSimpleViews(){
        var originalLevel=level;level=new EntitySchemaTestLevel(access,false);
        try {
            var cloud=create(net.minecraft.world.entity.EntityTypes.AREA_EFFECT_CLOUD);
            String potion=access.lookupOrThrow(Registries.POTION).listElements().findFirst().orElseThrow().key().identifier().toString();
            String effect=access.lookupOrThrow(Registries.MOB_EFFECT).listElements().findFirst().orElseThrow().key().identifier().toString();
            var saved=edit(cloud,"{area_effect_cloud:{Radius:4.5,Duration:200,Age:5,WaitTime:10,ReapplicationDelay:30,DurationOnUse:-5,RadiusOnUse:-0.1,RadiusPerTick:0.01,potion_duration_scale:2,potion_contents:{potion:'"+potion+"',custom_effects:[{id:'"+effect+"',duration:100,amplifier:1}]}}}");
            EntityWorldEdit.load(cloud,saved,access);var view=EntityWorldEdit.views(cloud,saved,access).getAsJsonObject("area_effect_cloud");
            check(view.get("Radius").getAsFloat()==4.5f&&view.get("Duration").getAsInt()==200,"cloud radius duration read/write");
            check(view.getAsJsonObject("potion_contents").getAsJsonArray("custom_effects").size()==1,"cloud potion/effects codec");
            check(EntityWorldSchema.describe(cloud,access).getAsJsonObject("area_effect_cloud").getAsJsonObject("fields").getAsJsonObject("Radius").get("max").getAsFloat()>4.5,"cloud radius live setter bounds");
            var clear=edit(cloud,"{area_effect_cloud:{potion_contents:null,custom_particle:null,potion_duration_scale:null}}");check(!clear.contains("potion_contents")&&!clear.contains("potion_duration_scale"),"cloud optional clear");
            for(String bad:List.of("{Radius:100}","{Duration:1.5}","{potion_contents:{potion:'missing:potion'}}","{potion_contents:{custom_effects:[{id:'missing:effect'}]}}","{custom_particle:{type:'missing:particle'}}","{Duration:null}"))reject(()->edit(cloud,"{area_effect_cloud:"+bad+"}"),"cloud rejects "+bad);
            var particle=access.lookupOrThrow(Registries.PARTICLE_TYPE).listElements().map(h->h.value()).filter(p->p instanceof net.minecraft.core.particles.SimpleParticleType).findFirst().orElseThrow();
            var particleEdit=new JsonObject();var cloudEdit=new JsonObject();cloudEdit.add("custom_particle",net.minecraft.core.particles.ParticleTypes.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),(net.minecraft.core.particles.SimpleParticleType)particle).getOrThrow());particleEdit.add("area_effect_cloud",cloudEdit);
            check(EntityWorldEdit.prepare(cloud,saved,particleEdit,level,access).contains("custom_particle"),"cloud particle codec");
            var orb=create(net.minecraft.world.entity.EntityTypes.EXPERIENCE_ORB);var experience=edit(orb,"{experience_orb:{Value:123}}");EntityWorldEdit.load(orb,experience,access);
            check(EntityWorldEdit.views(orb,experience,access).getAsJsonObject("experience_orb").get("Value").getAsInt()==123,"experience value read/write");reject(()->edit(orb,"{experience_orb:{Value:32768}}"),"experience short bound");
            for(var type:List.of(net.minecraft.world.entity.EntityTypes.ARROW,net.minecraft.world.entity.EntityTypes.SPECTRAL_ARROW)) {
                var arrow=create(type);var pickupSchema=EntityWorldSchema.describe(arrow,access).getAsJsonObject("arrow").getAsJsonObject("fields").getAsJsonObject("pickup");
                for(var option:pickupSchema.getAsJsonArray("options")) {
                    int pickup=option.getAsJsonObject().get("value").getAsInt();var shot=edit(arrow,"{arrow:{damage:5.25,pickup:"+pickup+"}}");EntityWorldEdit.load(arrow,shot,access);
                    var arrowView=EntityWorldEdit.views(arrow,shot,access).getAsJsonObject("arrow");check(arrowView.get("damage").getAsDouble()==5.25&&arrowView.get("pickup").getAsInt()==pickup,"arrow damage/pickup codec "+type);
                }
                reject(()->edit(arrow,"{arrow:{pickup:127}}"),"arrow unknown pickup");reject(()->edit(arrow,"{arrow:{pickup:0.5}}"),"arrow fractional pickup");reject(()->edit(arrow,"{arrow:{damage:'five'}}"),"arrow damage type");
            }
            var interaction=create(net.minecraft.world.entity.EntityTypes.INTERACTION);var interacted=edit(interaction,"{interaction:{width:2.5,height:3,response:true}}");EntityWorldEdit.load(interaction,interacted,access);
            var interactionView=EntityWorldEdit.views(interaction,interacted,access).getAsJsonObject("interaction");check(interactionView.get("width").getAsFloat()==2.5f&&interactionView.get("height").getAsFloat()==3&&interactionView.get("response").getAsBoolean(),"interaction dimensions response read/write");
            reject(()->edit(interaction,"{interaction:{response:1}}"),"interaction boolean");reject(()->edit(interaction,"{interaction:{width:null}}"),"interaction null");
            var mob=create(net.minecraft.world.entity.EntityTypes.COW);var scoreboard=level.getScoreboard();var team=scoreboard.addPlayerTeam("entity_lane_test");scoreboard.addPlayerToTeam(mob.getScoreboardName(),team);
            var teamView=EntityWorldEdit.views(mob,WorldTarget.saveEntity(mob,access),access).getAsJsonObject("team");check(teamView.get("name").getAsString().equals(team.getName())&&teamView.getAsJsonArray("options").asList().contains(new JsonPrimitive(team.getName())),"team membership/options from live scoreboard");
            var data=Leashable.LeashData.CODEC.parse(com.mojang.serialization.JsonOps.INSTANCE,JsonParser.parseString("[1,64,2]")).getOrThrow();((Leashable)mob).setLeashData(data);
            var leashView=EntityWorldEdit.views(mob,WorldTarget.saveEntity(mob,access),access).getAsJsonObject("leash");check(leashView.get("data").getAsJsonArray().get(1).getAsInt()==64&&leashView.get("readOnly").getAsBoolean(),"leash live codec read");
            reject(()->edit(mob,"{leash:{data:null}}"),"leash relationship readonly");reject(()->edit(mob,"{team:{name:null}}"),"team readonly");
            var baseline=WorldTarget.saveEntity(mob,access);var moved=baseline.copy();moved.remove("leash");reject(()->WorldNbt.protect(baseline,moved,true),"raw leash still protected");
            for(String section:List.of("area_effect_cloud","experience_orb","arrow","interaction"))reject(()->edit(mob,"{"+section+":{}}"),"remaining target guard "+section);
            for(var type:List.of(net.minecraft.world.entity.EntityTypes.WOLF,net.minecraft.world.entity.EntityTypes.ITEM,net.minecraft.world.entity.EntityTypes.FALLING_BLOCK,net.minecraft.world.entity.EntityTypes.TNT,net.minecraft.world.entity.EntityTypes.CREEPER,net.minecraft.world.entity.EntityTypes.ENDERMAN,net.minecraft.world.entity.EntityTypes.AREA_EFFECT_CLOUD,net.minecraft.world.entity.EntityTypes.EXPERIENCE_ORB,net.minecraft.world.entity.EntityTypes.ARROW,net.minecraft.world.entity.EntityTypes.SPECTRAL_ARROW,net.minecraft.world.entity.EntityTypes.INTERACTION)) {
                var entries=new JsonArray();entries.add(EntitySchema.describe(type,level,access));check(RegistryPages.split("entity_schema","entities-lane",entries).size()==1,"simple schema fits transport "+type);
            }
            for(double value:new double[]{Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY}) {
                var values=new JsonObject();values.addProperty("damage",value);var request=new JsonObject();request.add("arrow",values);var arrow=create(net.minecraft.world.entity.EntityTypes.ARROW);
                reject(()->EntityWorldEdit.prepare(arrow,WorldTarget.saveEntity(arrow,access),request,level,access),"arrow nonfinite rejected");
            }
        } finally {level=originalLevel;}
    }
    private static Entity create(EntityType<?> type){return EntitySchema.create(type,level);}
    private static CompoundTag edit(Entity e,String json){return EntityWorldEdit.prepare(e,WorldTarget.saveEntity(e,access),JsonParser.parseString(json).getAsJsonObject(),level,access);}
    private static void capture(String id,Entity source,CompoundTag nbt){var row=new JsonObject();row.addProperty("mode","detached-real-factory");row.addProperty("snbt",nbt.toString());var copy=source.getType().create(level,EntitySpawnReason.COMMAND);EntityWorldEdit.load(copy,nbt,access);row.add("views",EntityWorldEdit.views(copy,nbt,access));row.add("schema",EntityWorldSchema.describe(copy,access));captured.add(id,row);
        var entries=new JsonArray();entries.add(EntitySchema.describe(source.getType(),level,access));check(RegistryPages.split("entity_schema","entity-world-test",entries).size()==1,"new schema fits actual registry transport "+id);
    }
    private static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
    private static void reject(Runnable run,String label){try{run.run();}catch(RuntimeException expected){check(expected.getMessage()!=null&&!expected.getMessage().isBlank(),label+" readable rejection");return;}throw new AssertionError("accepted invalid: "+label);}
}
