import java.nio.file.Files;
import java.nio.file.Path;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import net.minecraft.server.packs.metadata.pack.PackMetadataSection;

/** Real 26.1.2 metadata codec only; deliberately NOT a game-load/live PASS. */
public final class RegistryPackMetadataAudit {
    public static void main(String[] args) throws Exception {
        net.minecraft.SharedConstants.tryDetectVersion();
        net.minecraft.server.Bootstrap.bootStrap();
        var json=JsonParser.parseString(Files.readString(Path.of(args[0]))).getAsJsonObject();
        var parsed=PackMetadataSection.SERVER_TYPE.codec().parse(JsonOps.INSTANCE,json.get("pack")).getOrThrow();
        System.out.println("PASS real Minecraft server pack metadata codec: "+parsed.supportedFormats());
    }
}
