package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
import dev.rinorsi.editor.StackCodec;
import dev.rinorsi.editor.testing.TooltipFixtures;
import net.minecraft.SharedConstants;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.*;
import net.minecraft.network.chat.*;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.item.*;

/** No world/client startup. Actual 26.1.2 registries, codecs, tooltip generation and text shaping. */
public final class TooltipPreviewTest {
    private static int checks;
    private static void check(boolean ok,String name){if(!ok)throw new AssertionError(name);checks++;System.out.println("PASS "+name);}
    public static void main(String[] args)throws Exception {
        SharedConstants.tryDetectVersion();Bootstrap.bootStrap();var lookup=net.minecraft.data.registries.VanillaRegistries.createWorldLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());var builtins=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        RegistryAccess access=new RegistryAccess(){
            public <E> Optional<Registry<E>> lookup(net.minecraft.resources.ResourceKey<? extends Registry<? extends E>> key){return builtins.lookup(key);}
            public java.util.stream.Stream<RegistryAccess.RegistryEntry<?>> registries(){return builtins.registries();}
            public <V> net.minecraft.resources.RegistryOps<V> createSerializationContext(com.mojang.serialization.DynamicOps<V> ops){return lookup.createSerializationContext(ops);}
        };
        // Test-only loader binds the actual vanilla jar tags (including tooltip order and curses).
        var bound=dev.rinorsi.editor.testing.TooltipTestRegistries.bindEnchantmentTags(lookup);
        JsonObject captures=new JsonObject();var context=Item.TooltipContext.of(bound);
        for(var entry:TooltipFixtures.create(lookup).entrySet()){
            JsonObject edit=StackCodec.snapshot(entry.getValue(),access,new JsonObject(),"tooltip");ItemStack decoded=StackCodec.decode(edit,access);
            check(ItemStack.matches(decoded,entry.getValue()),"same StackCodec typed decode "+entry.getKey());
            for(boolean advanced:List.of(false,true)){
                JsonObject rendered=TooltipPreview.render(entry.getKey(),decoded,context,null,advanced);
                var vanilla=decoded.getTooltipLines(context,null,advanced?TooltipFlag.ADVANCED:TooltipFlag.NORMAL);
                check(rendered.getAsJsonArray("lines").size()==vanilla.size(),"vanilla line count "+entry.getKey()+" advanced="+advanced);
                for(int i=0;i<vanilla.size();i++){JsonArray runs=rendered.getAsJsonArray("lines").get(i).getAsJsonArray();check(text(runs).equals(visual(vanilla.get(i))),"visual text parity "+entry.getKey()+" #"+i);check(stylesEqual(runs,vanilla.get(i)),"style parity "+entry.getKey()+" #"+i);}
                check(rendered.toString().length()<=24000,"wire bound "+entry.getKey());captures.add(entry.getKey()+(advanced?"_advanced":""),rendered);
            }
        }
        check(captures.getAsJsonObject("diamond_sword").getAsJsonArray("lines").size()>1,"sword attributes come from vanilla");
        check(captures.getAsJsonObject("enchanted_book").getAsJsonArray("lines").size()>=3,"both book enchantments");
        check(captures.getAsJsonObject("hidden").getAsJsonArray("lines").isEmpty()&&captures.getAsJsonObject("hidden").getAsJsonArray("name").isEmpty(),"hide_tooltip empty");
        check(!captures.getAsJsonObject("hidden_lore").toString().contains("Green lore"),"hidden_components honored");
        check(captures.getAsJsonObject("bundle").get("partial").getAsBoolean()&&captures.getAsJsonObject("bundle").getAsJsonArray("extra").get(0).getAsJsonObject().get("type").getAsString().equals("bundle"),"bundle image partial summary");
        check(captures.getAsJsonObject("shulker_box").getAsJsonArray("extra").get(0).getAsJsonObject().get("type").getAsString().equals("container"),"container text summary");
        ItemStack typed=new ItemStack(Items.PAPER);JsonObject edit=StackCodec.snapshot(typed,access,new JsonObject(),"");edit.getAsJsonObject("comps").addProperty("custom_data","{precise:9007199254740993L,bytes:[B;1b,2b]}");JsonObject formats=new JsonObject();formats.addProperty("custom_data","snbt");edit.add("component_formats",formats);
        check(StackCodec.decode(edit,access).get(DataComponents.CUSTOM_DATA).copyTag().getLong("precise").orElseThrow()==9007199254740993L,"explicit SNBT exactly typed");
        JsonObject unknown=StackCodec.snapshot(typed,access,new JsonObject(),"");unknown.getAsJsonObject("comps").addProperty("example:not_installed",1);try{StackCodec.decode(unknown,access);throw new AssertionError("unknown component accepted");}catch(RuntimeException expected){check(true,"unknown component rejects safely through apply codec");}
        Component inherited=Component.literal("Parent").withStyle(style->style.withColor(0x123456).withBold(true)).append(Component.literal("child").withStyle(style->style.withItalic(true))).append(Component.literal("override").withStyle(style->style.withBold(false)));
        check(stylesEqual(TooltipPreview.flatten(inherited),inherited),"inherited style and explicit false");
        Component allFlags=Component.literal("Flags 😀").withStyle(s->s.withBold(true).withItalic(true).withUnderlined(true).withStrikethrough(true).withObfuscated(true));
        check(stylesEqual(TooltipPreview.flatten(allFlags),allFlags)&&TooltipPreview.flatten(allFlags).get(0).getAsJsonObject().get("color").isJsonNull(),"all flags, Unicode codepoints and default color");
        Component keybind=Component.keybind("key.jump");check(text(TooltipPreview.flatten(keybind)).equals(visual(keybind)),"keybind follows current vanilla resolver");
        ItemStack font=new ItemStack(Items.PAPER);font.set(DataComponents.CUSTOM_NAME,Component.literal("Custom font").withStyle(s->s.withFont(new FontDescription.Resource(net.minecraft.resources.Identifier.parse("example:font")))));
        JsonObject customFont=TooltipPreview.render("font",font,context,null,false);
        check(!customFont.get("partial").getAsBoolean()&&customFont.getAsJsonArray("name").get(0).getAsJsonObject().get("font").getAsString().equals("example:font"),"custom font is carried by complete text runs");
        check(text(TooltipPreview.flatten(Component.translatable("item.minecraft.diamond"))).equals(Component.translatable("item.minecraft.diamond").getString()),"translation resolved by active Language");
        ItemStack large=new ItemStack(Items.PAPER);List<Component> lore=new ArrayList<>();for(int i=0;i<200;i++)lore.add(Component.literal("a".repeat(200)));large.set(DataComponents.LORE,new net.minecraft.world.item.component.ItemLore(lore));JsonObject limited=TooltipPreview.render("limit",large,context,null,true);check(limited.get("partial").getAsBoolean()&&limited.toString().length()<=24000&&limited.getAsJsonArray("lines").size()<=200,"large tooltip explicit partial bounded");
        Path out=Path.of(args.length>0?args[0]:"logs/tooltip/jvm-responses.json");Files.createDirectories(out.getParent());Files.writeString(out,captures.toString());System.out.println("PASS TooltipPreviewTest "+checks+" checks; JVM vanilla context, no live player/world");
    }
    public static String text(JsonArray runs){StringBuilder out=new StringBuilder();runs.forEach(run->out.append(run.getAsJsonObject().get("text").getAsString()));return out.toString();}
    private static String visual(Component c){StringBuilder out=new StringBuilder();c.getVisualOrderText().accept((i,s,cp)->{out.appendCodePoint(cp);return true;});return out.toString();}
    private static boolean stylesEqual(JsonArray runs,Component component){List<String> actual=new ArrayList<>();for(var e:runs){JsonObject r=e.getAsJsonObject();String style=r.get("color")+"/"+r.get("bold")+"/"+r.get("italic")+"/"+r.get("underlined")+"/"+r.get("strikethrough")+"/"+r.get("obfuscated");r.get("text").getAsString().codePoints().forEach(cp->actual.add(cp+"/"+style));}List<String> expected=new ArrayList<>();component.getVisualOrderText().accept((i,s,cp)->{String color=s.getColor()==null?"null":new JsonPrimitive(String.format(Locale.ROOT,"#%06X",s.getColor().getValue()&0xffffff)).toString();expected.add(cp+"/"+color+"/"+s.isBold()+"/"+s.isItalic()+"/"+s.isUnderlined()+"/"+s.isStrikethrough()+"/"+s.isObfuscated());return true;});return actual.equals(expected);}
}
