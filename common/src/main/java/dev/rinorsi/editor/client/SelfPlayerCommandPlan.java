package dev.rinorsi.editor.client;

import com.google.gson.*;
import dev.rinorsi.editor.StackCodec;
import java.math.BigDecimal;
import java.util.*;
import java.util.function.*;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.*;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.ai.attributes.RangedAttribute;
import net.minecraft.world.level.GameType;

/** One self-only vanilla command, independent pre/post authority predicates, no NBT writes. */
record SelfPlayerCommandPlan(String command, Predicate<CompoundTag> before,
        Predicate<CompoundTag> after, BiConsumer<JsonObject,CompoundTag> project) {
    static SelfPlayerCommandPlan create(Minecraft mc,JsonObject baseline,JsonObject patch) {
        if(patch.size()!=1)throw bad("每次只提交一个操作；不支持多命令原子提交");
        String key=patch.keySet().iterator().next();
        return switch(key){
            case "playerGameType" -> mode(mc,baseline,patch);
            case "experience" -> experience(mc,baseline,StackCodec.object(patch,key));
            case "commandPosition" -> position(mc,baseline,StackCodec.object(patch,key));
            case "attributes" -> attribute(mc,baseline,patch.getAsJsonArray(key));
            default -> throw bad("此字段需要服务端 Editor；草稿保留");
        };
    }
    private static SelfPlayerCommandPlan mode(Minecraft mc,JsonObject baseline,JsonObject patch){
        require(mc,"gamemode");
        var next=Arrays.stream(GameType.values()).filter(m->m.getName().equals(StackCodec.string(patch,"playerGameType"))).findFirst().orElseThrow(()->bad("未知游戏模式"));
        var old=Arrays.stream(GameType.values()).filter(m->m.getName().equals(baseline.get("playerGameType").getAsString())).findFirst().orElseThrow();
        return new SelfPlayerCommandPlan("gamemode "+next.getName()+" @s",
                t->integer(t,"playerGameType")==old.getId(),t->integer(t,"playerGameType")==next.getId(),
                (v,t)->v.addProperty("playerGameType",next.getName()));
    }
    private static SelfPlayerCommandPlan experience(Minecraft mc,JsonObject baseline,JsonObject patch){
        require(mc,"experience","set");
        if(patch.size()!=1)throw bad("等级与本级点数须分开提交；经验总量不由 set 命令修改");
        var old=baseline.getAsJsonObject("experience");int level=old.get("XpLevel").getAsInt();
        if(patch.has("XpLevel")){
            int next=integer(patch,"XpLevel",0,Integer.MAX_VALUE);
            return new SelfPlayerCommandPlan("experience set @s "+next+" levels",t->integer(t,"XpLevel")==level,
                    t->integer(t,"XpLevel")==next,SelfPlayerCommandPlan::projectXp);
        }
        if(!patch.has("XpP"))throw bad("经验总量需要服务端 Editor；原版 set points 不修改 XpTotal");
        // Ask the actual player API, never duplicate the level formula in the UI.
        if(mc.player.experienceLevel!=level)throw bad("当前等级已改变，请重新打开核对点数范围");
        int needed=mc.player.getXpNeededForNextLevel();if(needed<=0)throw bad("无法取得本等级点数范围");
        double requested=number(patch,"XpP",0,Math.nextDown(1.0));
        int points=quantizePoints(requested,needed);
        float expected=(float)points/(float)needed, before=old.get("XpP").getAsFloat();
        return new SelfPlayerCommandPlan("experience set @s "+points+" points",
                t->integer(t,"XpLevel")==level&&sameFloat(floating(t,"XpP"),before),
                t->integer(t,"XpLevel")==level&&sameFloat(floating(t,"XpP"),expected),SelfPlayerCommandPlan::projectXp);
    }
    private static void projectXp(JsonObject values,CompoundTag tag){
        var xp=new JsonObject();xp.addProperty("XpLevel",integer(tag,"XpLevel"));xp.addProperty("XpP",floating(tag,"XpP"));
        xp.addProperty("XpTotal",integer(tag,"XpTotal"));values.add("experience",xp);
    }
    private static SelfPlayerCommandPlan position(Minecraft mc,JsonObject baseline,JsonObject patch){
        require(mc,"teleport");keys(patch,Set.of("x","y","z","yaw","pitch"));
        if(patch.isEmpty())throw bad("位置没有修改");
        var old=baseline.getAsJsonObject("commandPosition");var next=old.deepCopy();
        patch.entrySet().forEach(e->next.add(e.getKey(),e.getValue()));
        double x=number(next,"x",-29999999,29999999),y=number(next,"y",mc.level.getMinY(),mc.level.getMaxY()),z=number(next,"z",-29999999,29999999);
        var block=BlockPos.containing(x,y,z);
        if(mc.level.isOutsideBuildHeight(block)||!mc.level.getWorldBorder().isWithinBounds(x,z))throw bad("位置超出本维度建造高度或世界边界");
        float yaw=(float)number(next,"yaw",-360,360),pitch=(float)number(next,"pitch",-90,90);
        next.addProperty("yaw",wrap(yaw));next.addProperty("pitch",pitch);
        String command="teleport @s "+decimal(x)+" "+decimal(y)+" "+decimal(z)+" "+decimal(yaw)+" "+decimal(pitch);
        return new SelfPlayerCommandPlan(command,t->matchesPosition(t,old),t->matchesPosition(t,next),(v,t)->v.add("commandPosition",positionTag(t)));
    }
    private static SelfPlayerCommandPlan attribute(Minecraft mc,JsonObject baseline,JsonArray patch){
        require(mc,"attribute");
        if(patch==null||patch.size()!=1)throw bad("每次只修改一个属性基础值");
        var row=patch.get(0).getAsJsonObject();keys(row,Set.of("id","base"));
        var id=Identifier.parse(StackCodec.string(row,"id"));
        var holder=BuiltInRegistries.ATTRIBUTE.get(id).orElseThrow(()->bad("属性不在游戏注册表中"));
        if(!holder.value().isClientSyncable()||!mc.player.getAttributes().hasAttribute(holder))throw bad("该属性不在此玩家可同步属性中，需服务端 Editor");
        double min=holder.value() instanceof RangedAttribute r?r.getMinValue():-Double.MAX_VALUE;
        double max=holder.value() instanceof RangedAttribute r?r.getMaxValue():Double.MAX_VALUE;
        double next=number(row,"base",min,max);String name=id.toString();
        var old=attributeRow(baseline.getAsJsonArray("attributes"),name);double before=old.get("base").getAsDouble();
        return new SelfPlayerCommandPlan("attribute @s "+name+" base set "+decimal(next),
                t->attributeBase(t,name)==before,t->attributeBase(t,name)==next,
                (v,t)->attributeRow(v.getAsJsonArray("attributes"),name).addProperty("base",attributeBase(t,name)));
    }
    static void addSnapshot(Minecraft mc,JsonObject values,JsonObject schema){
        var position=new JsonObject();position.addProperty("x",mc.player.getX());position.addProperty("y",mc.player.getY());position.addProperty("z",mc.player.getZ());
        position.addProperty("yaw",wrap(mc.player.getYRot()));position.addProperty("pitch",mc.player.getXRot());values.add("commandPosition",position);
        schema.addProperty("commandDimension",mc.level.dimension().identifier().toString());schema.addProperty("commandMinY",mc.level.getMinY());schema.addProperty("commandMaxY",mc.level.getMaxY());
        schema.addProperty("xpPointsNeeded",mc.player.getXpNeededForNextLevel());
        schema.addProperty("xpPointsLevel",mc.player.experienceLevel);
        var attrs=new JsonArray();var defs=new JsonArray();
        for(var h:BuiltInRegistries.ATTRIBUTE.listElements().toList())if(h.value().isClientSyncable()&&mc.player.getAttributes().hasAttribute(h)){
            var row=new JsonObject();row.addProperty("id",h.key().identifier().toString());row.addProperty("base",mc.player.getAttributeBaseValue(h));attrs.add(row);
            var def=row.deepCopy();def.addProperty("base",h.value().getDefaultValue());if(h.value() instanceof RangedAttribute r){def.addProperty("min",r.getMinValue());def.addProperty("max",r.getMaxValue());}defs.add(def);
        }
        values.add("attributes",attrs);schema.add("attributes",defs);
    }
    static JsonObject positionTag(CompoundTag tag){
        var pos=tag.getList("Pos").orElseThrow();var rot=tag.getList("Rotation").orElseThrow();
        if(pos.size()!=3||rot.size()!=2)throw bad("服务器位置格式无法确认");
        var out=new JsonObject();out.addProperty("x",pos.getDouble(0).orElseThrow());out.addProperty("y",pos.getDouble(1).orElseThrow());out.addProperty("z",pos.getDouble(2).orElseThrow());
        out.addProperty("yaw",wrap(rot.getFloat(0).orElseThrow()));out.addProperty("pitch",rot.getFloat(1).orElseThrow());return out;
    }
    private static boolean matchesPosition(CompoundTag tag,JsonObject expected){
        var actual=positionTag(tag);
        for(String axis:List.of("x","y","z")){double a=actual.get(axis).getAsDouble(),b=expected.get(axis).getAsDouble();if(!Double.isFinite(a)||!Double.isFinite(b)||Math.abs(a-b)>0.01)return false;}
        return Math.abs(wrap(actual.get("yaw").getAsFloat()-expected.get("yaw").getAsFloat()))<=0.001f
                &&Math.abs(actual.get("pitch").getAsFloat()-expected.get("pitch").getAsFloat())<=0.001f;
    }
    private static double attributeBase(CompoundTag tag,String id){
        Double found=null;for(var raw:tag.getList("attributes").orElseThrow())if(raw instanceof CompoundTag row&&row.getString("id").orElse("").equals(id)){
            if(found!=null)throw bad("服务器属性 ID 重复");found=row.getDouble("base").orElseThrow();
        }
        if(found==null||!Double.isFinite(found))throw bad("服务器未回传此属性真实基础值");return found;
    }
    private static JsonObject attributeRow(JsonArray rows,String id){for(var row:rows)if(row.getAsJsonObject().get("id").getAsString().equals(id))return row.getAsJsonObject();throw bad("属性不在当前页快照中，请重新读取");}
    private static int integer(CompoundTag t,String key){return t.getInt(key).orElseThrow();}
    private static float floating(CompoundTag t,String key){return t.getFloat(key).orElseThrow();}
    private static boolean sameFloat(float a,float b){return Float.isFinite(a)&&Float.isFinite(b)&&a==b;}
    private static int quantizePoints(double progress,int needed){if(needed<=0||!Double.isFinite(progress)||progress<0||progress>=1)throw bad("本级经验进度或点数范围无效");return Math.min(needed-1,(int)Math.round(progress*needed));}
    private static float wrap(float angle){float out=angle%360f;return out>=180?out-360:out< -180?out+360:out;}
    private static String decimal(double value){return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();}
    private static int integer(JsonObject v,String key,int min,int max){double n=number(v,key,min,max);if(n!=Math.rint(n))throw bad("等级必须为整数");return (int)n;}
    private static double number(JsonObject v,String key,double min,double max){var raw=v.get(key);if(raw==null||!raw.isJsonPrimitive()||!raw.getAsJsonPrimitive().isNumber())throw bad("数值字段格式无效："+key);double n=raw.getAsDouble();if(!Double.isFinite(n)||n<min||n>max)throw bad("数值超出范围："+key);return n;}
    private static void keys(JsonObject row,Set<String> allowed){for(String key:row.keySet())if(!allowed.contains(key))throw bad("不支持此命令字段："+key);}
    private static void require(Minecraft mc,String... path){if(!SelfPlayerCommands.command(mc,path))throw bad("没有对应原版命令权限");}
    private static IllegalArgumentException bad(String message){return new IllegalArgumentException(message);}
}
