package dev.rinorsi.editor.registry;

import com.google.gson.*;
import java.util.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.*;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.*;

/** Calls vanilla, then reads precisely the visual character stream its text renderer consumes. */
public final class TooltipPreview {
    public static final int MAX_LINES=200, MAX_CHARS=24000;
    private static final int MAX_CODEPOINTS=10000, MAX_RUNS=1000;
    private TooltipPreview(){}
    private static final class Budget {int chars,runs;boolean partial,stylePartial;}
    public static JsonArray flatten(Component component){return flatten(component,new Budget());}
    private static JsonArray flatten(Component component,Budget budget){
        JsonArray runs=new JsonArray();final JsonObject[] last={null};final StringBuilder text=new StringBuilder();
        component.getVisualOrderText().accept((position,style,codepoint)->{
            if(budget.chars>=MAX_CODEPOINTS||budget.runs>=MAX_RUNS){budget.partial=true;return false;}
            JsonObject run=style(style);
            if(!FontDescription.DEFAULT.equals(style.getFont())||style.getShadowColor()!=null)budget.stylePartial=true;
            if(last[0]==null||!last[0].equals(run)){
                if(last[0]!=null){last[0].addProperty("text",text.toString());runs.add(last[0]);}
                last[0]=run;text.setLength(0);budget.runs++;
            }
            text.appendCodePoint(codepoint);budget.chars++;return true;
        });
        if(last[0]!=null){last[0].addProperty("text",text.toString());runs.add(last[0]);}
        return runs;
    }
    private static JsonObject style(Style style){
        JsonObject out=new JsonObject();
        if(style.getColor()==null)out.add("color",JsonNull.INSTANCE);else out.addProperty("color",color(style.getColor().getValue()));
        out.addProperty("bold",style.isBold());out.addProperty("italic",style.isItalic());out.addProperty("underlined",style.isUnderlined());out.addProperty("strikethrough",style.isStrikethrough());out.addProperty("obfuscated",style.isObfuscated());return out;
    }
    private static String color(int color){return String.format(Locale.ROOT,"#%06X",color&0xffffff);}
    public static JsonObject render(String requestId,ItemStack stack,Item.TooltipContext context,Player player,boolean advanced){
        TooltipDisplay display=stack.getOrDefault(DataComponents.TOOLTIP_DISPLAY,TooltipDisplay.DEFAULT);
        // Even hidden tooltips go through vanilla, including mod injections. The protocol's hide rule
        // deliberately suppresses vanilla's special operator-NBT warning exception too.
        List<Component> vanilla=stack.getTooltipLines(context,player,advanced?TooltipFlag.ADVANCED:TooltipFlag.NORMAL);
        boolean hidden=display.hideTooltip();
        JsonObject out=new JsonObject();out.addProperty("version",1);out.addProperty("requestId",requestId);out.addProperty("ok",true);
        Budget budget=new Budget();JsonArray name=hidden?new JsonArray():flatten(vanilla.isEmpty()?stack.getStyledHoverName():vanilla.getFirst(),budget);out.add("name",name);
        JsonArray lines=new JsonArray();
        if(!hidden)for(Component component:vanilla){if(lines.size()>=MAX_LINES||budget.partial){budget.partial=true;break;}lines.add(flatten(component,budget));}
        out.add("lines",lines);out.addProperty("rarityColor",color(stack.getRarity().color().getColor()));
        JsonArray extra=new JsonArray();
        if(hidden||!display.hiddenComponents().isEmpty()){JsonObject flags=new JsonObject();flags.addProperty("type","tooltip_display");flags.addProperty("hide_tooltip",hidden);JsonArray components=new JsonArray();display.hiddenComponents().stream().limit(256).forEach(type->components.add(String.valueOf(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type))));flags.add("hidden_components",components);extra.add(flags);}
        if(!hidden){
            var image=stack.getTooltipImage();
            if(image.isPresent()){
                JsonObject info=new JsonObject();Object data=image.get();
                if(data instanceof net.minecraft.world.inventory.tooltip.BundleTooltip tooltip){BundleContents bundle=tooltip.contents();info.addProperty("type","bundle");info.addProperty("count",bundle.size());info.addProperty("selectedIndex",bundle.getSelectedItemIndex());JsonArray items=new JsonArray();bundle.itemCopyStream().limit(27).forEach(item->items.add(summary(item)));info.add("items",items);info.addProperty("truncated",bundle.size()>27);}
                else {info.addProperty("type","tooltip_component");info.addProperty("class",data.getClass().getName());}
                extra.add(info);budget.partial=true;
            }
            // Container contents are real vanilla TEXT lines, not an invented shulker image renderer.
            var container=stack.get(DataComponents.CONTAINER);
            if(container!=null&&display.shows(DataComponents.CONTAINER)){JsonObject info=new JsonObject();info.addProperty("type","container");info.addProperty("textOnly",true);JsonArray items=new JsonArray();container.nonEmptyItemCopyStream().limit(27).forEach(item->items.add(summary(item)));info.add("items",items);extra.add(info);}
            var map=stack.get(DataComponents.MAP_ID);if(map!=null&&display.shows(DataComponents.MAP_ID)){JsonObject info=new JsonObject();info.addProperty("type","map");info.addProperty("id",map.id());info.addProperty("imageAvailable",false);extra.add(info);budget.partial=true;}
        }
        if(budget.stylePartial){JsonObject style=new JsonObject();style.addProperty("type","style_features");style.addProperty("reason","custom font or shadow is not represented by text runs");extra.add(style);budget.partial=true;}
        out.add("extra",extra);out.addProperty("partial",budget.partial);
        // Never emit oversized Oriel patches, and never pretend omitted lines are a complete tooltip.
        boolean truncated=budget.partial&&budget.chars>=MAX_CODEPOINTS;
        while(out.toString().length()>MAX_CHARS&&!lines.isEmpty()){lines.remove(lines.size()-1);truncated=true;}
        if(out.toString().length()>MAX_CHARS){extra=new JsonArray();out.add("extra",extra);truncated=true;}
        if(truncated||budget.runs>=MAX_RUNS||lines.size()<(!hidden?vanilla.size():0)){out.addProperty("partial",true);out.addProperty("truncated",true);}
        if(out.toString().length()>MAX_CHARS)throw new IllegalArgumentException("Tooltip name exceeds response size limit");
        return out;
    }
    private static JsonObject summary(ItemStack item){JsonObject out=new JsonObject();out.addProperty("id",BuiltInRegistries.ITEM.getKey(item.getItem()).toString());out.addProperty("count",item.getCount());String name=item.getHoverName().getString();out.addProperty("name",name.substring(0,Math.min(name.length(),256)));return out;}
}
