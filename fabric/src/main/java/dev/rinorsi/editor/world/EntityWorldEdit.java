package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.*;
import dev.rinorsi.editor.*;
import java.util.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.*;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.*;
import net.minecraft.world.entity.*;
import net.minecraft.world.entity.decoration.*;
import net.minecraft.world.entity.decoration.painting.Painting;
import net.minecraft.world.entity.npc.villager.AbstractVillager;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.*;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.util.ProblemReporter;

/** Normalized entity edits are applied to a detached real entity before the world write. */
public final class EntityWorldEdit {
    private EntityWorldEdit() {}
    static final List<String> POSES = List.of("Head","Body","LeftArm","RightArm","LeftLeg","RightLeg");
    static final Set<String> STAND_FLAGS = Set.of("ShowArms","Small","Marker","Invisible","NoBasePlate");
    static final Set<String> FRAME_FIELDS = Set.of("ItemRotation","Invisible","Fixed","ItemDropChance");
    static final Set<String> DISPLAY_FIELDS = Set.of("transformation","billboard","brightness","view_range","shadow_radius","shadow_strength","glow_color_override","interpolation_duration","start_interpolation","teleport_duration","width","height");
    static final Set<String> TEXT_FIELDS = Set.of("text","line_width","background","alignment","text_opacity","shadow","see_through","default_background");
    public static JsonObject stack(ItemStack stack, RegistryAccess access) {
        if(stack.isEmpty()){var out=new JsonObject();out.addProperty("empty",true);return out;}
        return StackCodec.snapshot(stack,access,new JsonObject(),"");
    }
    private static ItemStack decode(JsonElement json, RegistryAccess access, ItemStack original) {
        var value=json.getAsJsonObject();
        return value.has("empty")&&value.get("empty").getAsBoolean()?ItemStack.EMPTY:StackCodec.decode(value,access,original);
    }
    public static JsonObject views(Entity entity, CompoundTag saved, RegistryAccess access) {
        var out=new JsonObject();
        if(entity instanceof ArmorStand stand){
            var pose=new JsonObject();
            var rotations=List.of(stand.getHeadPose(),stand.getBodyPose(),stand.getLeftArmPose(),stand.getRightArmPose(),stand.getLeftLegPose(),stand.getRightLegPose());
            for(int i=0;i<POSES.size();i++){var r=rotations.get(i);var a=new JsonArray();a.add(r.x());a.add(r.y());a.add(r.z());pose.add(POSES.get(i),a);}
            for(String key:STAND_FLAGS)pose.addProperty(key,saved.getBoolean(key).orElse(false));
            out.add("pose",pose);
        }
        if(entity instanceof ItemFrame frame){
            var view=fields(saved,FRAME_FIELDS);view.add("item",stack(frame.getItem(),access));out.add("item_frame",view);
        }
        if(entity instanceof Painting){var view=fields(saved,Set.of("variant"));view.addProperty("facingLocked",true);out.add("painting",view);}
        if(entity instanceof Display){
            var view=fields(saved,DISPLAY_FIELDS);
            view.add("brightness",saved.contains("brightness")?json(saved.get("brightness")):JsonNull.INSTANCE);
            // This is a live synchronized trigger; vanilla deliberately omits it from save data.
            view.addProperty("start_interpolation",interpolationDelay(entity));
            if(entity instanceof Display.TextDisplay) {view.asMap().putAll(fields(saved,TEXT_FIELDS).asMap());if(saved.contains("text"))view.add("text",component(saved.get("text"),access));}
            if(entity instanceof Display.ItemDisplay){view.add("item",stack(entity.getSlot(0).get(),access));if(saved.contains("item_display"))view.add("item_display",json(saved.get("item_display")));}
            if(entity instanceof Display.BlockDisplay&&saved.contains("block_state"))view.add("block_state",json(saved.get("block_state")));
            out.add("display",view);
        }
        if(entity instanceof AbstractVillager){
            var view=new JsonObject();boolean available=entity.level() instanceof ServerLevel;view.addProperty("available",available);
            if(available){var offers=saved.contains("Offers")?MerchantOffers.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),saved.get("Offers")).getOrThrow():new MerchantOffers();view.add("offers",offers(offers,access));}
            else view.addProperty("reason","交易仅能由安装模组的 ServerLevel 读取；客户端保存不含 Offers");
            out.add("trades",view);
        }
        EntityViewsSimple.views(out,entity,saved,access);
        var riding=new JsonObject();riding.add("passengers",passengers(entity,0));
        riding.add("vehicle",entity.getVehicle()==null?JsonNull.INSTANCE:summary(entity.getVehicle()));
        riding.add("rideCheck",rideCheck());out.add("riding",riding);
        return out;
    }
    public static JsonObject rideCheck(){var result=new JsonObject();result.addProperty("mode","try-and-report");result.addProperty("staticCanRideList",false);result.addProperty("reason","canRide/canAddPassenger 动态检查");return result;}
    private static JsonObject summary(Entity e){var out=new JsonObject();out.addProperty("type",BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString());out.addProperty("uuid",e.getStringUUID());out.addProperty("summary",e.getName().getString());return out;}
    private static JsonArray passengers(Entity e,int depth){var out=new JsonArray();if(depth>=32)throw new IllegalArgumentException("乘客树超过32层");for(var p:e.getPassengers()){var row=summary(p);row.add("passengers",passengers(p,depth+1));out.add(row);}return out;}
    static JsonObject fields(CompoundTag nbt,Set<String> keys){var out=new JsonObject();for(String key:keys)if(nbt.contains(key)){if(Set.of("Invisible","Fixed","shadow","see_through","default_background").contains(key))out.addProperty(key,nbt.getBoolean(key).orElse(false));else out.add(key,json(nbt.get(key)));}return out;}
    static JsonElement json(Tag tag){return NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,tag);}
    static JsonElement component(Tag tag,RegistryAccess access){var codec=net.minecraft.network.chat.ComponentSerialization.CODEC;return codec.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),codec.parse(access.createSerializationContext(NbtOps.INSTANCE),tag).getOrThrow()).getOrThrow();}
    public static int interpolationDelay(Entity entity){try{var m=Display.class.getDeclaredMethod("getTransformationInterpolationDelay");m.setAccessible(true);return (int)m.invoke(entity);}catch(ReflectiveOperationException ex){throw new IllegalStateException(ex);}}

    /** The returned compound remains identity protected and contains current runtime state. */
    public static CompoundTag prepare(Entity source, CompoundTag input, JsonObject edit, Level level, RegistryAccess access) {
        var nbt=input.copy();
        for(String key:edit.keySet())if(!Set.of("pose","equipment","item_frame","painting","display","offers").contains(key)&&!EntityViewsSimple.supports(key))throw new IllegalArgumentException("未知实体编辑区段："+key);
        EntityViewsSimple.apply(source,nbt,edit,level,access);
        if(edit.has("pose")){
            require(source instanceof ArmorStand,"仅盔甲架提供姿态");var data=edit.getAsJsonObject("pose");
            var pose=nbt.getCompound("Pose").map(CompoundTag::copy).orElseGet(CompoundTag::new);
            for(var field:data.entrySet()){String key=field.getKey();if(POSES.contains(key)){
                Rotations rotation=Rotations.CODEC.parse(JsonOps.INSTANCE,field.getValue()).getOrThrow();
                // The real Rotations constructor normalizes angles; report that canonical value.
                pose.put(key,Rotations.CODEC.encodeStart(NbtOps.INSTANCE,rotation).getOrThrow());
            }else if(STAND_FLAGS.contains(key))nbt.putBoolean(key,bool(field.getValue()));else throw new IllegalArgumentException("未知盔甲架字段："+key);}
            nbt.put("Pose",pose);
        }
        if(edit.has("item_frame")){require(source instanceof ItemFrame,"目标不是物品展示框");var fields=edit.getAsJsonObject("item_frame");
            for(var field:fields.entrySet()){String key=field.getKey();if(key.equals("item")){var item=decode(field.getValue(),access,((ItemFrame)source).getItem());nbt.put("Item",ItemStack.OPTIONAL_CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),item).getOrThrow());}
                else if(FRAME_FIELDS.contains(key)){if(key.equals("Invisible")||key.equals("Fixed"))nbt.putBoolean(key,bool(field.getValue()));else if(key.equals("ItemRotation"))nbt.putByte(key,(byte)integer(field.getValue(),0,ItemFrame.NUM_ROTATIONS-1));else nbt.putFloat(key,finite(field.getValue()));}
                else throw new IllegalArgumentException("未知展示框字段："+key);}
        }
        if(edit.has("painting")){require(source instanceof Painting,"目标不是画");var data=edit.getAsJsonObject("painting");require(data.size()==1&&data.has("variant"),"画仅支持 variant；朝向/定位锁定");var id=Identifier.parse(data.get("variant").getAsString());access.lookupOrThrow(Registries.PAINTING_VARIANT).getOrThrow(net.minecraft.resources.ResourceKey.create(Registries.PAINTING_VARIANT,id));nbt.putString("variant",id.toString());}
        if(edit.has("display")){require(source instanceof Display,"目标不是展示实体");for(var field:edit.getAsJsonObject("display").entrySet()){
            String key=field.getKey();var value=field.getValue();
            if(key.equals("item")&&source instanceof Display.ItemDisplay){nbt.put("item",ItemStack.OPTIONAL_CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),decode(value,access,source.getSlot(0).get())).getOrThrow());continue;}
            if(key.equals("block_state")&&source instanceof Display.BlockDisplay){var state=net.minecraft.world.level.block.state.BlockState.CODEC.parse(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow();nbt.put(key,net.minecraft.world.level.block.state.BlockState.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),state).getOrThrow());continue;}
            if(key.equals("item_display")&&source instanceof Display.ItemDisplay){var context=net.minecraft.world.item.ItemDisplayContext.CODEC.parse(JsonOps.INSTANCE,value).getOrThrow();nbt.putString(key,context.getSerializedName());continue;}
            require(DISPLAY_FIELDS.contains(key)||(source instanceof Display.TextDisplay&&TEXT_FIELDS.contains(key)),"不支持的展示字段："+key);
            if(key.equals("brightness")&&value.isJsonNull()){nbt.remove(key);continue;}
            Tag typed;
            if(key.equals("transformation")){var t=com.mojang.math.Transformation.EXTENDED_CODEC.parse(JsonOps.INSTANCE,value).getOrThrow();typed=com.mojang.math.Transformation.EXTENDED_CODEC.encodeStart(NbtOps.INSTANCE,t).getOrThrow();}
            else if(key.equals("brightness")){var b=net.minecraft.util.Brightness.CODEC.parse(JsonOps.INSTANCE,value).getOrThrow();typed=net.minecraft.util.Brightness.CODEC.encodeStart(NbtOps.INSTANCE,b).getOrThrow();}
            else if(key.equals("text")){var text=net.minecraft.network.chat.ComponentSerialization.CODEC.parse(access.createSerializationContext(JsonOps.INSTANCE),value).getOrThrow();typed=net.minecraft.network.chat.ComponentSerialization.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),text).getOrThrow();}
            else if(Set.of("view_range","shadow_radius","shadow_strength","width","height").contains(key))typed=FloatTag.valueOf(finite(value));
            else if(Set.of("shadow","see_through","default_background").contains(key))typed=ByteTag.valueOf(bool(value));
            else if(key.equals("text_opacity"))typed=ByteTag.valueOf((byte)integer(value,-128,127));
            else if(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isString())typed=StringTag.valueOf(value.getAsString());
            else typed=IntTag.valueOf(integer(value,Integer.MIN_VALUE,Integer.MAX_VALUE));
            nbt.put(key,typed);
        }}
        if(edit.has("offers")){require(source instanceof AbstractVillager&&level instanceof ServerLevel,"交易写入仅支持安装模组的 ServerLevel 村民或流浪商人");require(!((AbstractVillager)source).isTrading(),"该商人正在交易，请关闭交易界面后再编辑");nbt.put("Offers",MerchantOffers.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),decodeOffers(edit.getAsJsonArray("offers"),access,nbt.get("Offers"))).getOrThrow());}
        var copy=source.getType().create(level,EntitySpawnReason.COMMAND);require(copy!=null,"实体工厂不能创建校验副本");
        load(copy,nbt,access);
        if(edit.has("equipment")){require(copy instanceof LivingEntity,"目标没有装备栏");var living=(LivingEntity)copy;var seen=new HashSet<String>();
            for(var raw:edit.getAsJsonArray("equipment")){var row=raw.getAsJsonObject();String slot=StackCodec.string(row,"slot");require(seen.add(slot),"装备槽重复");var equip=Arrays.stream(EquipmentSlot.values()).filter(s->s.getSerializedName().equals(slot)).findFirst().orElseThrow(()->new IllegalArgumentException("未知装备槽："+slot));require(living.canUseSlot(equip),"目标当前不能使用装备槽："+slot);living.setItemSlot(equip,decode(row.get("stack"),access,living.getItemBySlot(equip)));}
        }
        var prepared=WorldTarget.saveEntity(copy,access);
        if(nbt.contains("Passengers"))prepared.put("Passengers",nbt.get("Passengers").copy());
        // Only explicitly changed fields are required to survive vanilla loading. Pose/default/
        // transformation canonicalization is intentional and handled by the real codecs above.
        for(String key:nbt.keySet())if(!Objects.equals(input.get(key),nbt.get(key))&&!Set.of("Pose","start_interpolation").contains(key)&&!(key.equals("transformation")&&sameTransformation(nbt.get(key),prepared.get(key)))&&!Objects.equals(nbt.get(key),prepared.get(key)))
            EditorSessions.fail("invalid_nbt","原版加载器未保留实体字段："+key);
        if(nbt.contains("start_interpolation")){require(interpolationDelay(copy)==nbt.getInt("start_interpolation").orElseThrow(),"插值触发值未被保留");prepared.put("start_interpolation",nbt.get("start_interpolation").copy());}
        WorldNbt.protect(input,prepared,true);return prepared;
    }
    public static void load(Entity entity,CompoundTag nbt,RegistryAccess access){var problems=new ProblemReporter.Collector();entity.load(TagValueInput.create(problems,access,nbt));if(!problems.isEmpty())EditorSessions.fail("invalid_nbt","实体加载失败："+problems.getReport());}
    private static boolean sameTransformation(Tag a,Tag b){if(a==null||b==null)return a==b;var codec=com.mojang.math.Transformation.EXTENDED_CODEC;return codec.parse(NbtOps.INSTANCE,a).getOrThrow().getMatrix().equals(codec.parse(NbtOps.INSTANCE,b).getOrThrow().getMatrix(),0.00001f);}
    private static boolean bool(JsonElement value){require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isBoolean(),"字段必须为 boolean");return value.getAsBoolean();}
    private static float finite(JsonElement value){require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"字段必须为数字");float n=value.getAsFloat();require(Float.isFinite(n),"浮点数必须有限");return n;}
    private static int integer(JsonElement value,int min,int max){require(value.isJsonPrimitive()&&value.getAsJsonPrimitive().isNumber(),"字段必须为整数");try{int n=value.getAsBigDecimal().intValueExact();require(n>=min&&n<=max,"整数超出范围："+min+".."+max);return n;}catch(ArithmeticException ex){throw new IllegalArgumentException("字段必须为范围内整数");}}
    private static void require(boolean ok,String reason){if(!ok)throw new IllegalArgumentException(reason);}

    public static JsonArray offers(MerchantOffers offers,RegistryAccess access){var result=new JsonArray();for(var offer:offers){var out=new JsonObject();out.add("buy",costStack(offer.getItemCostA(),access));offer.getItemCostB().ifPresent(cost->out.add("buyB",costStack(cost,access)));out.add("sell",stack(offer.getResult(),access));out.addProperty("uses",offer.getUses());out.addProperty("maxUses",offer.getMaxUses());out.addProperty("rewardExp",offer.shouldRewardExp());out.addProperty("xp",offer.getXp());out.addProperty("priceMultiplier",offer.getPriceMultiplier());out.addProperty("demand",offer.getDemand());out.addProperty("specialPrice",offer.getSpecialPriceDiff());result.add(out);}return result;}
    private static JsonObject costStack(ItemCost cost,RegistryAccess access){var out=stack(cost.itemStack(),access);out.addProperty("cost_predicate_snbt",net.minecraft.core.component.DataComponentExactPredicate.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),cost.components()).getOrThrow().toString());return out;}
    private static ItemCost cost(ItemStack item,JsonObject wire,RegistryAccess access){
        if(wire.has("cost_predicate_snbt")){var raw=WorldNbt.parse("{value:"+StackCodec.string(wire,"cost_predicate_snbt")+"}").get("value");var predicate=net.minecraft.core.component.DataComponentExactPredicate.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),raw).getOrThrow();var cost=new ItemCost(item.typeHolder(),item.getCount(),predicate);if(StackComparison.matches(cost.itemStack(),item,access))return cost;}
        var builder=net.minecraft.core.component.DataComponentExactPredicate.builder();
        for(var entry:item.getComponentsPatch().entrySet()){require(entry.getValue().isPresent(),"交易输入 Codec 不支持移除组件条件");expect(builder,entry.getKey(),entry.getValue().orElseThrow());}
        return new ItemCost(item.typeHolder(),item.getCount(),builder.build());
    }
    @SuppressWarnings({"unchecked","rawtypes"}) private static void expect(net.minecraft.core.component.DataComponentExactPredicate.Builder builder,net.minecraft.core.component.DataComponentType type,Object value){builder.expect(type,value);}
    public static MerchantOffers decodeOffers(JsonArray rows,RegistryAccess access,Tag original){
        require(rows.size()<=256,"交易不能超过256项");var recipes=new ListTag();
        var previous=original==null?new MerchantOffers():MerchantOffers.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),original).getOrThrow();
        for(int i=0;i<rows.size();i++){var row=rows.get(i).getAsJsonObject();var recipe=new CompoundTag();var prior=i<previous.size()?previous.get(i):null;
            require(Set.of("buy","buyB","sell","uses","maxUses","rewardExp","xp","priceMultiplier","demand","specialPrice").containsAll(row.keySet()),"交易包含未知字段");
            for(String key:List.of("buy","buyB","sell")){if(key.equals("buyB")&&(!row.has(key)||row.get(key).isJsonNull()))continue;var old=prior==null?ItemStack.EMPTY:key.equals("buy")?prior.getBaseCostA():key.equals("buyB")?prior.getCostB():prior.getResult();var item=decode(row.get(key),access,old);require(!item.isEmpty(),"交易物品不能为空");
                if(key.equals("sell"))recipe.put(key,ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),item).getOrThrow());
                else {
                    // Retain unchanged ingredient predicates exactly (their absent components mean
                    // 'not constrained', which is different from all default stack components).
                    ItemCost cost=cost(item,row.getAsJsonObject(key),access);
                    recipe.put(key,ItemCost.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),cost).getOrThrow());
                }
            }
            for(String key:List.of("uses","maxUses","xp","demand","specialPrice"))recipe.putInt(key,integer(row.get(key),Integer.MIN_VALUE,Integer.MAX_VALUE));
            recipe.putBoolean("rewardExp",bool(row.get("rewardExp")));recipe.putFloat("priceMultiplier",finite(row.get("priceMultiplier")));
            recipes.add(recipe);
        }
        // The live Offers codec determines both format and bounds; no handwritten trade codec.
        var tag=new CompoundTag();tag.put("Recipes",recipes);
        return MerchantOffers.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),tag).getOrThrow();
    }
}
