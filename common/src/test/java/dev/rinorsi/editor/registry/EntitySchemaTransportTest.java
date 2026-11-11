package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.nio.file.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.MobBucketItem;

/** Actual production schema path, not the smaller EntityDefaults.describe response. */
public final class EntitySchemaTransportTest {
    public static void main(String[] args)throws Exception{
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        var level=new EntitySchemaTestLevel(EntitySchemaTest.access(),true);var captured=new JsonArray();int fragmented=0,max=0;
        for(var item:BuiltInRegistries.ITEM){
            if(!(item instanceof MobBucketItem))continue;
            var metadata=new JsonObject();BucketItemMetadata.append(item,metadata);String id=metadata.get("bucket_entity").getAsString();
            var schema=EntitySchemaValidation.schema(id,level);if(!schema.get("available").getAsBoolean())throw new AssertionError(id+" unavailable");
            var rows=new JsonArray();rows.add(schema);var context=new JsonObject();context.addProperty("id",id);context.addProperty("requestId","native-fixture-"+captured.size());
            var wire=EntityRegistryChannel.responsePages("entity_schema","entity-schema-17","native-world-1",rows,context,null);var frames=new JsonArray();var text=new StringBuilder();
            for(String encoded:wire){if(encoded.length()>24000)throw new AssertionError("wire budget");max=Math.max(max,encoded.length());var page=JsonParser.parseString(encoded).getAsJsonObject();frames.add(page);if(page.get("version").getAsInt()==2)text.append(page.get("payload").getAsString());}
            JsonObject logical;if(text.length()>0){fragmented++;logical=JsonParser.parseString(text.toString()).getAsJsonObject();}else logical=frames.get(0).getAsJsonObject();
            // Gson Float primitives compare in binary precision against parsed decimals; compare exact wire JSON instead.
            if(!logical.getAsJsonArray("entries").get(0).toString().equals(schema.toString()))throw new AssertionError("schema wire data loss "+id);
            if(text.length()>0&&!logical.toString().equals(text.toString()))throw new AssertionError("wire text changed");
            var record=new JsonObject();record.addProperty("id",id);record.add("schema",schema);record.add("logical",logical);record.addProperty("logicalText",logical.toString());record.add("frames",frames);captured.add(record);
            System.out.println("PASS production EntitySchemaValidation.schema "+id+" chars="+schema.toString().length()+" frames="+frames.size()+" flags="+schema.getAsJsonArray("flags").size());
        }
        Files.writeString(Path.of(args[0]),captured.toString());System.out.println("PASS native schemas="+captured.size()+" fragmented="+fragmented+" maxWireChars="+max);
    }
}
