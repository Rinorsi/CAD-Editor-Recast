package dev.rinorsi.editor.client;

import dev.rinorsi.editor.EditorI18n;

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
        if(patch.size()!=1)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.e3841041c5"));
        String key=patch.keySet().iterator().next();
        return switch(key){
            case "playerGameType" -> mode(mc,baseline,patch);
            case "experience" -> experience(mc,baseline,StackCodec.object(patch,key));
            case "commandPosition" -> position(mc,baseline,StackCodec.object(patch,key));
            case "attributes" -> attribute(mc,baseline,patch.getAsJsonArray(key));
            default -> throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.776391fff4"));
        };
    }
    private static SelfPlayerCommandPlan mode(Minecraft mc,JsonObject baseline,JsonObject patch){
        require(mc,"gamemode");
        var next=Arrays.stream(GameType.values()).filter(m->m.getName().equals(StackCodec.string(patch,"playerGameType"))).findFirst().orElseThrow(()->bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.7f96d48cc0")));
        var old=Arrays.stream(GameType.values()).filter(m->m.getName().equals(baseline.get("playerGameType").getAsString())).findFirst().orElseThrow();
        return new SelfPlayerCommandPlan("gamemode "+next.getName()+" @s",
                t->integer(t,"playerGameType")==old.getId(),t->integer(t,"playerGameType")==next.getId(),
                (v,t)->v.addProperty("playerGameType",next.getName()));
    }
    private static SelfPlayerCommandPlan experience(Minecraft mc,JsonObject baseline,JsonObject patch){
        require(mc,"experience","set");
        if(patch.size()!=1)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.450ccc2502"));
        var old=baseline.getAsJsonObject("experience");int level=old.get("XpLevel").getAsInt();
        if(patch.has("XpLevel")){
            int next=integer(patch,"XpLevel",0,Integer.MAX_VALUE);
            return new SelfPlayerCommandPlan("experience set @s "+next+" levels",t->integer(t,"XpLevel")==level,
                    t->integer(t,"XpLevel")==next,SelfPlayerCommandPlan::projectXp);
        }
        if(!patch.has("XpP"))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.91a0027acf"));
        // Ask the actual player API, never duplicate the level formula in the UI.
        if(mc.player.experienceLevel!=level)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.e4d6985101"));
        int needed=mc.player.getXpNeededForNextLevel();if(needed<=0)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.c251b6f6cc"));
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
        if(patch.isEmpty())throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.5f7d1858b4"));
        var old=baseline.getAsJsonObject("commandPosition");var next=old.deepCopy();
        patch.entrySet().forEach(e->next.add(e.getKey(),e.getValue()));
        double x=number(next,"x",-29999999,29999999),y=number(next,"y",mc.level.getMinY(),mc.level.getMaxY()),z=number(next,"z",-29999999,29999999);
        var block=BlockPos.containing(x,y,z);
        if(mc.level.isOutsideBuildHeight(block)||!mc.level.getWorldBorder().isWithinBounds(x,z))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.b3cef4cf5a"));
        float yaw=(float)number(next,"yaw",-360,360),pitch=(float)number(next,"pitch",-90,90);
        next.addProperty("yaw",wrap(yaw));next.addProperty("pitch",pitch);
        String command="teleport @s "+decimal(x)+" "+decimal(y)+" "+decimal(z)+" "+decimal(yaw)+" "+decimal(pitch);
        return new SelfPlayerCommandPlan(command,t->matchesPosition(t,old),t->matchesPosition(t,next),(v,t)->v.add("commandPosition",positionTag(t)));
    }
    private static SelfPlayerCommandPlan attribute(Minecraft mc,JsonObject baseline,JsonArray patch){
        require(mc,"attribute");
        if(patch==null||patch.size()!=1)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.620abe0d59"));
        var row=patch.get(0).getAsJsonObject();keys(row,Set.of("id","base"));
        var id=Identifier.parse(StackCodec.string(row,"id"));
        var holder=BuiltInRegistries.ATTRIBUTE.get(id).orElseThrow(()->bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.30dc61ca45")));
        if(!holder.value().isClientSyncable()||!mc.player.getAttributes().hasAttribute(holder))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.3a161270b8"));
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
        if(pos.size()!=3||rot.size()!=2)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.0a189e63dc"));
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
            if(found!=null)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.19f3c70aee"));found=row.getDouble("base").orElseThrow();
        }
        if(found==null||!Double.isFinite(found))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.165498ca94"));return found;
    }
    private static JsonObject attributeRow(JsonArray rows,String id){for(var row:rows)if(row.getAsJsonObject().get("id").getAsString().equals(id))return row.getAsJsonObject();throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.53a0202f72"));}
    private static int integer(CompoundTag t,String key){return t.getInt(key).orElseThrow();}
    private static float floating(CompoundTag t,String key){return t.getFloat(key).orElseThrow();}
    private static boolean sameFloat(float a,float b){return Float.isFinite(a)&&Float.isFinite(b)&&a==b;}
    private static int quantizePoints(double progress,int needed){if(needed<=0||!Double.isFinite(progress)||progress<0||progress>=1)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.02159ac211"));return Math.min(needed-1,(int)Math.round(progress*needed));}
    private static float wrap(float angle){float out=angle%360f;return out>=180?out-360:out< -180?out+360:out;}
    private static String decimal(double value){return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();}
    private static int integer(JsonObject v,String key,int min,int max){double n=number(v,key,min,max);if(n!=Math.rint(n))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.3125ee61b6"));return (int)n;}
    private static double number(JsonObject v,String key,double min,double max){var raw=v.get(key);if(raw==null||!raw.isJsonPrimitive()||!raw.getAsJsonPrimitive().isNumber())throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.cd97a6eb00", (key)));double n=raw.getAsDouble();if(!Double.isFinite(n)||n<min||n>max)throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.8d3c32bf23", (key)));return n;}
    private static void keys(JsonObject row,Set<String> allowed){for(String key:row.keySet())if(!allowed.contains(key))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.ba3cbdcd18", (key)));}
    private static void require(Minecraft mc,String... path){if(!SelfPlayerCommands.command(mc,path))throw bad(EditorI18n.tr("cadeditor.message.selfplayercommandplan.9e93311f07"));}
    private static IllegalArgumentException bad(String message){return new IllegalArgumentException(message);}
}
