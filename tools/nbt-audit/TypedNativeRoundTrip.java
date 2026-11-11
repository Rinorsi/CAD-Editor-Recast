import com.google.gson.*;
import com.mojang.serialization.*;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.nbt.*;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.*;
import net.minecraft.world.level.block.entity.*;
import dev.rinorsi.editor.world.BlockViews;
import java.nio.file.*;
import java.util.*;

/** New production typed route. The old JsonOps counterexample harness is untouched. */
public class TypedNativeRoundTrip {
 static Tag parse(String s)throws Exception{return TagParser.create(NbtOps.INSTANCE).parseFully(s);}
 static BlockEntity block(String type){return switch(type){case "beehive"->new BeehiveBlockEntity(BlockPos.ZERO,Blocks.BEEHIVE.defaultBlockState());case "lectern"->new LecternBlockEntity(BlockPos.ZERO,Blocks.LECTERN.defaultBlockState());case "jukebox"->new JukeboxBlockEntity(BlockPos.ZERO,Blocks.JUKEBOX.defaultBlockState());case "vault"->new net.minecraft.world.level.block.entity.vault.VaultBlockEntity(BlockPos.ZERO,Blocks.VAULT.defaultBlockState());case "structure_block"->new StructureBlockEntity(BlockPos.ZERO,Blocks.STRUCTURE_BLOCK.defaultBlockState());default->throw new IllegalArgumentException(type);};}
 public static void main(String[] args)throws Exception{
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();var lookup=net.minecraft.data.registries.VanillaRegistries.createLookup();BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());var builtins=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
  RegistryAccess access=new RegistryAccess(){public <E>Optional<net.minecraft.core.Registry<E>>lookup(net.minecraft.resources.ResourceKey<? extends net.minecraft.core.Registry<? extends E>>key){return builtins.lookup(key);}public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>>registries(){return builtins.registries();}public <V>net.minecraft.resources.RegistryOps<V>createSerializationContext(DynamicOps<V>ops){return lookup.createSerializationContext(ops);}};
  String custom="{b:1b,s:2s,l:9007199254740993L,f:4.0f,d:5.0d,ba:[B;1b,2b],ia:[I;3,4],la:[L;9223372036854775807L]}";
  String bee="{bees:[{entity_data:{id:'minecraft:bee',Health:20.0f,NoAI:1b,custom:"+custom+"},ticks_in_hive:40,min_ticks_in_hive:600}]}";
  var seeds=new JsonArray();
  for(String type:List.of("beehive","lectern","jukebox","vault","structure_block")){
   String stack="{id:'minecraft:"+(type.equals("lectern")?"writable_book":type.equals("jukebox")?"music_disc_13":"trial_key")+"',count:1,components:{'minecraft:custom_data':"+custom+"}}";
   String raw=switch(type){case "beehive"->bee;case "lectern"->"{Book:"+stack+",Page:0}";case "jukebox"->"{RecordItem:"+stack+"}";case "vault"->"{config:{key_item:"+stack+",loot_table:'minecraft:chests/trial_chambers/reward',activation_range:4.0d,deactivation_range:4.5d}}";default->"{seed:9007199254740993L}";};
   var tag=(CompoundTag)parse(raw);tag.putString("id","minecraft:"+type);tag.putInt("x",0);tag.putInt("y",0);tag.putInt("z",0);raw=tag.toString();var views=new JsonObject();BlockViews.add(views,block(type),access,tag);var row=new JsonObject();row.addProperty("type",type);row.addProperty("original",raw);row.add("views",views);seeds.add(row);
  }
  if(args[0].equals("seed")){Files.writeString(Path.of(args[1]),new GsonBuilder().setPrettyPrinting().create().toJson(seeds));return;}
  var inputs=JsonParser.parseString(Files.readString(Path.of(args[1]))).getAsJsonArray();var results=new JsonArray();int failed=0;
  for(var element:inputs){var row=element.getAsJsonObject();String type=row.get("type").getAsString();var original=(CompoundTag)parse(row.get("original").getAsString());var message=row.getAsJsonObject("payload");var next=BlockViews.apply(block(type),original,message.getAsJsonObject("views"),message.getAsJsonObject("views_snbt"),access);var result=new JsonObject();result.addProperty("type",type);result.add("payload",message);result.addProperty("original",original.toString());result.addProperty("actual",next.toString());boolean ok;
   if(type.equals("beehive")){var old=(CompoundTag)original.getList("bees").orElseThrow().get(0);var got=(CompoundTag)next.getList("bees").orElseThrow().get(0);ok=old.get("entity_data").equals(got.get("entity_data"))&&got.getIntOr("ticks_in_hive",-1)==41;}
   else if(type.equals("structure_block"))ok=next.getLongOr("seed",0)==9007199254740995L;
   else{String key=type.equals("lectern")?"Book":type.equals("jukebox")?"RecordItem":"config";var old=original.getCompound(key).orElseThrow();var got=next.getCompound(key).orElseThrow();if(type.equals("vault")){old=old.getCompound("key_item").orElseThrow();got=got.getCompound("key_item").orElseThrow();}ok=got.getIntOr("count",0)==2&&old.getCompound("components").orElseThrow().get("minecraft:custom_data").equals(got.getCompound("components").orElseThrow().get("minecraft:custom_data"));}
   result.addProperty("status",ok?"PASS":"FAIL");if(!ok)failed++;results.add(result);System.out.println(result);
  }
  var report=new JsonObject();report.addProperty("scope","production UI emitted views_snbt -> production BlockViews.apply -> real NbtOps codecs; no live load");report.addProperty("failed",failed);report.addProperty("passed",results.size()-failed);report.add("cases",results);Files.writeString(Path.of(args[2]),new GsonBuilder().setPrettyPrinting().create().toJson(report));if(failed>0)System.exit(1);
 }
}
