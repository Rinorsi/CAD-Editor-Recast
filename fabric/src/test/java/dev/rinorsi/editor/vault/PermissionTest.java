package dev.rinorsi.editor.vault;

import com.google.gson.JsonObject;
import dev.rinorsi.editor.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import net.minecraft.SharedConstants;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.*;
import net.minecraft.world.level.GameType;

public final class PermissionTest {
    private static int checks;
    private static void check(boolean ok, String name) { if (!ok) throw new AssertionError(name); checks++; System.out.println("PASS "+name); }
    private static void reject(String code, Runnable action) {
        try { action.run(); throw new AssertionError("expected "+code); }
        catch (EditorSessions.Failure failure) { check(failure.code.equals(code), "reject "+code+" got "+failure.code); }
    }
    public static ItemStack typed() {
        var inner = new ItemStack(Items.PAPER);
        var tag = new CompoundTag(); tag.putLong("precise", 9007199254740993L); tag.putFloat("fraction",0.8f); tag.putLongArray("array",new long[]{Long.MAX_VALUE});
        inner.set(DataComponents.CUSTOM_DATA,CustomData.of(tag));
        var outer = new ItemStack(Items.SHULKER_BOX);
        outer.set(DataComponents.CONTAINER,ItemContainerContents.fromItems(List.of(inner)));
        outer.set(DataComponents.CUSTOM_DATA,CustomData.of(tag)); return outer;
    }
    public static void main(String[] args) {
        SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
        var lookup=net.minecraft.data.registries.VanillaRegistries.createLookup();
        BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup).forEach(p->p.apply());
        var registries=RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        for (GameType mode : GameType.values()) for (boolean gm : List.of(true,false)) {
            boolean creative=mode==GameType.CREATIVE;
            for (boolean legacy : List.of(true,false)) check(new EditorPolicy(4,legacy).allows(creative,gm)==(creative||gm),
                    "permission matrix "+mode+" gamemaster="+gm+" legacyCreativeOnly="+legacy);
            check(InventoryWrites.givePath(creative,true)==(creative?InventoryWrites.GivePath.CREATIVE:InventoryWrites.GivePath.SERVER), "installed give path "+mode+" gm="+gm);
            check(InventoryWrites.givePath(creative,false)==(creative?InventoryWrites.GivePath.CREATIVE:InventoryWrites.GivePath.UNAVAILABLE), "vanilla server give path "+mode+" gm="+gm);
        }
        var stack=typed(); var wire=StackCodec.snapshot(stack,registries,new JsonObject(),"");
        var decoded=StackCodec.decode(wire,registries); check(ItemStack.matches(stack,decoded),"typed long float nested container sidecars roundtrip");
        var inventory=new SimpleContainer(36); var request=new JsonObject();
        int index=InventoryWrites.insert(inventory,decoded,request); check(index==9,"first default inventory empty slot");
        check(ItemStack.matches(stack,inventory.getItem(index)),"insert preserves typed nested stack");
        request.addProperty("inventoryIndex",9); reject("slot_changed",()->InventoryWrites.insert(inventory,new ItemStack(Items.DIAMOND),request));
        check(ItemStack.matches(stack,inventory.getItem(9)),"occupied explicit slot never overwritten");
        request.addProperty("inventoryIndex",0);check(InventoryWrites.insert(inventory,decoded,request)==0,"explicit hotbar index accepted");
        for(int i=9;i<36;i++)inventory.setItem(i,new ItemStack(Items.STONE,64));
        request.remove("inventoryIndex");reject("inventory_full",()->InventoryWrites.insert(inventory,decoded,request));
        request.addProperty("slot","hotbar");check(InventoryWrites.insert(inventory,decoded,request)==1,"hotbar chooses next empty slot");
        request.addProperty("slot","cursor");reject("unsupported_slot",()->InventoryWrites.insert(inventory,decoded,request));
        check(inventory.getItem(10).is(Items.STONE)&&inventory.getItem(10).getCount()==64,"full inventory failure preserves old items");

        var receipts=new GiveReceipts();var writes=new AtomicInteger();var give=new JsonObject();give.addProperty("requestId","one");give.addProperty("slot","inventory");give.add("stack",wire);
        var reply=receipts.execute(give,()->{writes.incrementAndGet();var out=new JsonObject();out.addProperty("inventoryIndex",13);return out;});
        reply.addProperty("inventoryIndex",99);
        var repeated=receipts.execute(give.deepCopy(),()->{writes.incrementAndGet();return new JsonObject();});
        check(writes.get()==1&&repeated.get("inventoryIndex").getAsInt()==13,"same requestId executes once and reply detached");
        give.addProperty("slot","hotbar");reject("request_id_conflict",()->receipts.execute(give,()->new JsonObject()));
        check(writes.get()==1,"changed payload on same request never mutates");
        give.addProperty("requestId","two");receipts.execute(give,()->{writes.incrementAndGet();return new JsonObject();});check(writes.get()==2,"new deliberate request executes");
        UUID player=UUID.randomUUID();for(int i=0;i<20;i++)InventoryWrites.rateLimit(player,0);
        reject("rate_limited",()->InventoryWrites.rateLimit(player,0));InventoryWrites.rateLimit(player,1_000_000_000L);check(true,"rate window recovers next second");InventoryWrites.remove(player);
        System.out.println("PASS PermissionTest "+checks+" checks; real vanilla Codec and detached containers, no client/server started");
    }
}
