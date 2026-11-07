package dev.rinorsi.editor.testing;

import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipFile;
import net.minecraft.core.*;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.*;
import net.minecraft.tags.*;
import net.minecraft.world.item.enchantment.Enchantment;

/** Test-only: datagen lookups leave tags unbound. Load actual shipped tags, never a hand-written order. */
public final class TooltipTestRegistries {
    public static HolderLookup.Provider bindEnchantmentTags(HolderLookup.Provider source)throws Exception {
        var registry=source.lookupOrThrow(Registries.ENCHANTMENT);
        Map<Identifier,List<TagLoader.EntryWithSource>> files=new LinkedHashMap<>();String prefix="data/minecraft/tags/enchantment/";
        var location=net.minecraft.world.item.Item.class.getProtectionDomain().getCodeSource().getLocation().toURI();
        try(var zip=new ZipFile(new java.io.File(location))){var entries=zip.entries();while(entries.hasMoreElements()){var entry=entries.nextElement();String path=entry.getName();if(!path.startsWith(prefix)||!path.endsWith(".json"))continue;
            try(var reader=new java.io.InputStreamReader(zip.getInputStream(entry),StandardCharsets.UTF_8)){TagFile tag=TagFile.CODEC.parse(JsonOps.INSTANCE,JsonParser.parseReader(reader)).getOrThrow();files.put(Identifier.withDefaultNamespace(path.substring(prefix.length(),path.length()-5)),tag.entries().stream().map(e->new TagLoader.EntryWithSource(e,"vanilla-jar")).toList());}
        }}
        if(files.isEmpty())throw new IllegalStateException("No actual vanilla enchantment tags in dependency jar");
        TagLoader<Holder<Enchantment>> loader=new TagLoader<>((id,required)->registry.get(ResourceKey.create(Registries.ENCHANTMENT,id)),"tags/enchantment");
        var loaded=loader.build(files);Map<TagKey<Enchantment>,HolderSet.Named<Enchantment>> tags=new LinkedHashMap<>();
        var bindSet=HolderSet.Named.class.getDeclaredMethod("bind",List.class);bindSet.setAccessible(true);
        var constructor=HolderSet.Named.class.getDeclaredConstructor(HolderOwner.class,TagKey.class);constructor.setAccessible(true);
        for(var entry:loaded.entrySet()){var key=TagKey.create(Registries.ENCHANTMENT,entry.getKey());
            @SuppressWarnings("unchecked") HolderSet.Named<Enchantment> named=(HolderSet.Named<Enchantment>)constructor.newInstance(registry,key);
            bindSet.invoke(named,entry.getValue());tags.put(key,named);}
        var bindHolder=Holder.Reference.class.getDeclaredMethod("bindTags",Collection.class);bindHolder.setAccessible(true);
        for(var holder:registry.listElements().toList()){List<TagKey<Enchantment>> memberships=new ArrayList<>();tags.forEach((key,set)->{if(set.stream().anyMatch(h->h==holder))memberships.add(key);});bindHolder.invoke(holder,memberships);}
        HolderLookup.RegistryLookup<Enchantment> bound=new HolderLookup.RegistryLookup.Delegate<>(){
            public HolderLookup.RegistryLookup<Enchantment> parent(){return registry;}
            public Optional<HolderSet.Named<Enchantment>> get(TagKey<Enchantment> tag){return Optional.ofNullable(tags.get(tag));}
            public java.util.stream.Stream<HolderSet.Named<Enchantment>> listTags(){return tags.values().stream();}
        };
        return HolderLookup.Provider.create(source.listRegistries().map(r->r.key().equals(Registries.ENCHANTMENT)?bound:r));
    }
}
