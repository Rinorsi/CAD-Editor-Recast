import com.google.gson.*;
import com.mojang.serialization.*;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.nbt.*;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.entity.BeehiveBlockEntity;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.world.WorldNbt;
import java.nio.file.*;
import java.util.*;

/** Real 26.1.2 parsers/codecs, no game window or world. FAIL remains RED. */
public class NativeRoundTrip {
  static final JsonArray cases=new JsonArray();
  interface Check { JsonObject run() throws Exception; }
  static Tag parse(String s) throws Exception { return TagParser.create(NbtOps.INSTANCE).parseFully(s); }
  static JsonObject result(Object expected,Object actual) {
    var o=new JsonObject();o.add("expected",new Gson().toJsonTree(expected));o.add("actual",new Gson().toJsonTree(actual));
    o.addProperty("status",Objects.equals(expected,actual)?"PASS":"FAIL"); return o;
  }
  static void test(String id,Check check) {
    JsonObject o;
    try {o=check.run();}catch(Throwable e){o=new JsonObject();o.addProperty("status","HARNESS_ERROR");o.addProperty("error",e.toString());e.printStackTrace();}
    o.addProperty("id",id);cases.add(o);System.out.println(o);
  }
  static <T> Tag jsonRoundTrip(Codec<T> codec,Tag original,RegistryAccess access) {
    var no=access.createSerializationContext(NbtOps.INSTANCE);var jo=access.createSerializationContext(JsonOps.INSTANCE);
    T before=codec.parse(no,original).getOrThrow();
    JsonElement wire=codec.encodeStart(jo,before).getOrThrow();
    wire=JsonParser.parseString(wire.toString());
    return codec.encodeStart(no,codec.parse(jo,wire).getOrThrow()).getOrThrow();
  }
  public static void main(String[] args) throws Exception {
    SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
    var lookup=net.minecraft.data.registries.VanillaRegistries.createLookup();
    BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());
    var builtins=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
    RegistryAccess access=new RegistryAccess() {
      @Override public <E> Optional<net.minecraft.core.Registry<E>> lookup(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<? extends E>> key){return builtins.lookup(key);}
      @Override public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries(){return builtins.registries();}
      @Override public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(DynamicOps<V> ops){return lookup.createSerializationContext(ops);}
    };
    test("native-boolean-int-read-coercion",()-> {
      var a=(CompoundTag)parse("{NoAI:1b,Invulnerable:1b}");var b=(CompoundTag)parse("{NoAI:1,Invulnerable:1}");
      return result(a.getBoolean("NoAI").toString(),b.getBoolean("NoAI").toString());
    });
    test("native-retained-field-check",()-> {
      String status="accepted";
      try{WorldNbt.requireEditedFieldsRetained((CompoundTag)parse("{NoAI:0b}"),(CompoundTag)parse("{NoAI:1}"),(CompoundTag)parse("{NoAI:1b}"));}
      catch(RuntimeException e){status=e.getMessage();}
      return result("原版加载器未保留修改的字段：NoAI",status);
    });
    test("native-beehive-json-codec",()-> {
      var tag=parse("[{entity_data:{id:\"minecraft:bee\",Health:20.0f,NoAI:1b,custom:{value:9007199254740993L,arr:[I;1,2]}},ticks_in_hive:40,min_ticks_in_hive:600}]");
      var after=jsonRoundTrip(BeehiveBlockEntity.Occupant.LIST_CODEC,tag,access);
      return result(tag.toString(),after.toString());
    });
    test("native-nested-stack-json-codec",()-> {
      var tag=parse("{id:\"minecraft:stone\",count:1,components:{\"minecraft:custom_data\":{s:2s,l:3L,arr:[I;1,2]}}}");
      var after=jsonRoundTrip(ItemStack.CODEC,tag,access);
      return result(tag.toString(),after.toString());
    });
    test("native-production-beehive-timer-edit",()-> {
      var tag=(CompoundTag)parse("{bees:[{entity_data:{id:\"minecraft:bee\",Health:20.0f,custom:{arr:[I;1,2]}},ticks_in_hive:40,min_ticks_in_hive:600}]}");
      var block=new BeehiveBlockEntity(net.minecraft.core.BlockPos.ZERO,net.minecraft.world.level.block.Blocks.BEEHIVE.defaultBlockState());
      var views=new JsonObject();dev.rinorsi.editor.world.BlockViews.add(views,block,access,tag);
      var edits=new JsonObject();var value=views.getAsJsonObject("beehive").getAsJsonObject("value").deepCopy();
      value.getAsJsonArray("bees").get(0).getAsJsonObject().addProperty("ticks_in_hive",41);edits.add("beehive",value);
      var next=dev.rinorsi.editor.world.BlockViews.apply(block,tag,edits,access);
      Tag expected=((CompoundTag)((ListTag)tag.get("bees")).get(0)).get("entity_data");
      Tag actual=((CompoundTag)((ListTag)next.get("bees")).get(0)).get("entity_data");
      return result(expected.toString(),actual.toString());
    });
    test("native-stack-wire-sidecar",()-> {
      var tag=parse("{id:\"minecraft:stone\",count:1,components:{\"minecraft:custom_data\":{s:2s,l:9007199254740993L,arr:[I;1,2]}}}");
      var stack=ItemStack.CODEC.parse(access.createSerializationContext(NbtOps.INSTANCE),tag).getOrThrow();
      var wire=StackCodec.snapshot(stack,access,new JsonObject(),"audit");
      var back=StackCodec.decode(wire,access);
      var after=ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),back).getOrThrow();
      return result(tag.toString(),after.toString());
    });
    test("native-semantic-float-codec",()->result("2.0f",jsonRoundTrip(Codec.FLOAT,parse("2.0f"),access).toString()));
    test("native-attribute-canonical-double",()-> {
      var codec=net.minecraft.world.entity.ai.attributes.AttributeInstance.Packed.CODEC;
      var tag=parse("{id:\"minecraft:scale\",base:2}");var no=access.createSerializationContext(NbtOps.INSTANCE);
      var canonical=codec.encodeStart(no,codec.parse(no,tag).getOrThrow()).getOrThrow();
      return result("2.0d",((CompoundTag)canonical).get("base").toString());
    });
    var ui=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
    for(var row:ui.getAsJsonArray("cases")) {
      var c=row.getAsJsonObject();
      if(!c.has("actual")||!c.get("actual").isJsonPrimitive()||!c.get("actual").getAsJsonPrimitive().isString()
        ||!c.get("expected").isJsonPrimitive()||!c.get("expected").getAsJsonPrimitive().isString())continue;
      String a=c.get("actual").getAsString(),e=c.get("expected").getAsString();
      if(!(a.startsWith("{")||a.startsWith("["))||!(e.startsWith("{")||e.startsWith("[")))continue;
      test("native-ui-"+c.get("id").getAsString(),()->{
        Tag want=parse(e),got;
        try{got=parse(a);}catch(com.mojang.brigadier.exceptions.CommandSyntaxException invalid){return result(want.toString(),"INVALID_SNBT: "+invalid.getMessage());}
        var r=result(want.toString(),got.toString());
        r.addProperty("tagEquals",want.equals(got));return r;
      });
    }
    var report=new JsonObject();report.addProperty("scope","real Minecraft 26.1.2 parser and codecs, no live entity load or multiplayer");report.add("cases",cases);
    long fail=cases.asList().stream().filter(x->x.getAsJsonObject().get("status").getAsString().equals("FAIL")).count();
    long errors=cases.asList().stream().filter(x->x.getAsJsonObject().get("status").getAsString().equals("HARNESS_ERROR")).count();
    report.addProperty("failed",fail);report.addProperty("harnessErrors",errors);report.addProperty("passed",cases.size()-fail-errors);
    Files.writeString(Path.of(args[1]),new GsonBuilder().setPrettyPrinting().create().toJson(report));
    System.out.println("TOTAL pass="+(cases.size()-fail-errors)+" fail="+fail+" harnessErrors="+errors);
    if(fail+errors>0)System.exit(1);
  }
}
