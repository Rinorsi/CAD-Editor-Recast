package dev.rinorsi.editor.testing;

import java.util.*;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.ChatFormatting;
import net.minecraft.server.network.Filterable;
import net.minecraft.world.effect.*;
import net.minecraft.world.item.*;
import net.minecraft.world.item.alchemy.PotionContents;
import net.minecraft.world.item.component.*;
import net.minecraft.world.item.enchantment.*;

/** Actual vanilla values, shared by no-window and opt-in hidden-client verification only. */
public final class TooltipFixtures {
    public static Map<String,ItemStack> create(HolderLookup.Provider registries){
        Map<String,ItemStack> cases=new LinkedHashMap<>();
        cases.put("diamond_sword",new ItemStack(Items.DIAMOND_SWORD));
        ItemStack enchanted=new ItemStack(Items.ENCHANTED_BOOK);var enchants=new ItemEnchantments.Mutable(ItemEnchantments.EMPTY);
        enchants.set(registries.lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.SHARPNESS),3);enchants.set(registries.lookupOrThrow(Registries.ENCHANTMENT).getOrThrow(Enchantments.UNBREAKING),2);enchanted.set(DataComponents.STORED_ENCHANTMENTS,enchants.toImmutable());cases.put("enchanted_book",enchanted);
        ItemStack potion=new ItemStack(Items.POTION);potion.set(DataComponents.POTION_CONTENTS,PotionContents.EMPTY.withEffectAdded(new MobEffectInstance(MobEffects.SPEED,1200,1)));cases.put("potion",potion);
        ItemStack book=new ItemStack(Items.WRITTEN_BOOK);book.set(DataComponents.WRITTEN_BOOK_CONTENT,new WrittenBookContent(Filterable.passThrough("Real title"),"Tooltip author",1,List.of(Filterable.passThrough(Component.literal("page"))),true));cases.put("written_book",book);
        ItemStack head=new ItemStack(Items.PLAYER_HEAD);head.set(DataComponents.PROFILE,ResolvableProfile.createResolved(new com.mojang.authlib.GameProfile(UUID.fromString("00000000-0000-0000-0000-000000000001"),"TooltipTest")));cases.put("player_head",head);
        ItemStack horn=new ItemStack(Items.GOAT_HORN);horn.set(DataComponents.INSTRUMENT,new InstrumentComponent(registries.lookupOrThrow(Registries.INSTRUMENT).getOrThrow(Instruments.PONDER_GOAT_HORN)));cases.put("goat_horn",horn);
        ItemStack shulker=new ItemStack(Items.SHULKER_BOX);shulker.set(DataComponents.CONTAINER,ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND,3),new ItemStack(Items.APPLE,2))));cases.put("shulker_box",shulker);
        ItemStack bundle=new ItemStack(Items.BUNDLE);bundle.set(DataComponents.BUNDLE_CONTENTS,new BundleContents(List.of(new ItemStackTemplate(Items.DIAMOND,3),new ItemStackTemplate(Items.APPLE,2))));cases.put("bundle",bundle);
        ItemStack styled=new ItemStack(Items.PAPER);styled.set(DataComponents.CUSTOM_NAME,Component.literal("Red 中文 😀").withStyle(ChatFormatting.RED,ChatFormatting.BOLD).append(Component.literal("Blue").withStyle(ChatFormatting.BLUE)));styled.set(DataComponents.LORE,new ItemLore(List.of(Component.literal("Green lore").withStyle(ChatFormatting.GREEN),Component.translatable("item.minecraft.diamond"))));cases.put("styled",styled);
        ItemStack hidden=styled.copy();hidden.set(DataComponents.TOOLTIP_DISPLAY,new TooltipDisplay(true,new LinkedHashSet<>()));cases.put("hidden",hidden);
        ItemStack hiddenComponents=styled.copy();hiddenComponents.set(DataComponents.TOOLTIP_DISPLAY,TooltipDisplay.DEFAULT.withHidden(DataComponents.LORE,true));cases.put("hidden_lore",hiddenComponents);
        ItemStack modLike=new ItemStack(Items.PAPER);var tag=new net.minecraft.nbt.CompoundTag();tag.putString("example:unknown_payload","opaque");tag.putLong("precise",9007199254740993L);modLike.set(DataComponents.CUSTOM_DATA,CustomData.of(tag));cases.put("mod_like_custom_data",modLike);
        ItemStack map=new ItemStack(Items.FILLED_MAP);map.set(DataComponents.MAP_ID,new net.minecraft.world.level.saveddata.maps.MapId(123));cases.put("map",map);
        return cases;
    }
}
