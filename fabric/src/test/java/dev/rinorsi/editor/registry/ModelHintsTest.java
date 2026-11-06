package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import net.minecraft.resources.Identifier;

public final class ModelHintsTest {
    public static void run() {
        Map<String, JsonElement> files = new HashMap<>();
        files.put("test:items/probe.json", JsonParser.parseString("""
          {"model":{"type":"minecraft:composite","models":[
            {"type":"minecraft:condition","property":"minecraft:custom_model_data","index":2,"on_true":{"type":"minecraft:model","model":"test:item/child"}},
            {"type":"range_dispatch","property":"custom_model_data","index":1,"entries":[{"threshold":2.5},{"threshold":10}]},
            {"type":"select","property":"custom_model_data","index":3,"cases":[{"when":["red","blue"]},{"when":"red"}]},
            {"type":"condition","property":"test:custom_model_data","index":99}
          ]}}
          """));
        files.put("test:models/item/child.json", JsonParser.parseString("""
          {"parent":"test:item/child","tints":[{"type":"minecraft:custom_model_data","index":4}],"nested":{"type":"condition","property":"custom_model_data"}}
          """));
        var hints = ModelHints.read(id -> files.get(id.toString()), Identifier.parse("test:probe"));
        if (hints.size() != 5) throw new AssertionError("missing branches or unexpected mod property " + hints);
        if (ModelHints.read(id -> null, Identifier.parse("test:none")).size() != 0) throw new AssertionError("missing should be empty");
        try { ModelHints.read(id -> { throw new java.io.IOException("invalid JSON"); }, Identifier.parse("test:bad")); throw new AssertionError("parse error swallowed"); }
        catch (IllegalArgumentException expected) {}
        files.put("test:items/invalid.json", JsonParser.parseString("{\"type\":\"condition\",\"property\":\"custom_model_data\",\"index\":-1}"));
        try { ModelHints.read(id -> files.get(id.toString()), Identifier.parse("test:invalid")); throw new AssertionError("negative index accepted"); }
        catch (IllegalArgumentException expected) {}
        System.out.println("PASS model hints: flag/range/select/color, nested models/parents/cycles, default index, namespaced property filtering, missing resources and malformed resource rejection");
    }
}
