package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.*;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.*;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.EntityBlock;
import net.minecraft.world.level.block.entity.SignText;

/** Real book/sign codecs and detached vanilla load/save. No game process is started. */
public final class BookTextRoundTripTest {
    private static int checks;
    private static final String RICH = """
        {"text":"彩色","color":"#12abef","bold":true,"italic":true,
         "extra":[{"text":"红色","color":"red","bold":false},
                  {"text":"下划线","underlined":true,"strikethrough":true}]}
        """;
    public static void main(String[] args) {
        var access = ComponentSchemaTest.bootstrap();
        run(access);
    }
    public static void run(RegistryAccess access) {
        checks = 0;
        schemas(access);
        books(access);
        signs(access);
        System.out.println("PASS " + checks + " book/sign schema, boundary, JSON edit and native load/save checks; no client/server started");
    }
    private static void schemas(RegistryAccess access) {
        var writable = ComponentSchema.derive("writable_book_content", access).root();
        var pages = writable.fields.get("pages");
        check(pages.json.get("max_size").getAsInt() == WritableBookContent.MAX_PAGES, "writable $.pages max_size from actual ListCodec");
        filterable(pages.element, "string", "max_length", WritableBookContent.PAGE_EDIT_LENGTH);
        var written = ComponentSchema.derive("written_book_content", access).root();
        filterable(written.fields.get("title"), "string", "max_length", WrittenBookContent.TITLE_MAX_LENGTH);
        filterable(written.fields.get("pages").element, "text_component", "max_flat_size", WrittenBookContent.PAGE_LENGTH);
        // WrittenBookContent.pagesCodec uses listOf(), unlike writable's bounded list.
        check(written.fields.get("pages").json.get("max_size").getAsInt() == Integer.MAX_VALUE, "written pages codec has no 100-page bound");
        check(written.fields.containsKey("resolved") && written.fields.containsKey("generation"), "written metadata exported");
        var pageValues = new JsonArray();
        for (int i = 0; i < WritableBookContent.MAX_PAGES; i++) pageValues.add("");
        var value = new JsonObject(); value.add("pages", pageValues);
        check(valid("writable_book_content", value, access), "writable exact page count allowed");
        pageValues.add("");
        check(!valid("writable_book_content", value, access), "writable over page count rejected");
        value.addProperty("title", "书"); value.addProperty("author", "作者");
        check(valid("written_book_content", value, access), "written accepts more than writable MAX_PAGES");
        for (boolean filtered : List.of(false, true)) {
            var page = new JsonObject(); page.addProperty("raw", "页".repeat(WritableBookContent.PAGE_EDIT_LENGTH));
            if (filtered) page.addProperty("filtered", "页".repeat(WritableBookContent.PAGE_EDIT_LENGTH));
            value = new JsonObject(); var one = new JsonArray(); one.add(page); value.add("pages", one);
            check(valid("writable_book_content", value, access), "exact writable raw/filtered page length");
            page.addProperty(filtered ? "filtered" : "raw", "页".repeat(WritableBookContent.PAGE_EDIT_LENGTH + 1));
            check(!valid("writable_book_content", value, access), "over writable raw/filtered page length");
            var title = new JsonObject(); title.addProperty("raw", "题".repeat(WrittenBookContent.TITLE_MAX_LENGTH));
            if (filtered) title.addProperty("filtered", "题".repeat(WrittenBookContent.TITLE_MAX_LENGTH));
            value = new JsonObject(); value.add("title", title); value.addProperty("author", "作者");
            check(valid("written_book_content", value, access), "exact raw/filtered title length");
            title.addProperty(filtered ? "filtered" : "raw", "题".repeat(WrittenBookContent.TITLE_MAX_LENGTH + 1));
            check(!valid("written_book_content", value, access), "over raw/filtered title length");
        }
    }
    private static void filterable(ComponentSchema.Node node, String kind, String limit, int expected) {
        check(node.alternatives.size() == 2, "Filterable exports object and direct alternatives at " + node.json.get("path"));
        var object = node.alternatives.stream().filter(n -> n.fields.containsKey("raw")).findFirst().orElseThrow();
        var direct = node.alternatives.stream().filter(n -> kind.equals(n.json.get("kind").getAsString())).findFirst().orElseThrow();
        for (var field : List.of(direct, object.fields.get("raw"), object.fields.get("filtered"))) {
            check(kind.equals(field.json.get("kind").getAsString()) && field.json.get(limit).getAsInt() == expected, "correct shape/limit at " + field.json.get("path"));
            if (kind.equals("string")) check(field.json.has("constraint_source"), "length limit includes runtime provenance");
        }
        check(object.fields.get("filtered").json.get("optional").getAsBoolean(), "filtered is optional");
    }
    private static boolean valid(String id, JsonElement value, RegistryAccess access) {
        var request = new JsonObject(); request.addProperty("component", id); request.add("value", value);
        return ComponentValidation.validate(request, access).get("ok").getAsBoolean();
    }
    private static void books(RegistryAccess access) {
        for (boolean written : List.of(false, true)) {
            String id = written ? "written_book_content" : "writable_book_content";
            var value = new JsonObject(); var pages = new JsonArray();
            pages.add(written ? JsonParser.parseString(RICH) : new JsonPrimitive("第一行\n第二行"));
            var filtered = new JsonObject();
            filtered.add("raw", written ? JsonParser.parseString(RICH) : new JsonPrimitive("原文"));
            filtered.add("filtered", written ? JsonParser.parseString("{text:'过滤文本',color:'gold',italic:true}") : new JsonPrimitive("过滤文本"));
            pages.add(filtered); value.add("pages", pages);
            if (written) {
                value.add("title", JsonParser.parseString("{raw:'原标题',filtered:'过滤标题'}"));
                value.addProperty("author", "作者"); value.addProperty("generation", 2); value.addProperty("resolved", true);
            }
            var edit = new JsonObject(); edit.addProperty("id", written ? "minecraft:written_book" : "minecraft:writable_book");
            edit.addProperty("count", 1); var comps = new JsonObject(); comps.add(id, value);
            edit.add("comps", comps); edit.add("removed", new JsonObject());
            // Unknown user keys live in free custom_data; book Codec record fields are closed.
            comps.add("custom_data", JsonParser.parseString("{unknown:{nested:'保留'},values:[1,2]}"));
            var original = StackCodec.decode(edit, access);
            var typed = original.get(DataComponents.CUSTOM_DATA).copyTag();
            typed.putLong("unknown_long", 9007199254740993L); typed.putByte("unknown_byte", (byte) 1);
            typed.putIntArray("unknown_array", new int[]{3, 4}); original.set(DataComponents.CUSTOM_DATA, CustomData.of(typed));
            var wire = wire(StackCodec.snapshot(original, access, new JsonObject(), "书本"));
            var before = wire.getAsJsonObject("comps").getAsJsonObject(id).deepCopy();
            check(before.getAsJsonArray("pages").get(1).getAsJsonObject().has("filtered"), "filtered page exported as object");
            if (written) check(raw(before.getAsJsonArray("pages").get(0)).isJsonObject(), "styled written page remains component object");
            check(ItemStack.matches(original, StackCodec.decode(wire, access, original)), "unchanged book survives browser JSON");
            var editedBook = wire.getAsJsonObject("comps").getAsJsonObject(id);
            var first = editedBook.getAsJsonArray("pages");
            if (written) raw(first.get(0)).getAsJsonObject().addProperty("text", "修改第一页");
            else first.get(0).getAsJsonObject().addProperty("raw", "修改第一页");
            var next = StackCodec.decode(wire, access, original);
            var after = StackCodec.snapshot(next, access, new JsonObject(), "").getAsJsonObject("comps").getAsJsonObject(id);
            check(!before.getAsJsonArray("pages").get(0).equals(after.getAsJsonArray("pages").get(0)), "first page actually changed");
            check(before.getAsJsonArray("pages").get(1).equals(after.getAsJsonArray("pages").get(1)), "editing first page keeps filtered second page");
            if (written) {
                for (String key : List.of("title", "author", "generation", "resolved")) check(before.get(key).equals(after.get(key)), "book edit keeps " + key);
                var rich = raw(after.getAsJsonArray("pages").get(0)).getAsJsonObject();
                check(rich.has("color") && rich.get("color").getAsString().equalsIgnoreCase("#12abef"), "hex text color survives");
                check(rich.getAsJsonArray("extra").size() == 2 && rich.get("bold").getAsBoolean() && rich.get("italic").getAsBoolean(), "page edit keeps formatting and extra segments");
            }
            check(next.get(DataComponents.CUSTOM_DATA).copyTag().equals(typed), "unknown custom-data keys and exact NBT types survive book edit");
            var ops = access.createSerializationContext(NbtOps.INSTANCE);
            var saved = ItemStack.CODEC.encodeStart(ops, next).getOrThrow();
            check(ItemStack.matches(next, ItemStack.CODEC.parse(ops, saved).getOrThrow()), "edited book survives native persistence codec");
        }
    }
    private static void signs(RegistryAccess access) {
        for (var block : List.of(Blocks.OAK_SIGN, Blocks.OAK_HANGING_SIGN)) {
            var sign = ((EntityBlock) block).newBlockEntity(BlockPos.ZERO, block.defaultBlockState());
            var original = sign.saveWithFullMetadata(access);
            var side = new JsonObject(); var lines = new JsonArray();
            for (int i = 0; i < SignText.LINES; i++) lines.add(JsonParser.parseString(RICH));
            side.add("messages", lines); side.add("filtered_messages", lines.deepCopy());
            side.getAsJsonArray("filtered_messages").get(0).getAsJsonObject().addProperty("text", "正面过滤文本");
            side.addProperty("color", "blue"); side.addProperty("has_glowing_text", true);
            var group = new JsonObject(); group.add("front_text", side);
            var back = side.deepCopy(); back.getAsJsonArray("filtered_messages").get(0).getAsJsonObject().addProperty("text", "背面过滤文本");
            group.add("back_text", back); var request = new JsonObject(); request.add("sign", group);
            var applied = BlockViews.apply(sign, original, wire(request), access);
            var loaded = WorldTarget.copyBlock(sign, applied, access);
            var saved = loaded.saveWithFullMetadata(access);
            WorldNbt.requireEditedFieldsRetained(original, applied, saved); checks++;
            var views = new JsonObject(); BlockViews.add(views, loaded, access, saved);
            var exported = wire(views).getAsJsonObject("sign").getAsJsonObject("value");
            for (String face : List.of("front_text", "back_text")) {
                var text = exported.getAsJsonObject(face);
                check(text.getAsJsonArray("messages").size() == SignText.LINES, "all sign lines exported");
                var rich = text.getAsJsonArray("messages").get(0).getAsJsonObject();
                check(rich.getAsJsonArray("extra").size() == 2 && rich.get("bold").getAsBoolean() && rich.get("italic").getAsBoolean(), "sign preserves full text components");
                check(text.get("color").getAsString().equals("blue") && text.get("has_glowing_text").getAsBoolean(), "sign dye and glow unchanged");
            }
            var partial = new JsonObject(); var newSide = new JsonObject();
            var newLines = exported.getAsJsonObject("front_text").getAsJsonArray("messages").deepCopy();
            newLines.get(0).getAsJsonObject().addProperty("text", "改一行"); newSide.add("messages", newLines);
            var partialGroup = new JsonObject(); partialGroup.add("front_text", newSide); partial.add("sign", partialGroup);
            var next = BlockViews.apply(loaded, saved, wire(partial), access);
            check(saved.get("back_text").equals(next.get("back_text")), "front edit retains back side");
            check(saved.getCompound("front_text").orElseThrow().get("filtered_messages").equals(next.getCompound("front_text").orElseThrow().get("filtered_messages")), "front edit retains filtered messages");
            var copy = WorldTarget.copyBlock(loaded, next, access).saveWithFullMetadata(access);
            WorldNbt.requireEditedFieldsRetained(saved, next, copy); checks++;
            newSide.addProperty("color", "#12abef");
            try { BlockViews.apply(loaded, saved, partial, access); throw new AssertionError("sign dye must reject hex while text color accepts it"); }
            catch (EditorSessions.Failure error) { check(error.code.equals("invalid_nbt"), "invalid sign dye rejected"); }
        }
    }
    private static JsonObject wire(JsonObject value) { return JsonParser.parseString(value.toString()).getAsJsonObject(); }
    private static JsonElement raw(JsonElement value) { return value.isJsonObject() && value.getAsJsonObject().has("raw") ? value.getAsJsonObject().get("raw") : value; }
    private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); checks++; }
}
