package dev.rinorsi.editor.clientonly;

import com.google.gson.*;
import java.util.*;
import net.minecraft.client.Minecraft;

/** Test-only delivery scheduler. Original serialized production facts are never rewritten. */
public final class RegistryDelivery {
    private record Fact(String key,String json,int driver) {}
    private static final List<Fact> facts=new ArrayList<>(),queue=new ArrayList<>(),old=new ArrayList<>();
    private static boolean enabled,hold,bypass;
    public static boolean capture(Object driver,String key,String json){
        if(!enabled||bypass||!(key.equals("registry.meta")||key.equals("registry.enchantments")||key.equals("registry.item_defaults_one")||key.equals("registry.relation")||key.startsWith("registry.component_schema")||key.matches("registry[.](entity_info(?::.*)?|entity_schema(?::.*)?|entity_base_attributes|equipment_slot_groups|spawner_info)")))return false;
        var f=new Fact(key,json,System.identityHashCode(driver));facts.add(f);
        if(hold){queue.add(f);return true;}return false;
    }
    private static JsonArray encode(List<Fact> list){var a=new JsonArray();for(var f:list){var v=new JsonObject();v.addProperty("key",f.key());v.addProperty("rawJson",f.json());v.addProperty("sourceDriver",f.driver());v.add("value",JsonParser.parseString(f.json()));a.add(v);}return a;}
    public static JsonObject action(Minecraft mc,String action)throws Exception{
        if(action.equals("reset")){facts.clear();queue.clear();old.clear();enabled=true;hold=false;}
        else if(action.equals("hold"))hold=true;
        else if(action.equals("snapshotOld")){old.clear();for(var f:facts)if(f.key().equals("registry.meta")||f.key().equals("registry.enchantments")||f.key().equals("registry.item_defaults_one")||f.key().startsWith("registry.component_schema")||f.key().matches("registry[.](entity_info(?::.*)?|entity_schema(?::.*)?|entity_base_attributes|equipment_slot_groups|spawner_info)"))old.add(f);}
        else if(action.startsWith("release:")||action.equals("replayOld")){
            String mode=action.startsWith("release:")?action.substring(8):"old";
            List<Fact> selected=new ArrayList<>();
            if(mode.equals("old"))selected.addAll(old);else {for(var f:queue)if(mode.equals("all")||mode.equals("meta")&&f.key().equals("registry.meta")||mode.equals("enchantments")&&f.key().equals("registry.enchantments"))selected.add(f);queue.removeAll(selected);}
            if(mode.equals("all"))hold=false;
            var type=Class.forName("dev.oriel.mod.client.DocumentDriver");var driver=type.getMethod("of",net.minecraft.client.gui.screens.Screen.class).invoke(null,mc.screen);
            if(driver==null)throw new IllegalStateException("Current real DocumentDriver unavailable");
            bypass=true;try{for(var f:selected)type.getMethod("patchJson",String.class,String.class).invoke(driver,f.key(),f.json());}finally{bypass=false;}
        } else if(!action.equals("state"))throw new IllegalArgumentException("Unknown registry test scheduler operation");
        var out=new JsonObject();out.addProperty("hold",hold);out.add("facts",encode(facts));out.add("queue",encode(queue));out.add("old",encode(old));return out;
    }
}
