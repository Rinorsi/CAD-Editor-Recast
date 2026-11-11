package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;

public final class RegistryFragmentsTest {
    private static int checks;
    private static void check(boolean ok,String label){if(!ok)throw new AssertionError(label);checks++;}
    private static void rejects(Runnable action){try{action.run();throw new AssertionError("accepted over limit");}catch(IllegalArgumentException expected){checks++;}}
    public static void main(String[] args){
        var context=new JsonObject();context.addProperty("worldGeneration","9007199254740993");context.addProperty("id","custom:large");context.addProperty("requestId","fixture-request");
        var rows=new JsonArray();for(int i=0;i<1000;i++){var row=new JsonObject();row.addProperty("id","custom:"+i);rows.add(row);}
        check(RegistryPages.split("entity_schema","entity-schema-7",rows,context).equals(RegistryPages.splitLossless("entity_schema","entity-schema-7",rows,context)),"ordinary v1 byte shape");
        var large=new JsonObject();large.addProperty("id","custom:large");large.addProperty("unknownTyped","{long:9223372036854775807L,bytes:[B;-128b],floats:[NaNf,Infinityd],quoted:\"a\\b\"}");large.addProperty("text","中文😀\"\n\\".repeat(6000));rows.add(large);
        var pages=RegistryPages.splitLossless("entity_schema","entity-schema-7",rows,context);var text=new StringBuilder();int offset=0;
        check(pages.size()>1,"fragmentation");
        for(var p:pages){String data=p.get("payload").getAsString();check(p.toString().length()<=24000,"wire budget including escaping");check(p.get("fragmentOffset").getAsInt()==offset,"offset");check(p.get("fragmentCount").getAsInt()==pages.size(),"count");check(!Character.isLowSurrogate(data.charAt(0))&&!Character.isHighSurrogate(data.charAt(data.length()-1)),"surrogate boundary");text.append(data);offset+=data.length();}
        var logical=JsonParser.parseString(text.toString()).getAsJsonObject();check(logical.getAsJsonArray("entries").equals(rows),"all rows/unknown/typed intact");check(pages.getFirst().get("checksum").getAsString().equals(RegistryFragments.checksum(text.toString())),"checksum");
        check(!pages.getFirst().get("transferId").equals(RegistryPages.splitLossless("entity_schema","entity-schema-7",rows,context).getFirst().get("transferId")),"unique transfer despite shared schema counter");
        var huge=new JsonArray();huge.add("x".repeat(RegistryFragments.MAX_RESPONSE_CHARS));rejects(()->RegistryPages.splitLossless("entity_info","entity-1",huge,context));
        var tooMany=logical.deepCopy();var many=new JsonArray();for(int i=0;i<=RegistryFragments.MAX_ROWS;i++)many.add(i);tooMany.add("entries",many);rejects(()->RegistryFragments.split(tooMany));
        var escaped=logical.deepCopy();var quoteRows=new JsonArray();quoteRows.add("\"".repeat(1_048_000));escaped.add("entries",quoteRows);rejects(()->RegistryFragments.split(escaped));
        System.out.println("PASS RegistryFragmentsTest checks="+checks+" pages="+pages.size());
    }
}
