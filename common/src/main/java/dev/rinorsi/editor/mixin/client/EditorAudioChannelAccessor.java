package dev.rinorsi.editor.mixin.client;

import com.mojang.blaze3d.audio.Channel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;
import net.minecraft.client.sounds.AudioStream;

/** Accessed only on Minecraft's sound executor, for the editor-owned preview. */
@Mixin(Channel.class)
public interface EditorAudioChannelAccessor {
    @Accessor("source") int cadeditor$source();
    @Accessor("stream") AudioStream cadeditor$stream();
    @Accessor("stream") void cadeditor$stream(AudioStream stream);
    @Invoker("removeProcessedBuffers") int cadeditor$removeProcessedBuffers();
}
