package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.nio.file.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.*;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;

/** Additional real-codec factory checks; deliberately does not pretend to tick a ServerLevel. */
public final class BlockWorldEditTest {
    private static int checks;
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        run(EntitySchemaTest.access(),Path.of("logs/block-edit"));
    }
    public static void run(RegistryAccess access,Path output) throws Exception {
        vaultViews(access);
        sculkViews(access);
        structureViews(access);
        nameableViews(access);
        hopperView(access);
        beaconView(access);
        crafterView(access);
        var samples=new JsonObject();var metadata=new JsonObject();metadata.addProperty("mode","pure-jvm-real-factories-and-codecs-not-live-ticks");metadata.add("command_block_types",BlockStateEdit.commandTypes());samples.add("capture_metadata",metadata);
        for(var block:List.of(Blocks.CHEST,Blocks.FURNACE,Blocks.OAK_DOOR,Blocks.STONE_SLAB,Blocks.OAK_STAIRS,Blocks.REPEATER,Blocks.COMMAND_BLOCK,Blocks.REDSTONE_WIRE)) {
            var state=block.defaultBlockState();var states=new JsonArray();
            for(var property:state.getProperties()) {
                var schema=BlockStateEdit.schema(state);check(schema.size()==state.getProperties().size(),"real property schema");
                for(var value:property.getPossibleValues()) {
                    var edit=new JsonObject();edit.addProperty(property.getName(),propertyName(property,value));
                    var next=BlockStateEdit.prepare(state,edit);check(BlockStateEdit.values(next).get(property.getName()).getAsString().equals(propertyName(property,value)),"actual allowed state "+block+"/"+property.getName());
                    if(block instanceof EntityBlock factory) {
                        var be=factory.newBlockEntity(BlockPos.ZERO,state);
                        if(be instanceof net.minecraft.world.Container container)container.setItem(0,new ItemStack(Items.PAPER));
                        var nbt=be.saveWithFullMetadata(access);var copy=WorldTarget.copyBlock(be,nbt,access);copy.setBlockState(next);
                        check(copy.saveWithFullMetadata(access).equals(nbt),"state edit keeps BE NBT "+block);
                    }
                    states.add(BlockStateEdit.values(next));
                }
                var invalid=new JsonObject();invalid.addProperty(property.getName(),"__invalid__");reject("invalid_block_state",()->BlockStateEdit.prepare(state,invalid));
            }
            var unknown=new JsonObject();unknown.addProperty("__invalid__",true);reject("invalid_block_state",()->BlockStateEdit.prepare(state,unknown));
            var row=new JsonObject();row.add("block_state_schema",BlockStateEdit.schema(state));row.add("allowed_edits",states);samples.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).toString(),row);
        }
        check(BlockStateEdit.flags(true)==3 && BlockStateEdit.flags(false)==18,"documented neighbour flags");
        reject("invalid_block_state",()->BlockStateEdit.requireApplied(Blocks.CHEST.defaultBlockState(),Blocks.CHEST.defaultBlockState().setValue(ChestBlock.TYPE,net.minecraft.world.level.block.state.properties.ChestType.LEFT)));
        BlockStateEdit.requireApplied(Blocks.CHEST.defaultBlockState(),Blocks.CHEST.defaultBlockState());checks++;
        for(var id:BlockStateEdit.commandTypes()) {
            var mode=BlockStateEdit.commandType(Blocks.COMMAND_BLOCK.defaultBlockState(),id.getAsString());
            check(mode.getBlock() instanceof CommandBlock,"mode from real registry");
            var be=((EntityBlock)Blocks.COMMAND_BLOCK).newBlockEntity(BlockPos.ZERO,Blocks.COMMAND_BLOCK.defaultBlockState());
            var nbt=be.saveWithFullMetadata(access);var copy=WorldTarget.copyBlock(be,nbt,access);copy.setBlockState(mode);check(copy.saveWithFullMetadata(access).equals(nbt),"command mode NBT retained");
        }
        reject("invalid_block_state",()->BlockStateEdit.commandType(Blocks.CHEST.defaultBlockState(),"minecraft:command_block"));
        reject("invalid_block_state",()->BlockStateEdit.commandType(Blocks.COMMAND_BLOCK.defaultBlockState(),"minecraft:chest"));
        for(var b:List.of(Blocks.OAK_SIGN,Blocks.OAK_HANGING_SIGN,Blocks.WHITE_BANNER,Blocks.BEEHIVE,Blocks.BEE_NEST,Blocks.LECTERN,Blocks.JUKEBOX,Blocks.DECORATED_POT,Blocks.CHISELED_BOOKSHELF,Blocks.COMMAND_BLOCK,Blocks.FURNACE,Blocks.SMOKER,Blocks.BLAST_FURNACE,Blocks.BREWING_STAND,Blocks.CAMPFIRE,Blocks.PLAYER_HEAD,Blocks.END_GATEWAY,Blocks.STRUCTURE_BLOCK)) {
            var be=((EntityBlock)b).newBlockEntity(BlockPos.ZERO,b.defaultBlockState());
            if(be instanceof BeehiveBlockEntity hive)hive.storeBee(BeehiveBlockEntity.Occupant.create(0));
            var before=be.saveWithFullMetadata(access);var views=new JsonObject();BlockViews.add(views,be,access,before);
            var mutation=new JsonObject();
            if(be instanceof BannerBlockEntity) {
                var pattern=access.lookupOrThrow(net.minecraft.core.registries.Registries.BANNER_PATTERN).listElements().findFirst().orElseThrow();
                var value=new JsonObject();value.add("patterns",BannerPatternLayers.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),new BannerPatternLayers.Builder().add(pattern,DyeColor.RED).build()).getOrThrow());mutation.add("banner",value);
            }
            if(be instanceof SkullBlockEntity) {
                var value=new JsonObject();value.add("minecraft:profile",net.minecraft.world.item.component.ResolvableProfile.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),net.minecraft.world.item.component.ResolvableProfile.createUnresolved("Rinorsi")).getOrThrow());
                value.add("minecraft:custom_name",net.minecraft.network.chat.ComponentSerialization.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),Component.literal("测试头颅")).getOrThrow());mutation.add("skull",value);
            }
            if(be instanceof DecoratedPotBlockEntity) {
                var value=new JsonObject();value.add("sherds",PotDecorations.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),new PotDecorations(Items.ANGLER_POTTERY_SHERD,Items.BRICK,Items.BRICK,Items.BRICK)).getOrThrow());mutation.add("decorated_pot",value);
            }
            if(be instanceof LecternBlockEntity || be instanceof JukeboxBlockEntity) {
                var value=new JsonObject();value.add(be instanceof LecternBlockEntity ? "Book" : "RecordItem",ItemStack.CODEC.encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),new ItemStack(be instanceof LecternBlockEntity ? Items.WRITTEN_BOOK : Items.MUSIC_DISC_13)).getOrThrow());mutation.add(be instanceof LecternBlockEntity ? "lectern" : "jukebox",value);
            }
            if(be instanceof CommandBlockEntity)mutation=JsonParser.parseString("{command_block:{Command:'say block-test',TrackOutput:false,auto:true,powered:true}}").getAsJsonObject();
            if(!mutation.isEmpty()) {
                var edited=BlockViews.apply(be,before,mutation,access);var copy=WorldTarget.copyBlock(be,edited,access);WorldNbt.requireEditedFieldsRetained(before,edited,copy.saveWithFullMetadata(access));checks++;
                var contentState=BlockViews.contentState(be,before,edited,b.defaultBlockState(),access);
                if(be instanceof LecternBlockEntity)check(contentState.getValue(LecternBlock.HAS_BOOK),"lectern content sets has_book");
                if(be instanceof JukeboxBlockEntity)check(contentState.getValue(JukeboxBlock.HAS_RECORD),"jukebox content sets has_record");
                var editedViews=new JsonObject();BlockViews.add(editedViews,copy,access,copy.saveWithFullMetadata(access));
                var capture=new JsonObject();capture.add("request_views",mutation);capture.add("result_views",editedViews);capture.addProperty("result_snbt",copy.saveWithFullMetadata(access).toString());samples.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b)+"/edited",capture);
            }
            for(var group:views.entrySet()) {
                if(group.getKey().equals("unsupported"))continue;
                var value=group.getValue().getAsJsonObject().getAsJsonObject("value").deepCopy();
                // Null is only removable for the explicit nullable item/component fields.
                value.entrySet().removeIf(e->e.getValue().isJsonNull());
                var edits=new JsonObject();edits.add(group.getKey(),value);
                var requested=BlockViews.apply(be,before,edits,access);var copy=WorldTarget.copyBlock(be,requested,access);
                WorldNbt.requireEditedFieldsRetained(before,requested,copy.saveWithFullMetadata(access));checks++;
                var roundtripViews=new JsonObject();BlockViews.add(roundtripViews,copy,access,copy.saveWithFullMetadata(access));
                check(StackCodec.sameJson(roundtripViews.getAsJsonObject(group.getKey()).get("value"),group.getValue().getAsJsonObject().get("value")),"normalized view roundtrip "+b);
            }
            var sample=new JsonObject();sample.addProperty("snbt",before.toString());sample.add("views",views);sample.add("block_state_schema",BlockStateEdit.schema(b.defaultBlockState()));samples.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b).toString(),sample);
            if(be instanceof SignBlockEntity) {
                var waxed=before.copy();waxed.putBoolean("is_waxed",true);
                var edits=JsonParser.parseString("{sign:{front_text:{messages:[\"修改\",\"\",\"\",\"\"]}}}").getAsJsonObject();
                reject("sign_waxed",()->BlockViews.apply(be,waxed,edits,access));
                edits.getAsJsonObject("sign").addProperty("is_waxed",false);
                var next=BlockViews.apply(be,waxed,edits,access);check(!next.getBoolean("is_waxed").orElseThrow(),"unwax and edit atomic");
                var copy=WorldTarget.copyBlock(be,next,access);WorldNbt.requireEditedFieldsRetained(before,next,copy.saveWithFullMetadata(access));checks++;
                var capture=new JsonObject();capture.add("request_views",edits);capture.addProperty("result_snbt",copy.saveWithFullMetadata(access).toString());samples.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b)+"/edited",capture);
                var bad=JsonParser.parseString("{sign:{front_text:{messages:[\"只有一行\"]}}}").getAsJsonObject();reject("invalid_nbt",()->BlockViews.apply(be,before,bad,access));
                var badColor=JsonParser.parseString("{sign:{front_text:{color:\"__invalid__\"}}}").getAsJsonObject();reject("invalid_nbt",()->BlockViews.apply(be,before,badColor,access));
                var badBoolean=JsonParser.parseString("{sign:{front_text:{has_glowing_text:'invalid'}}}").getAsJsonObject();reject("invalid_nbt",()->BlockViews.apply(be,before,badBoolean,access));
            }
            if(be instanceof AbstractFurnaceBlockEntity) {
                for(String number:List.of("32768","-32769","1.5","1e100")) {
                    var badNumber=JsonParser.parseString("{furnace:{cooking_time_spent:"+number+"}}").getAsJsonObject();reject("invalid_nbt",()->BlockViews.apply(be,before,badNumber,access));
                }
                var current=before.copy();current.putShort("lit_time_remaining",(short)100);current.putShort("cooking_time_spent",(short)12);
                check(WorldNbt.revision(before).equals(WorldNbt.revision(current)),"furnace timers excluded");
                var draft=before.copy();draft.putString("CustomName","编辑名称");var merged=BlockVolatile.merge(draft,before,current);
                check(merged.getShort("lit_time_remaining").orElseThrow()==100 && merged.getShort("cooking_time_spent").orElseThrow()==12,"stale draft never rewinds furnace");
                var validated=WorldTarget.copyBlock(be,merged,access).saveWithFullMetadata(access);WorldNbt.requireEditedFieldsRetained(before,merged,validated);checks++;check(validated.getShort("lit_time_remaining").orElseThrow()==100,"real loader keeps merged timer");
                var capture=new JsonObject();capture.addProperty("opened_snbt",before.toString());capture.addProperty("current_snbt",current.toString());capture.addProperty("merged_snbt",validated.toString());samples.add(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b)+"/volatile_merge",capture);
                var explicit=before.copy();explicit.putShort("cooking_time_spent",(short)25);check(BlockVolatile.merge(explicit,before,current).getShort("cooking_time_spent").orElseThrow()==25,"explicit timer edit retained");
                var changed=current.copy();changed.putString("CustomName","并发修改");reject("target_changed",()->WorldNbt.requireRevision(WorldNbt.revision(before),changed));
                var packed=BlockSessionData.pack(before,b.defaultBlockState());var now=BlockSessionData.pack(current,b.defaultBlockState());
                check(WorldNbt.revision(packed).equals(WorldNbt.revision(now)),"wrapped session ignores timers");
                var tickingSession=new WorldEditSessions();var owner=UUID.randomUUID();var token=JsonParser.parseString("{kind:'block',dim:'minecraft:overworld',x:0,y:0,z:0,token:'dynamic'}").getAsJsonObject();
                var opened=tickingSession.open(owner,token,packed);check(tickingSession.require(owner,token,opened.revision,now)==opened,"session accepts current furnace timers");
                check(tickingSession.require(owner,token,opened.revision,BlockSessionData.pack(changed,b.defaultBlockState()))==opened,"unrelated changes deferred to three-way merge");
                var stateEdit=new JsonObject();stateEdit.addProperty("lit",true);var changedState=BlockStateEdit.prepare(b.defaultBlockState(),stateEdit);
                reject("target_changed",()->WorldNbt.requireRevision(WorldNbt.revision(packed),BlockSessionData.pack(current,changedState)));
            }
            if(be instanceof BeehiveBlockEntity) {
                var current=before.copy();current.getList("bees").orElseThrow().getCompound(0).orElseThrow().putInt("ticks_in_hive",100);
                check(WorldNbt.revision(before).equals(WorldNbt.revision(current)),"bee ticks excluded");
                check(BlockVolatile.merge(before,before,current).equals(current),"bee ticks merged without replacing entity_data");
                var changed=current.copy();changed.getList("bees").orElseThrow().getCompound(0).orElseThrow().putInt("min_ticks_in_hive",999);reject("target_changed",()->WorldNbt.requireRevision(WorldNbt.revision(before),changed));
            }
        }
        for(var b:List.of(Blocks.HOPPER,Blocks.BREWING_STAND,Blocks.CAMPFIRE,Blocks.SPAWNER,Blocks.BEACON)) {
            var be=((EntityBlock)b).newBlockEntity(BlockPos.ZERO,b.defaultBlockState());var saved=be.saveWithFullMetadata(access);
            String captureId=net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(b).toString();
            if(!samples.has(captureId)){var capture=new JsonObject();capture.addProperty("snbt",saved.toString());capture.add("block_state_schema",BlockStateEdit.schema(b.defaultBlockState()));samples.add(captureId,capture);}
            for(var key:BlockVolatile.fields(saved)) {
                if(!saved.contains(key))continue;var current=saved.copy();var value=saved.get(key);
                if(value instanceof ShortTag)current.putShort(key,(short)123);
                else if(value instanceof ByteTag)current.putByte(key,(byte)7);
                else if(value instanceof IntTag)current.putInt(key,123);
                else if(value instanceof IntArrayTag array){var values=array.getAsIntArray().clone();values[0]=12;current.putIntArray(key,values);}
                else throw new AssertionError("unexpected dynamic field type "+key);
                check(WorldNbt.revision(saved).equals(WorldNbt.revision(current)),"proven timer excluded "+b+"/"+key);
                check(BlockVolatile.merge(saved,saved,current).equals(current),"proven timer merged "+b+"/"+key);
            }
        }
        var sign=((EntityBlock)Blocks.OAK_SIGN).newBlockEntity(BlockPos.ZERO,Blocks.OAK_SIGN.defaultBlockState());
        var signData=sign.saveWithFullMetadata(access);var signSlot=JsonParser.parseString("{kind:'block',dim:'minecraft:overworld',x:0,y:0,z:0,token:'sign'}").getAsJsonObject();var signSessions=new WorldEditSessions();var signOwner=UUID.randomUUID();
        var signBaseline=BlockSessionData.pack(signData,sign.getBlockState());var signOpened=signSessions.open(signOwner,signSlot,signBaseline);
        var unrelatedFurnace=((EntityBlock)Blocks.FURNACE).newBlockEntity(new BlockPos(1,0,0),Blocks.FURNACE.defaultBlockState()).saveWithFullMetadata(access);unrelatedFurnace.putShort("lit_time_remaining",(short)99);
        check(signSessions.require(signOwner,signSlot,signOpened.revision,BlockSessionData.pack(sign.saveWithFullMetadata(access),sign.getBlockState()))==signOpened,"sign edit unaffected by unrelated furnace clock");
        var signEdit=BlockViews.apply(sign,signData,JsonParser.parseString("{sign:{front_text:{messages:['并发计时中改标牌','','','']}}}").getAsJsonObject(),access);
        WorldNbt.requireEditedFieldsRetained(signData,signEdit,WorldTarget.copyBlock(sign,signEdit,access).saveWithFullMetadata(access));checks++;
        var jukebox=((EntityBlock)Blocks.JUKEBOX).newBlockEntity(BlockPos.ZERO,Blocks.JUKEBOX.defaultBlockState());var jukeboxOpened=jukebox.saveWithFullMetadata(access);var jukeboxCurrent=jukeboxOpened.copy();jukeboxCurrent.putLong(JukeboxBlockEntity.TICKS_SINCE_SONG_STARTED_TAG_ID,99L);
        var newRecord=BlockViews.apply(jukebox,jukeboxCurrent,JsonParser.parseString("{jukebox:{RecordItem:{id:'minecraft:music_disc_13',count:1}}}").getAsJsonObject(),access);
        check(!BlockVolatile.merge(newRecord,jukeboxOpened,jukeboxCurrent).contains(JukeboxBlockEntity.TICKS_SINCE_SONG_STARTED_TAG_ID),"new record does not inherit previous song offset");
        // The state operation goes through the same envelope/session, never an alternative guard.
        var session=new WorldEditSessions();var user=UUID.randomUUID();var slot=JsonParser.parseString("{kind:'block',dim:'minecraft:overworld',x:0,y:0,z:0,token:'state'}").getAsJsonObject();
        var baseline=BlockSessionData.pack(((EntityBlock)Blocks.FURNACE).newBlockEntity(BlockPos.ZERO,Blocks.FURNACE.defaultBlockState()).saveWithFullMetadata(access),Blocks.FURNACE.defaultBlockState());
        session.open(user,slot,baseline);var stale=slot.deepCopy();stale.addProperty("token","old");reject("session_lost",()->session.require(user,stale,WorldNbt.revision(baseline),baseline));
        check(!new EditorPolicy(2,false).allows(false,false),"state envelope permission guard");reject("out_of_reach",()->WorldAccess.reach(false));reject("protected_area",()->WorldAccess.area(false));
        Files.createDirectories(output);Files.writeString(output.resolve("block-captured.json"),new GsonBuilder().setPrettyPrinting().create().toJson(samples));
        System.out.println("PASS BlockWorldEditTest "+checks+" checks; factory/codec/state data; real-client run pending");
    }
    private static void crafterView(RegistryAccess access) {
        var be=new CrafterBlockEntity(BlockPos.ZERO,Blocks.CRAFTER.defaultBlockState());var before=be.saveWithFullMetadata(access);
        var views=new JsonObject();BlockViews.add(views,be,access,before);var value=views.getAsJsonObject("crafter").getAsJsonObject("value");
        check(value.getAsJsonArray("disabled_slots").isEmpty() && !value.get("triggered").getAsBoolean(),"crafter default read");
        var saved=roundtrip(be,before,"{crafter:{disabled_slots:[2,0],triggered:true}}",access);
        var copy=(CrafterBlockEntity)WorldTarget.copyBlock(be,saved,access);
        check(copy.isSlotDisabled(0) && copy.isSlotDisabled(2) && copy.isTriggered(),"crafter runtime readback");
        var reread=new JsonObject();BlockViews.add(reread,copy,access,saved);
        check(reread.getAsJsonObject("crafter").getAsJsonObject("value").get("triggered").getAsBoolean(),"crafter bool view");
        check(saved.get("triggered") instanceof IntTag,"crafter int storage");
        var cleared=roundtrip(be,saved,"{crafter:{disabled_slots:[],triggered:false}}",access);
        check(cleared.getIntArray("disabled_slots").orElseThrow().length==0 && cleared.getInt("triggered").orElseThrow()==CrafterBlockEntity.SLOT_ENABLED,"crafter clear explicit values");
        for(String fields:List.of("disabled_slots:null","triggered:null","triggered:1","triggered:'true'","disabled_slots:[-1]","disabled_slots:["+be.getContainerSize()+"]","disabled_slots:[0,0]","disabled_slots:[1.5]","disabled_slots:['1']"))reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{crafter:{"+fields+"}}").getAsJsonObject(),access));
        be.setItem(0,new ItemStack(Items.PAPER));var occupied=be.saveWithFullMetadata(access);
        reject("invalid_nbt",()->BlockViews.apply(be,occupied,JsonParser.parseString("{crafter:{disabled_slots:[0]}}").getAsJsonObject(),access));
    }
    private static void beaconView(RegistryAccess access) {
        var be=new BeaconBlockEntity(BlockPos.ZERO,Blocks.BEACON.defaultBlockState());var before=be.saveWithFullMetadata(access);
        var views=new JsonObject();BlockViews.add(views,be,access,before);var row=views.getAsJsonObject("beacon");
        check(row.getAsJsonObject("value").get("primary_effect").isJsonNull(),"beacon absent primary");
        check(row.getAsJsonObject("value").get("secondary_effect").isJsonNull(),"beacon absent secondary");
        check(row.getAsJsonObject("schema").getAsJsonObject("fields").getAsJsonObject("Levels").get("read_only").getAsBoolean(),"beacon levels readonly");
        for(String key:List.of("primary_effect","secondary_effect")) {
            var candidates=row.getAsJsonObject("schema").getAsJsonObject("fields").getAsJsonObject(key).getAsJsonArray("candidates");
            check(candidates.size()==BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).distinct().count(),"beacon live candidates");
            for(var effect:candidates) {
                var saved=roundtrip(be,before,"{beacon:{"+key+":"+effect+"}}",access);
                var reread=new JsonObject();BlockViews.add(reread,WorldTarget.copyBlock(be,saved,access),access,saved);
                check(reread.getAsJsonObject("beacon").getAsJsonObject("value").get(key).equals(effect),"beacon effect readback");
                check(!roundtrip(be,saved,"{beacon:{"+key+":null}}",access).contains(key),"beacon effect clear");
            }
            reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{beacon:{"+key+":'minecraft:__missing__'}}").getAsJsonObject(),access));
            var disallowed=net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.listElements().filter(e->BeaconBlockEntity.BEACON_EFFECTS.stream().flatMap(List::stream).noneMatch(e::equals)).findFirst().orElseThrow();
            var id=net.minecraft.core.registries.BuiltInRegistries.MOB_EFFECT.holderByNameCodec().encodeStart(access.createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE),disallowed).getOrThrow();
            reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{beacon:{"+key+":"+id+"}}").getAsJsonObject(),access));
        }
        for(String value:List.of("1","null"))reject("invalid_request",()->BlockViews.apply(be,before,JsonParser.parseString("{beacon:{Levels:"+value+"}}").getAsJsonObject(),access));
    }
    private static void hopperView(RegistryAccess access) {
        var be=new HopperBlockEntity(BlockPos.ZERO,Blocks.HOPPER.defaultBlockState());var before=be.saveWithFullMetadata(access);
        var views=new JsonObject();BlockViews.add(views,be,access,before);
        check(views.getAsJsonObject("hopper").getAsJsonObject("value").get("TransferCooldown").getAsInt()==before.getInt("TransferCooldown").orElseThrow(),"hopper real cooldown");
        for(int value:new int[]{Integer.MIN_VALUE,-1,0,HopperBlockEntity.MOVE_ITEM_SPEED,Integer.MAX_VALUE}) {
            var saved=roundtrip(be,before,"{hopper:{TransferCooldown:"+value+"}}",access);
            check(saved.getInt("TransferCooldown").orElseThrow()==value,"hopper int retained");
        }
        for(String value:List.of("null","2147483648","-2147483649","1.5","'8'"))reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{hopper:{TransferCooldown:"+value+"}}").getAsJsonObject(),access));
    }
    private static void nameableViews(RegistryAccess access) {
        for(var block:net.minecraft.core.registries.BuiltInRegistries.BLOCK) {
            if(!(block instanceof EntityBlock factory))continue;
            var be=factory.newBlockEntity(BlockPos.ZERO,block.defaultBlockState());
            if(be==null)continue;
            var before=be.saveWithFullMetadata(access);var views=new JsonObject();BlockViews.add(views,be,access,before);
            check(views.has("nameable")== (be instanceof net.minecraft.world.Nameable),"Nameable detection "+block);
            if(!(be instanceof net.minecraft.world.Nameable))continue;
            check(views.getAsJsonObject("nameable").getAsJsonObject("schema").getAsJsonObject("fields").getAsJsonObject("CustomName").get("nullable").getAsBoolean(),"name nullable");
            var named=roundtrip(be,before,"{nameable:{CustomName:{text:'Workshop',color:'gold'}}}",access);
            var copy=WorldTarget.copyBlock(be,named,access);
            check(((net.minecraft.world.Nameable)copy).getCustomName().getString().equals("Workshop"),"name read back "+block);
            var cleared=roundtrip(copy,named,"{nameable:{CustomName:null}}",access);
            check(!cleared.contains("CustomName"),"name removed "+block);
            reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{nameable:{CustomName:{text:[]}}}").getAsJsonObject(),access));
        }
    }
    private static CompoundTag roundtrip(BlockEntity be,CompoundTag before,String json,RegistryAccess access) {
        var edited=BlockViews.apply(be,before,JsonParser.parseString(json).getAsJsonObject(),access);
        var saved=WorldTarget.copyBlock(be,edited,access).saveWithFullMetadata(access);
        WorldNbt.requireEditedFieldsRetained(before,edited,saved);checks++;
        return saved;
    }
    private static void structureViews(RegistryAccess access) {
        var conduit=new ConduitBlockEntity(BlockPos.ZERO,Blocks.CONDUIT.defaultBlockState());var conduitData=conduit.saveWithFullMetadata(access);var conduitViews=new JsonObject();BlockViews.add(conduitViews,conduit,access,conduitData);
        check(!conduitViews.getAsJsonObject("conduit").getAsJsonObject("value").get("Active").getAsBoolean(),"conduit runtime active");
        reject("invalid_request",()->BlockViews.apply(conduit,conduitData,JsonParser.parseString("{conduit:{Target:null}}").getAsJsonObject(),access));
        var gateway=new TheEndGatewayBlockEntity(BlockPos.ZERO,Blocks.END_GATEWAY.defaultBlockState());var before=gateway.saveWithFullMetadata(access);
        var views=new JsonObject();BlockViews.add(views,gateway,access,before);check(!views.has("unsupported") && views.getAsJsonObject("end_gateway").getAsJsonObject("value").get("exit_portal").isJsonNull(),"gateway supported and absent exit");
        var saved=roundtrip(gateway,before,"{end_gateway:{exit_portal:[10,64,-10],ExactTeleport:true,Age:9223372036854775807}}",access);
        check(saved.getLong("Age").orElseThrow()==Long.MAX_VALUE,"gateway long precision");
        saved=roundtrip(gateway,saved,"{end_gateway:{exit_portal:null,ExactTeleport:false,Age:-9223372036854775808}}",access);check(!saved.contains("exit_portal") && !saved.contains("ExactTeleport"),"gateway sparse removal");
        for(String fields:List.of("Age:9223372036854775808","Age:1.5","Age:null","ExactTeleport:1","exit_portal:[0,1]","exit_portal:[0,1.5,0]","exit_portal:[2147483647,0,0]"))reject("invalid_nbt",()->BlockViews.apply(gateway,before,JsonParser.parseString("{end_gateway:{"+fields+"}}").getAsJsonObject(),access));
        var structure=new StructureBlockEntity(BlockPos.ZERO,Blocks.STRUCTURE_BLOCK.defaultBlockState());var initial=structure.saveWithFullMetadata(access);
        var result=roundtrip(structure,initial,"{structure_block:{name:'minecraft:workshop',author:'editor',metadata:'test',posX:"+(-StructureBlockEntity.MAX_OFFSET_PER_AXIS)+",sizeX:"+StructureBlockEntity.MAX_SIZE_PER_AXIS+",ignoreEntities:false,powered:true,showair:true,showboundingbox:false,integrity:0.5,seed:-9223372036854775808}}",access);
        check(result.getString("author").orElseThrow().equals("editor"),"structure write");
        for(String fields:List.of("posX:"+(StructureBlockEntity.MAX_OFFSET_PER_AXIS+1),"sizeY:-1","integrity:'NaN'","name:'bad name'","mode:'bad'","author:null"))reject("invalid_nbt",()->BlockViews.apply(structure,initial,JsonParser.parseString("{structure_block:{"+fields+"}}").getAsJsonObject(),access));
        var jigsaw=new JigsawBlockEntity(BlockPos.ZERO,Blocks.JIGSAW.defaultBlockState());var jigsawBefore=jigsaw.saveWithFullMetadata(access);
        roundtrip(jigsaw,jigsawBefore,"{jigsaw:{name:'minecraft:test',target:'minecraft:target',pool:'minecraft:empty',final_state:'minecraft:stone'}}",access);
        for(var be:List.of(structure,jigsaw)) {
            var data=be.saveWithFullMetadata(access);var rows=new JsonObject();BlockViews.add(rows,be,access,data);var group=be==structure ? "structure_block" : "jigsaw";
            for(var entry:rows.getAsJsonObject(group).getAsJsonObject("schema").getAsJsonObject("fields").entrySet()) {
                var schema=entry.getValue().getAsJsonObject();if(!schema.has("candidates"))continue;
                for(var candidate:schema.getAsJsonArray("candidates")) {
                    var savedEnum=roundtrip(be,data,"{"+group+":{"+entry.getKey()+":"+candidate+"}}",access);
                    if(be==structure && entry.getKey().equals("mode") && !Objects.equals(data.get("mode"),savedEnum.get("mode")))check(BlockViews.contentState(be,data,savedEnum,be.getBlockState(),access).getValue(StructureBlock.MODE)==((StructureBlockEntity)WorldTarget.copyBlock(be,savedEnum,access)).getMode(),"structure mode synchronizes block state");
                }
                reject("invalid_nbt",()->BlockViews.apply(be,data,JsonParser.parseString("{"+group+":{"+entry.getKey()+":'__invalid__'}}").getAsJsonObject(),access));
            }
        }
        reject("invalid_nbt",()->BlockViews.apply(jigsaw,jigsawBefore,JsonParser.parseString("{jigsaw:{name:'invalid identifier'}}").getAsJsonObject(),access));
    }
    private static void sculkViews(RegistryAccess access) {
        for(var block:List.of(Blocks.SCULK_SENSOR,Blocks.CALIBRATED_SCULK_SENSOR,Blocks.SCULK_SHRIEKER)) {
            var be=((EntityBlock)block).newBlockEntity(BlockPos.ZERO,block.defaultBlockState());var before=be.saveWithFullMetadata(access);var group=be instanceof SculkSensorBlockEntity ? "sculk_sensor" : "sculk_shrieker";var key=be instanceof SculkSensorBlockEntity ? "last_vibration_frequency" : "warning_level";
            var views=new JsonObject();BlockViews.add(views,be,access,before);check(views.getAsJsonObject(group).getAsJsonObject("value").get("listener.event_delay").getAsInt()==0,"listener default");
            for(int value:new int[]{0,Integer.MAX_VALUE}) {var saved=roundtrip(be,before,"{"+group+":{'listener.event_delay':"+value+","+key+":"+value+"}}",access);check(saved.getCompound("listener").orElseThrow().getInt("event_delay").orElseThrow()==value,"listener boundary retained");check(Objects.equals(before.getCompound("listener").orElseThrow().get("selector"),saved.getCompound("listener").orElseThrow().get("selector")),"listener selector preserved");}
            roundtrip(be,before,"{"+group+":{"+key+":"+Integer.MIN_VALUE+"}}",access);
            for(String value:List.of("-1","2147483648","1.5","null","'1'"))reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{"+group+":{'listener.event_delay':"+value+"}}").getAsJsonObject(),access));
            reject("invalid_request",()->BlockViews.apply(be,before,JsonParser.parseString("{"+group+":{listener:{}}}").getAsJsonObject(),access));
        }
        for(var block:List.of(Blocks.SCULK_CATALYST,Blocks.BELL)) {
            var be=((EntityBlock)block).newBlockEntity(BlockPos.ZERO,block.defaultBlockState());var before=be.saveWithFullMetadata(access);var group=block==Blocks.BELL ? "bell" : "sculk_catalyst";var views=new JsonObject();BlockViews.add(views,be,access,before);
            for(var field:views.getAsJsonObject(group).getAsJsonObject("schema").getAsJsonObject("fields").entrySet()) {check(field.getValue().getAsJsonObject().get("read_only").getAsBoolean(),"readonly state");reject("invalid_request",()->BlockViews.apply(be,before,JsonParser.parseString("{"+group+":{"+field.getKey()+":null}}").getAsJsonObject(),access));}
            if(block==Blocks.BELL)check(!before.contains("ticks") && !before.contains("resonating"),"bell has no saved timers");
        }
    }
    private static void vaultViews(RegistryAccess access) {
        for(boolean ominous:new boolean[]{false,true}) {
            var state=Blocks.VAULT.defaultBlockState().setValue(VaultBlock.OMINOUS,ominous);
            var original=new net.minecraft.world.level.block.entity.vault.VaultBlockEntity(BlockPos.ZERO,state);
            var seeded=original.saveWithFullMetadata(access);var serverData=seeded.getCompound("server_data").orElseGet(CompoundTag::new);var rewarded=UUID.randomUUID();serverData.put("rewarded_players",net.minecraft.core.UUIDUtil.CODEC_LINKED_SET.encodeStart(NbtOps.INSTANCE,Set.of(rewarded)).getOrThrow());seeded.put("server_data",serverData);
            var be=(net.minecraft.world.level.block.entity.vault.VaultBlockEntity)WorldTarget.copyBlock(original,seeded,access);
            var before=be.saveWithFullMetadata(access);var views=new JsonObject();BlockViews.add(views,be,access,before);var value=views.getAsJsonObject("vault").getAsJsonObject("value");
            check(value.get("config.activation_range").getAsDouble()==be.getConfig().activationRange(),"vault actual default range");check(value.getAsJsonArray("server_data.rewarded_players").size()==1,"vault rewarded player read");
            var saved=roundtrip(be,before,"{vault:{'config.activation_range':2,'config.deactivation_range':3,'config.key_item':{id:'minecraft:diamond',count:2},'config.loot_table':'minecraft:chests/simple_dungeon'}}",access);
            check(Objects.equals(before.get("shared_data"),saved.get("shared_data")) && Objects.equals(before.get("server_data"),saved.get("server_data")),"vault complex state preserved");
            var copy=(net.minecraft.world.level.block.entity.vault.VaultBlockEntity)WorldTarget.copyBlock(be,saved,access);check(copy.getConfig().keyItem().getCount()==2 && copy.getConfig().activationRange()==2,"vault readback");
            var reset=saved.copy();reset.getCompound("config").orElseThrow().remove("activation_range");reset.getCompound("config").orElseThrow().remove("deactivation_range");
            var combined=roundtrip(copy,reset,"{vault:{'config.key_item':{id:'minecraft:paper',count:1}}}",access);
            check(((net.minecraft.world.level.block.entity.vault.VaultBlockEntity)WorldTarget.copyBlock(be,combined,access)).getConfig().activationRange()==original.getConfig().activationRange(),"vault SNBT reset plus view edit uses NBT baseline");
            var defaults=value.deepCopy();defaults.remove("server_data.rewarded_players");roundtrip(copy,saved,"{vault:"+defaults+"}",access);
            var cleared=roundtrip(copy,saved,"{vault:{'config.key_item':null}}",access);check(((net.minecraft.world.level.block.entity.vault.VaultBlockEntity)WorldTarget.copyBlock(be,cleared,access)).getConfig().keyItem().isEmpty(),"vault clear key");
            roundtrip(be,before,"{vault:{'config.activation_range':-1,'config.deactivation_range':-1}}",access);
            for(String fields:List.of("'config.activation_range':100","'config.activation_range':null","'config.activation_range':'1'","'config.activation_range':1e400","'config.loot_table':'bad id'","'config.key_item':{id:'minecraft:__missing__',count:1}"))reject("invalid_nbt",()->BlockViews.apply(be,before,JsonParser.parseString("{vault:{"+fields+"}}").getAsJsonObject(),access));
            for(String fields:List.of("'server_data.rewarded_players':[]","'server_data.rewarded_players':null","config:{}","shared_data:{}"))reject("invalid_request",()->BlockViews.apply(be,before,JsonParser.parseString("{vault:{"+fields+"}}").getAsJsonObject(),access));
        }
    }
    @SuppressWarnings({"rawtypes","unchecked"}) private static String propertyName(net.minecraft.world.level.block.state.properties.Property property,Object value){return property.getName((Comparable)value);}
    private static void check(boolean ok,String message){if(!ok)throw new AssertionError(message);checks++;}
    private static void reject(String code,Runnable action){try{action.run();}catch(EditorSessions.Failure e){check(code.equals(e.code),"expected "+code+" got "+e.code);return;}throw new AssertionError("expected "+code);}
}
