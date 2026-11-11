package dev.rinorsi.editor.world;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import dev.rinorsi.editor.*;
import java.util.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.network.protocol.game.*;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.*;
import net.minecraft.world.Container;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.ai.attributes.*;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;

/** Online players are never passed to Entity.load. Session data is an editable projection. */
public final class PlayerWorldEdit {
    private PlayerWorldEdit() {}
    private static final Gson JSON = new GsonBuilder().serializeNulls().create();
    private static final Set<String> FIELDS=Set.of("container","ender","SelectedItemSlot","Health","AbsorptionAmount","food","experience","playerGameType","abilities","attributes","active_effects","Tags","CustomName");
    public static void requirePermission(PermissionSet permissions) {
        if(!permissions.hasPermission(Permissions.COMMANDS_GAMEMASTER)) EditorSessions.fail("player_forbidden","编辑自己或其他玩家需要原版游戏管理员权限");
    }
    public static void requireOnline(boolean online) { if(!online) EditorSessions.fail("player_offline","目标玩家不在线或不存在"); }
    public static JsonObject values(Player p) {
        var out=new JsonObject();var access=p.registryAccess();
        out.add("container",container(p.getInventory(),p));out.add("ender",container(p.getEnderChestInventory(),p));
        out.addProperty("SelectedItemSlot",p.getInventory().getSelectedSlot());out.addProperty("Health",p.getHealth());out.addProperty("AbsorptionAmount",p.getAbsorptionAmount());
        var food=new JsonObject();food.addProperty("foodLevel",p.getFoodData().getFoodLevel());food.addProperty("saturation",p.getFoodData().getSaturationLevel());out.add("food",food);
        var xp=new JsonObject();xp.addProperty("XpLevel",p.experienceLevel);xp.addProperty("XpP",p.experienceProgress);xp.addProperty("XpTotal",p.totalExperience);out.add("experience",xp);
        out.addProperty("playerGameType",p.gameMode().getName());var a=p.getAbilities();var abilities=new JsonObject();
        abilities.addProperty("flying",a.flying);abilities.addProperty("mayfly",a.mayfly);abilities.addProperty("invulnerable",a.invulnerable);abilities.addProperty("mayBuild",a.mayBuild);abilities.addProperty("instabuild",a.instabuild);abilities.addProperty("walkSpeed",a.getWalkingSpeed());abilities.addProperty("flySpeed",a.getFlyingSpeed());out.add("abilities",abilities);
        var attrs=new JsonArray();for(var h:BuiltInRegistries.ATTRIBUTE.listElements().toList()) if(p.getAttributes().hasAttribute(h)){var row=new JsonObject();row.addProperty("id",h.key().identifier().toString());row.addProperty("base",p.getAttributeBaseValue(h));row.add("modifiers",AttributeModifier.CODEC.listOf().encodeStart(access.createSerializationContext(JsonOps.INSTANCE),p.getAttribute(h).getPermanentModifiers().stream().sorted(Comparator.comparing(m->m.id().toString())).toList()).getOrThrow());attrs.add(row);}out.add("attributes",attrs);
        var effects=new JsonArray();for(var effect:p.getActiveEffects())effects.add(MobEffectInstance.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),effect).getOrThrow());out.add("active_effects",sorted(effects));
        var tags=new JsonArray();new TreeSet<>(p.entityTags()).forEach(tags::add);out.add("Tags",tags);
        out.add("CustomName",p.getCustomName()==null?JsonNull.INSTANCE:ComponentSerialization.CODEC.encodeStart(access.createSerializationContext(JsonOps.INSTANCE),p.getCustomName()).getOrThrow());return out;
    }
    private static JsonObject container(Container c,Player p){var out=new JsonObject();out.addProperty("size",c.getContainerSize());var slots=new JsonArray();for(int i=0;i<c.getContainerSize();i++){var row=new JsonObject();row.addProperty("slot",i);row.add("stack",stack(c.getItem(i),p));slots.add(row);}out.add("slots",slots);return out;}
    private static JsonObject stack(ItemStack s,Player p){if(!s.isEmpty())return StackCodec.snapshot(s,p.registryAccess(),new JsonObject(),"");var e=new JsonObject();e.addProperty("empty",true);return e;}
    public static CompoundTag save(Player p){var out=new CompoundTag();out.putString("id","minecraft:player");out.putString("UUID",p.getStringUUID());var pos=new ListTag();pos.add(DoubleTag.valueOf(p.getX()));pos.add(DoubleTag.valueOf(p.getY()));pos.add(DoubleTag.valueOf(p.getZ()));out.put("Pos",pos);out.putString("cad_player",JSON.toJson(values(p)));return out;}
    public static JsonObject data(CompoundTag tag){return JsonParser.parseString(tag.getString("cad_player").orElseThrow()).getAsJsonObject();}
    public static CompoundTag with(CompoundTag tag,JsonObject data){var out=tag.copy();out.putString("cad_player",JSON.toJson(data));return out;}
    public static CompoundTag prepare(Player p,CompoundTag desired,JsonObject request){
        var next=data(desired);
        if(!request.isEmpty()){
            for(String key:request.keySet())if(!key.equals("entity")&&!Set.of("op","slot","requestId","revision").contains(key))EditorSessions.fail("protected_field","玩家仅接受 entity.player 规范化编辑");
            var entity=StackCodec.object(request,"entity");keys(entity,Set.of("player"));var patch=StackCodec.object(entity,"player");keys(patch,FIELDS);
            for(var entry:patch.entrySet()){String key=entry.getKey();var value=entry.getValue();
                if(key.equals("container")||key.equals("ender")) patchContainer(next.getAsJsonObject(key),value.getAsJsonObject(),key.equals("container")?p.getInventory():p.getEnderChestInventory(),p);
                else if(key.equals("attributes")){var rows=next.getAsJsonArray(key);var seen=new HashSet<String>();for(var raw:value.getAsJsonArray()){var row=raw.getAsJsonObject();keys(row,Set.of("id","base","modifiers"));String id=StackCodec.string(row,"id");if(!seen.add(id))fail("属性重复");var target=find(rows,id);if(target==null)fail("玩家不支持该属性："+id);if(row.has("base"))target.add("base",row.get("base"));if(row.has("modifiers"))target.add("modifiers",row.get("modifiers"));}}
                else if(Set.of("food","experience","abilities").contains(key)){var obj=value.getAsJsonObject();keys(obj,next.getAsJsonObject(key).keySet());for(var e:obj.entrySet())next.getAsJsonObject(key).add(e.getKey(),e.getValue().deepCopy());}
                else next.add(key,value.deepCopy());
            }
        }
        if(!request.isEmpty()&&request.getAsJsonObject("entity").getAsJsonObject("player").has("playerGameType")){
            var mode=Arrays.stream(GameType.values()).filter(g->g.getName().equals(next.get("playerGameType").getAsString())).findFirst().orElseThrow();
            var a=new net.minecraft.world.entity.player.Abilities();mode.updatePlayerAbilities(a);var b=next.getAsJsonObject("abilities");
            var explicit=request.getAsJsonObject("entity").getAsJsonObject("player").has("abilities")?request.getAsJsonObject("entity").getAsJsonObject("player").getAsJsonObject("abilities"):new JsonObject();
            if(!explicit.has("flying"))b.addProperty("flying",a.flying);if(!explicit.has("mayfly"))b.addProperty("mayfly",a.mayfly);if(!explicit.has("invulnerable"))b.addProperty("invulnerable",a.invulnerable);if(!explicit.has("mayBuild"))b.addProperty("mayBuild",a.mayBuild);if(!explicit.has("instabuild"))b.addProperty("instabuild",a.instabuild);
        }
        validate(next,p);canonicalize(next,p);return with(desired,next);
    }
    /** Normalize only native representations: float precision, Codec defaults and unordered IDs. */
    private static void canonicalize(JsonObject n,Player p){
        for(String key:List.of("Health","AbsorptionAmount"))n.addProperty(key,n.get(key).getAsFloat());
        n.getAsJsonObject("food").addProperty("saturation",n.getAsJsonObject("food").get("saturation").getAsFloat());
        n.getAsJsonObject("experience").addProperty("XpP",n.getAsJsonObject("experience").get("XpP").getAsFloat());
        for(String key:List.of("walkSpeed","flySpeed"))n.getAsJsonObject("abilities").addProperty(key,n.getAsJsonObject("abilities").get(key).getAsFloat());
        var ops=p.registryAccess().createSerializationContext(JsonOps.INSTANCE);var effects=new JsonArray();
        for(var raw:n.getAsJsonArray("active_effects"))effects.add(MobEffectInstance.CODEC.encodeStart(ops,MobEffectInstance.CODEC.parse(ops,raw).getOrThrow()).getOrThrow());n.add("active_effects",sorted(effects));
        for(var raw:n.getAsJsonArray("attributes")){var row=raw.getAsJsonObject();if(row.has("modifiers"))row.add("modifiers",AttributeModifier.CODEC.listOf().encodeStart(ops,AttributeModifier.CODEC.listOf().parse(ops,row.get("modifiers")).getOrThrow().stream().sorted(Comparator.comparing(m->m.id().toString())).toList()).getOrThrow());}
        var tags=new TreeSet<String>();n.getAsJsonArray("Tags").forEach(v->tags.add(v.getAsString()));var array=new JsonArray();tags.forEach(array::add);n.add("Tags",array);
        if(!n.get("CustomName").isJsonNull())n.add("CustomName",ComponentSerialization.CODEC.encodeStart(ops,ComponentSerialization.CODEC.parse(ops,n.get("CustomName")).getOrThrow()).getOrThrow());
    }
    private static JsonArray sorted(JsonArray rows){var list=new ArrayList<JsonElement>();rows.forEach(list::add);list.sort(Comparator.comparing(r->r.getAsJsonObject().get("id").getAsString()));var out=new JsonArray();list.forEach(out::add);return out;}
    private static void patchContainer(JsonObject next,JsonObject patch,Container original,Player p){keys(patch,Set.of("slots"));var seen=new HashSet<Integer>();for(var raw:patch.getAsJsonArray("slots")){var row=raw.getAsJsonObject();keys(row,Set.of("slot","stack"));int i=StackCodec.integer(row,"slot",0,original.getContainerSize()-1);if(!seen.add(i))fail("槽位重复");var baseline=decode(next.getAsJsonArray("slots").get(i).getAsJsonObject().getAsJsonObject("stack"),ItemStack.EMPTY,p);var item=decode(StackCodec.object(row,"stack"),baseline,p);next.getAsJsonArray("slots").get(i).getAsJsonObject().add("stack",stack(item,p));}}
    private static ItemStack decode(JsonObject row,ItemStack original,Player p){if(row.has("empty"))bool(row,"empty");var item=row.has("empty")&&row.get("empty").getAsBoolean()?ItemStack.EMPTY:StackCodec.decode(row,p.registryAccess(),original);if(!item.isEmpty()){ItemStack.validateStrict(item).getOrThrow();if(item.getCount()>item.getMaxStackSize())EditorSessions.fail("slot_invalid","物品数量超过堆叠上限");}return item;}
    public static double number(JsonObject o,String key,double min,double max){var v=o.get(key);if(v==null||!v.isJsonPrimitive()||!v.getAsJsonPrimitive().isNumber())throw new EditorSessions.Failure("invalid_request",key+" 必须为数字");double n=v.getAsDouble();if(!Double.isFinite(n)||n<min||n>max)fail(key+" 超出范围 ["+min+","+max+"]");return n;}
    private static boolean bool(JsonObject o,String key){var v=o.get(key);if(v==null||!v.isJsonPrimitive()||!v.getAsJsonPrimitive().isBoolean())fail(key+" 必须为布尔值");return v.getAsBoolean();}
    private static void keys(JsonObject o,Set<String> allowed){for(String key:o.keySet())if(!allowed.contains(key))EditorSessions.fail("protected_field","不支持的玩家字段："+key);}
    private static void fail(String message){EditorSessions.fail("invalid_request",message);}
    private static JsonObject find(JsonArray rows,String id){for(var raw:rows)if(raw.getAsJsonObject().get("id").getAsString().equals(id))return raw.getAsJsonObject();return null;}
    private static void validate(JsonObject n,Player p){
        keys(n,FIELDS);StackCodec.integer(n,"SelectedItemSlot",0,net.minecraft.world.entity.player.Inventory.getSelectionSize()-1);
        var attributes=n.getAsJsonArray("attributes");double max=p.getMaxHealth();for(var raw:attributes){var row=raw.getAsJsonObject();var h=BuiltInRegistries.ATTRIBUTE.get(Identifier.parse(StackCodec.string(row,"id"))).orElseThrow();if(!p.getAttributes().hasAttribute(h))fail("玩家不支持该属性");double base=number(row,"base",h.value() instanceof RangedAttribute r?r.getMinValue():-Double.MAX_VALUE,h.value() instanceof RangedAttribute r?r.getMaxValue():Double.MAX_VALUE);var preview=new AttributeInstance(h,x->{});preview.replaceFrom(p.getAttribute(h));preview.setBaseValue(base);if(row.has("modifiers")){for(var m:new ArrayList<>(preview.getPermanentModifiers()))preview.removeModifier(m);var mods=AttributeModifier.CODEC.listOf().parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),row.get("modifiers")).getOrThrow();var ids=new HashSet<Identifier>();for(var m:mods){if(!Double.isFinite(m.amount())||!ids.add(m.id()))fail("属性修饰符重复或数值无效");preview.addPermanentModifier(m);}}if(h.is(Attributes.MAX_HEALTH))max=preview.getValue();if(h.is(Attributes.MAX_ABSORPTION))number(n,"AbsorptionAmount",0,preview.getValue());}
        number(n,"Health",0,max);number(n,"AbsorptionAmount",0,Float.MAX_VALUE);var food=n.getAsJsonObject("food");int level=StackCodec.integer(food,"foodLevel",0,20);number(food,"saturation",0,level);
        var xp=n.getAsJsonObject("experience");StackCodec.integer(xp,"XpLevel",0,Integer.MAX_VALUE);StackCodec.integer(xp,"XpTotal",0,Integer.MAX_VALUE);number(xp,"XpP",0,Math.nextDown(1.0f));
        if(Arrays.stream(GameType.values()).noneMatch(g->g.getName().equals(n.get("playerGameType").getAsString())))fail("未知游戏模式");
        var a=n.getAsJsonObject("abilities");for(String k:List.of("flying","mayfly","invulnerable","mayBuild","instabuild"))bool(a,k);number(a,"walkSpeed",0,1);number(a,"flySpeed",0,1);if(bool(a,"flying")&&!bool(a,"mayfly"))fail("flying 需要 mayfly");
        var seen=new HashSet<Object>();for(var raw:n.getAsJsonArray("active_effects")){var e=MobEffectInstance.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),raw).getOrThrow();if(!seen.add(e.getEffect()))fail("效果重复");}
        seen.clear();for(var raw:n.getAsJsonArray("Tags")){if(!raw.isJsonPrimitive()||!raw.getAsJsonPrimitive().isString()||!seen.add(raw.getAsString()))fail("标签必须为不重复的字符串");}if(seen.size()>net.minecraft.world.entity.Entity.MAX_ENTITY_TAG_COUNT)fail("标签不能超过原版1024上限");
        if(!n.get("CustomName").isJsonNull())ComponentSerialization.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),n.get("CustomName")).getOrThrow();
        for(String key:List.of("container","ender")){Container c=key.equals("container")?p.getInventory():p.getEnderChestInventory();var rows=n.getAsJsonObject(key).getAsJsonArray("slots");if(rows.size()!=c.getContainerSize())fail("容器格数不匹配");for(int i=0;i<rows.size();i++)decode(rows.get(i).getAsJsonObject().getAsJsonObject("stack"),c.getItem(i),p);}
    }
    public static void write(ServerPlayer p,CompoundTag tag){
        var n=data(tag);validate(n,p);var old=values(p);
        if(!n.get("playerGameType").equals(old.get("playerGameType")))p.setGameMode(Arrays.stream(GameType.values()).filter(g->g.getName().equals(n.get("playerGameType").getAsString())).findFirst().orElseThrow());
        for(var raw:n.getAsJsonArray("attributes")){var row=raw.getAsJsonObject();var instance=p.getAttribute(BuiltInRegistries.ATTRIBUTE.get(Identifier.parse(row.get("id").getAsString())).orElseThrow());instance.setBaseValue(row.get("base").getAsDouble());if(row.has("modifiers")){for(var m:new ArrayList<>(instance.getPermanentModifiers()))instance.removeModifier(m);for(var m:AttributeModifier.CODEC.listOf().parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),row.get("modifiers")).getOrThrow())instance.addPermanentModifier(m);}}
        for(String key:List.of("container","ender")){Container c=key.equals("container")?p.getInventory():p.getEnderChestInventory();var rows=n.getAsJsonObject(key).getAsJsonArray("slots");for(int i=0;i<rows.size();i++){var next=decode(rows.get(i).getAsJsonObject().getAsJsonObject("stack"),c.getItem(i),p);if(!StackComparison.matches(next,c.getItem(i),p.registryAccess())){c.setItem(i,next);if(key.equals("container"))p.connection.send(p.getInventory().createInventoryUpdatePacket(i));}}c.setChanged();}
        p.getInventory().setSelectedSlot(n.get("SelectedItemSlot").getAsInt());
        if(!n.get("active_effects").equals(old.get("active_effects"))){p.removeAllEffects();for(var raw:n.getAsJsonArray("active_effects"))p.addEffect(MobEffectInstance.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),raw).getOrThrow());}
        p.setHealth(n.get("Health").getAsFloat());p.setAbsorptionAmount(n.get("AbsorptionAmount").getAsFloat());var food=n.getAsJsonObject("food");p.getFoodData().setFoodLevel(food.get("foodLevel").getAsInt());p.getFoodData().setSaturation(food.get("saturation").getAsFloat());
        var xp=n.getAsJsonObject("experience");if(!xp.equals(old.get("experience"))){p.setExperienceLevels(xp.get("XpLevel").getAsInt());p.experienceProgress=xp.get("XpP").getAsFloat();p.totalExperience=xp.get("XpTotal").getAsInt();}
        var a=p.getAbilities();var b=n.getAsJsonObject("abilities");a.flying=bool(b,"flying");a.mayfly=bool(b,"mayfly");a.invulnerable=bool(b,"invulnerable");a.mayBuild=bool(b,"mayBuild");a.instabuild=bool(b,"instabuild");a.setWalkingSpeed(b.get("walkSpeed").getAsFloat());a.setFlyingSpeed(b.get("flySpeed").getAsFloat());p.onUpdateAbilities();
        for(String s:new HashSet<>(p.entityTags()))p.removeTag(s);for(var s:n.getAsJsonArray("Tags"))p.addTag(s.getAsString());p.setCustomName(n.get("CustomName").isJsonNull()?null:ComponentSerialization.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),n.get("CustomName")).getOrThrow());
        p.inventoryMenu.broadcastChanges();p.containerMenu.broadcastChanges();
        p.connection.send(new ClientboundSetHeldSlotPacket(p.getInventory().getSelectedSlot()));p.connection.send(new ClientboundSetExperiencePacket(p.experienceProgress,p.totalExperience,p.experienceLevel));p.connection.send(new ClientboundSetHealthPacket(p.getHealth(),p.getFoodData().getFoodLevel(),p.getFoodData().getSaturationLevel()));
        var sync=new ArrayList<AttributeInstance>();for(var h:BuiltInRegistries.ATTRIBUTE.listElements().toList())if(h.value().isClientSyncable()&&p.getAttributes().hasAttribute(h))sync.add(p.getAttribute(h));p.connection.send(new ClientboundUpdateAttributesPacket(p.getId(),sync));
    }
    public static void writeDetached(Player p,CompoundTag tag){
        if(p instanceof ServerPlayer sp && sp.connection!=null)throw new IllegalArgumentException("仅可修改未连接的临时玩家");
        var n=data(tag);validate(n,p);var old=values(p);
        var mode=Arrays.stream(GameType.values()).filter(g->g.getName().equals(n.get("playerGameType").getAsString())).findFirst().orElseThrow();
        if(p instanceof ServerPlayer sp){if(sp.gameMode()!=mode)sp.gameMode.setGameModeForPlayer(mode,sp.gameMode());}
        else if(p instanceof ProjectionPlayer projection)projection.mode=mode;
        else throw new IllegalArgumentException("需要独立玩家投影");
        for(var raw:n.getAsJsonArray("attributes")){var row=raw.getAsJsonObject();var instance=p.getAttribute(BuiltInRegistries.ATTRIBUTE.get(Identifier.parse(row.get("id").getAsString())).orElseThrow());instance.setBaseValue(row.get("base").getAsDouble());if(row.has("modifiers")){for(var m:new ArrayList<>(instance.getPermanentModifiers()))instance.removeModifier(m);for(var m:AttributeModifier.CODEC.listOf().parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),row.get("modifiers")).getOrThrow())instance.addPermanentModifier(m);}}
        for(String key:List.of("container","ender")){Container c=key.equals("container")?p.getInventory():p.getEnderChestInventory();var rows=n.getAsJsonObject(key).getAsJsonArray("slots");for(int i=0;i<rows.size();i++){var next=decode(rows.get(i).getAsJsonObject().getAsJsonObject("stack"),c.getItem(i),p);if(!StackComparison.matches(next,c.getItem(i),p.registryAccess())){c.setItem(i,next);}}c.setChanged();}
        p.getInventory().setSelectedSlot(n.get("SelectedItemSlot").getAsInt());
        if(!n.get("active_effects").equals(old.get("active_effects"))){
            for(var effect:p.getActiveEffects())effect.getEffect().value().removeAttributeModifiers(p.getAttributes());
            p.getActiveEffectsMap().clear();
            for(var raw:n.getAsJsonArray("active_effects")){var effect=MobEffectInstance.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),raw).getOrThrow();p.getActiveEffectsMap().put(effect.getEffect(),effect);effect.getEffect().value().addAttributeModifiers(p.getAttributes(),effect.getAmplifier());}
        }
        p.setHealth(n.get("Health").getAsFloat());p.setAbsorptionAmount(n.get("AbsorptionAmount").getAsFloat());var food=n.getAsJsonObject("food");p.getFoodData().setFoodLevel(food.get("foodLevel").getAsInt());p.getFoodData().setSaturation(food.get("saturation").getAsFloat());
        var xp=n.getAsJsonObject("experience");if(!xp.equals(old.get("experience"))){p.experienceLevel=xp.get("XpLevel").getAsInt();p.experienceProgress=xp.get("XpP").getAsFloat();p.totalExperience=xp.get("XpTotal").getAsInt();}
        var a=p.getAbilities();var b=n.getAsJsonObject("abilities");a.flying=bool(b,"flying");a.mayfly=bool(b,"mayfly");a.invulnerable=bool(b,"invulnerable");a.mayBuild=bool(b,"mayBuild");a.instabuild=bool(b,"instabuild");a.setWalkingSpeed(b.get("walkSpeed").getAsFloat());a.setFlyingSpeed(b.get("flySpeed").getAsFloat());
        for(String s:new HashSet<>(p.entityTags()))p.removeTag(s);for(var s:n.getAsJsonArray("Tags"))p.addTag(s.getAsString());p.setCustomName(n.get("CustomName").isJsonNull()?null:ComponentSerialization.CODEC.parse(p.registryAccess().createSerializationContext(JsonOps.INSTANCE),n.get("CustomName")).getOrThrow());
    }
    /** Never registered, ticked or connected; only native defaults and serialization. */
    public static final class ProjectionPlayer extends Player {
        private GameType mode=GameType.SURVIVAL;
        public ProjectionPlayer(net.minecraft.world.level.Level level,UUID uuid){super(level,new com.mojang.authlib.GameProfile(uuid,"PresetEditor"));}
        @Override public GameType gameMode(){return mode;}
    }
    public static JsonObject snapshot(Player p,CompoundTag nbt,JsonObject slot,JsonObject metadata,String revision){
        var out=new JsonObject();out.add("slot",slot.deepCopy());out.addProperty("kind","entity");out.addProperty("type","minecraft:player");out.addProperty("canUndo",false);out.addProperty("revision",revision);
        out.addProperty("snbt",nbt.toString());out.add("nbt",NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE,nbt));out.add("player",metadata.deepCopy());
        var values=data(nbt);values.add("schema",schema(p));var views=new JsonObject();views.add("player",values);out.add("views",views);
        var equipment=new JsonArray();for(var e:net.minecraft.world.entity.EquipmentSlot.values()){var row=new JsonObject();row.addProperty("slot",e.getSerializedName());row.add("stack",stack(p.getItemBySlot(e),p));equipment.add(row);}out.add("equipment",equipment);return out;
    }
    public static CompoundTag stable(CompoundTag tag){var data=data(tag);data.getAsJsonObject("experience").remove("XpP");for(var raw:data.getAsJsonArray("active_effects"))stableEffect(raw.getAsJsonObject());return with(tag,data);}
    private static void stableEffect(JsonObject e){if(e.has("duration"))e.addProperty("duration",Integer.signum(e.get("duration").getAsInt()));if(e.has("hidden_effect"))stableEffect(e.getAsJsonObject("hidden_effect"));}
    public static CompoundTag rebase(CompoundTag baseline,CompoundTag requested,CompoundTag current,boolean undo){var n=data(requested);var old=data(baseline);var live=data(current);
        var xp=n.getAsJsonObject("experience");if(Objects.equals(xp.get("XpP"),old.getAsJsonObject("experience").get("XpP")))xp.add("XpP",live.getAsJsonObject("experience").get("XpP"));
        for(var raw:n.getAsJsonArray("active_effects")){var e=raw.getAsJsonObject();var b=find(old.getAsJsonArray("active_effects"),e.get("id").getAsString());var l=find(live.getAsJsonArray("active_effects"),e.get("id").getAsString());if(b!=null&&l!=null)mergeDuration(e,b,l);}
        var result=with(requested,n);result.put("Pos",current.get("Pos").copy());return result;
    }
    private static void mergeDuration(JsonObject edit,JsonObject baseline,JsonObject current){if(current.has("duration")&&Objects.equals(edit.get("duration"),baseline.get("duration")))edit.add("duration",current.get("duration"));if(edit.has("hidden_effect")&&baseline.has("hidden_effect")&&current.has("hidden_effect"))mergeDuration(edit.getAsJsonObject("hidden_effect"),baseline.getAsJsonObject("hidden_effect"),current.getAsJsonObject("hidden_effect"));}
    public static JsonObject schema(){var out=new JsonObject();out.addProperty("source","Player.createAttributes / live registries / native containers");var modes=new JsonArray();for(var g:GameType.values())modes.add(g.getName());out.add("gameModes",modes);out.addProperty("selectedSlotMax",net.minecraft.world.entity.player.Inventory.getSelectionSize()-1);var attrs=new JsonArray();var defaults=Player.createAttributes().build();for(var h:BuiltInRegistries.ATTRIBUTE.listElements().toList())if(defaults.hasAttribute(h)){var row=new JsonObject();row.addProperty("id",h.key().identifier().toString());row.addProperty("base",defaults.getBaseValue(h));if(h.value() instanceof RangedAttribute r){row.addProperty("min",r.getMinValue());row.addProperty("max",r.getMaxValue());}attrs.add(row);}out.add("attributes",attrs);out.addProperty("effectsRegistry","minecraft:mob_effect");out.addProperty("effectsCodec","MobEffectInstance.CODEC");out.addProperty("speedMax",1);
        out.addProperty("inventorySize",net.minecraft.world.entity.player.Inventory.INVENTORY_SIZE+net.minecraft.world.entity.player.Inventory.EQUIPMENT_SLOT_MAPPING.size());
        out.addProperty("enderSize",new net.minecraft.world.inventory.PlayerEnderChestContainer().getContainerSize());
        var mapping=new JsonArray();for(var entry:net.minecraft.world.entity.player.Inventory.EQUIPMENT_SLOT_MAPPING.int2ObjectEntrySet()){var row=new JsonObject();row.addProperty("slot",entry.getIntKey());row.addProperty("equipment",entry.getValue().getSerializedName());mapping.add(row);}out.add("equipmentSlots",mapping);
        var bounds=new JsonObject();bounds.add("Health",range(0,Float.MAX_VALUE,"effective minecraft:max_health"));bounds.add("AbsorptionAmount",range(0,Float.MAX_VALUE,"effective minecraft:max_absorption"));bounds.add("food.foodLevel",range(0,20,"FoodData vanilla scale"));bounds.add("food.saturation",range(0,20,"<= requested foodLevel"));bounds.add("experience.XpLevel",range(0,Integer.MAX_VALUE,"native nonnegative int / experience set levels"));bounds.add("experience.XpTotal",range(0,Integer.MAX_VALUE,"native integer range"));bounds.add("experience.XpP",range(0,Math.nextDown(1.0f),"native float progress in [0,1); command-only backend uses whole points"));bounds.add("abilities.walkSpeed",range(0,1,"editor safety limit"));bounds.add("abilities.flySpeed",range(0,1,"editor safety limit"));out.add("bounds",bounds);
        // Player.getXpNeededForNextLevel uses int arithmetic: 112 + (level - 30) * 9.
        // Levels can be stored above this threshold, but vanilla point calculations overflow.
        out.addProperty("xpLevelCostOverflowAbove",30+(Integer.MAX_VALUE-112)/9);
        var effects=new JsonObject();effects.addProperty("registry","minecraft:mob_effect");effects.addProperty("codec","MobEffectInstance.CODEC");effects.addProperty("shape","{id,amplifier?,duration?,ambient?,show_particles?,show_icon?,hidden_effect?}");effects.add("amplifier",range(MobEffectInstance.MIN_AMPLIFIER,MobEffectInstance.MAX_AMPLIFIER,"native codec"));effects.addProperty("infiniteDuration",MobEffectInstance.INFINITE_DURATION);out.add("effects",effects);return out;}
    private static JsonObject range(double min,double max,String source){var row=new JsonObject();row.addProperty("min",min);row.addProperty("max",max);row.addProperty("source",source);return row;}
    public static JsonObject schema(Player p){
        var out=schema();out.addProperty("inventorySize",p.getInventory().getContainerSize());out.addProperty("enderSize",p.getEnderChestInventory().getContainerSize());
        out.getAsJsonObject("bounds").add("Health",range(0,p.getMaxHealth(),"effective minecraft:max_health; recalculated during apply"));
        out.getAsJsonObject("bounds").add("AbsorptionAmount",range(0,p.getMaxAbsorption(),"effective minecraft:max_absorption; recalculated during apply"));
        var ops=p.registryAccess().createSerializationContext(JsonOps.INSTANCE);
        for(var raw:out.getAsJsonArray("attributes")){
            var row=raw.getAsJsonObject();var holder=BuiltInRegistries.ATTRIBUTE.get(Identifier.parse(row.get("id").getAsString())).orElseThrow();
            var instance=p.getAttribute(holder);if(instance==null)continue;
            row.add("transientModifiers",AttributeModifier.CODEC.listOf().encodeStart(ops,instance.getModifiers().stream().filter(m->!instance.getPermanentModifiers().contains(m)).toList()).getOrThrow());
            row.addProperty("effective",instance.getValue());
        }
        out.addProperty("linkedAttributeLimits",true);return out;
    }
    public static JsonObject entitySchema(){var out=new JsonObject();out.addProperty("id","minecraft:player");out.addProperty("available",true);out.addProperty("canBePreviewed",false);out.addProperty("defaults_source","Player.createAttributes");for(String key:List.of("variants","equipment","flags","extras","warnings"))out.add(key,new JsonArray());var schema=schema();out.add("attributes",schema.get("attributes").deepCopy());out.add("effects",schema.get("effects").deepCopy());var views=new JsonObject();views.add("player",schema);out.add("views",views);return out;}
}
