package dev.rinorsi.editor.registry;

import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import net.minecraft.core.*;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.*;
import net.minecraft.world.item.*;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.JukeboxBlockEntity;

/** Real WorldTarget raw-NBT and container routes, not only a placement predicate. */
public final class JukeboxReplacementTest {
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion(); net.minecraft.server.Bootstrap.bootStrap();
        run(EntitySchemaTest.access());
    }
    static void run(RegistryAccess access) {
        var level = new EntitySchemaTestLevel(access);
        var empty = new JukeboxBlockEntity(BlockPos.ZERO, Blocks.JUKEBOX.defaultBlockState());
        var disc = new ItemStack(Items.MUSIC_DISC_13);
        disc.set(DataComponents.CUSTOM_DATA, CustomData.of(WorldNbt.parse("{b:1b,s:2s,l:9007199254740993L,a:[L;9223372036854775807L]}")));
        var seeded = empty.saveWithFullMetadata(access);
        seeded.put("RecordItem", ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),disc).getOrThrow());
        var source = (JukeboxBlockEntity)WorldTarget.copyBlock(empty,seeded,access);
        var before = source.saveWithFullMetadata(access);
        var target = WorldTarget.forBlock(level, source);
        require(!source.canPlaceItem(0,disc), "vanilla occupied-slot insertion is denied");
        var edited = disc.copy();
        edited.set(DataComponents.CUSTOM_DATA, CustomData.of(WorldNbt.parse("{b:2b,s:2s,l:9007199254740993L,a:[L;9223372036854775807L]}")));
        var wanted = ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),edited).getOrThrow();
        var raw = before.copy(); raw.put("RecordItem", wanted);
        require(target.prepare(raw,new JsonObject()).get("RecordItem").equals(wanted), "raw editor preserves edited disc typed data");
        var row = new JsonObject(); row.addProperty("slot",0); row.add("stack",StackCodec.snapshot(edited,access,new JsonObject(),""));
        var rows = new JsonArray(); rows.add(row); var container = new JsonObject(); container.add("slots",rows);
        var request = new JsonObject(); request.add("container",container);
        require(target.prepare(before,request).get("RecordItem").equals(wanted), "container editor replaces occupied disc");
        require(source.saveWithFullMetadata(access).equals(before), "validation never removes or changes the live disc");
        for (var invalid : new ItemStack[]{new ItemStack(Items.STONE),new ItemStack(Items.MUSIC_DISC_13,2)}) {
            var invalidNbt = before.copy(); invalidNbt.put("RecordItem",ItemStack.CODEC.encodeStart(access.createSerializationContext(NbtOps.INSTANCE),invalid).getOrThrow());
            try { target.prepare(invalidNbt,new JsonObject()); throw new AssertionError("invalid disc accepted"); }
            catch (EditorSessions.Failure e) { require(e.code.equals("slot_invalid"),"slot restrictions retained: "+e.code); }
        }
        System.out.println("PASS JukeboxReplacementTest: occupied raw/container editing, typed payload, detached validation, non-playable/count rejection");
    }
    private static void require(boolean ok,String message) { if(!ok)throw new AssertionError(message); }
}
