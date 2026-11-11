package dev.rinorsi.editor.registry;
import com.google.gson.*;
import dev.rinorsi.editor.world.*;
import net.minecraft.nbt.*;
import net.minecraft.world.entity.*;
import java.nio.file.*;
/** Actual vanilla loaders plus UI payloads from effect-payload.cjs; not an in-game test. */
public final class EffectRetentionTest {
 public static void main(String[] args)throws Exception{
  net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
  var access=EntitySchemaTest.access();var level=new EntitySchemaTestLevel(access);
  var slime=net.minecraft.world.entity.EntityTypes.SLIME.create(level,EntitySpawnReason.COMMAND);
  var before=WorldTarget.saveEntity(slime,access);
  if(args[0].equals("seed")){
   var result=new JsonObject();result.addProperty("empty",before.toString());
   var effects=before.copy();effects.put("active_effects",WorldNbt.parse("{v:[{id:'minecraft:speed',amplifier:0,duration:600,show_particles:1b}]}").get("v"));
   result.addProperty("withEffect",WorldTarget.copyEntity(slime,effects,level,access).toString());
   Files.writeString(Path.of(args[1]),result.toString());return;
  }
  var rows=JsonParser.parseString(Files.readString(Path.of(args[1]))).getAsJsonArray();var report=new JsonArray();int failed=0;
  for(var raw:rows){var row=raw.getAsJsonObject();var record=row.deepCopy();try{
   var base=WorldNbt.parse(row.get("before").getAsString());EntityWorldEdit.load(slime,base,access);
   var requested=WorldNbt.parse(row.get("requested").getAsString());
   var prepared=WorldTarget.copyEntity(slime,requested,level,access);record.addProperty("prepared",prepared.toString());
   WorldNbt.requireEditedFieldsRetained(base,requested,prepared);
   record.addProperty("status","PASS");
  }catch(RuntimeException e){record.addProperty("status","FAIL");record.addProperty("reason",e.toString());failed++;}report.add(record);}
  if(Boolean.getBoolean("effects.negative")) {
   for(String spec:java.util.List.of("[{id:'nbt_audit:missing',duration:600}]","[{id:'minecraft:speed',amplifier:999,duration:600}]","[{id:'minecraft:speed',amplifier:1.5d,duration:600}]","[{id:'minecraft:speed',duration:600,unknown:9007199254740993L}]","[{id:'minecraft:speed',duration:600},{id:'minecraft:speed',duration:800}]","[{id:'minecraft:speed',duration:600,hidden_effect:{duration:800,amplifier:999}}]","[{id:'minecraft:speed',duration:600,hidden_effect:{duration:800,id:'lost:field'}}]")) {
    var req=before.copy();req.put("active_effects",WorldNbt.parse("{v:"+spec+"}").get("v"));
    boolean denied=false;try {var prepared=WorldTarget.copyEntity(slime,req,level,access);WorldNbt.requireEditedFieldsRetained(before,req,prepared);}catch(RuntimeException expected){denied=true;}
    if(!denied)throw new AssertionError("invalid/lossy effect accepted: "+spec);
    System.out.println("PASS invalid/lossy effect denied "+spec);
   }
   var unrelated=before.copy();unrelated.put("probe",WorldNbt.parse("{x:[L;9007199254740993L]}").get("x"));
   try{WorldNbt.requireEditedFieldsRetained(before,unrelated,before);throw new AssertionError("unknown edited field dropped");}catch(dev.rinorsi.editor.EditorSessions.Failure expected){System.out.println("PASS other edited fields remain exact");}
   EntityWorldEdit.load(slime,before,access);
   var ordered=before.copy();ordered.put("active_effects",WorldNbt.parse("{v:[{id:'minecraft:speed',duration:600},{id:'minecraft:strength',duration:900,show_particles:1b}]} ").get("v"));
   var prepared=WorldTarget.copyEntity(slime,ordered,level,access);WorldNbt.requireEditedFieldsRetained(before,ordered,prepared);System.out.println("PASS unordered unique effect IDs use real codec equivalence");
  }
  Files.writeString(Path.of(args[2]),new GsonBuilder().setPrettyPrinting().create().toJson(report));
  System.out.println((failed==0?"PASS":"FAIL")+" EffectRetentionTest "+(rows.size()-failed)+"/"+rows.size()+" actual UI payloads; before/requested/prepared in "+args[2]);
  if(failed>0)throw new AssertionError("active_effects loader-retention failures="+failed);
 }
}
