package dev.rinorsi.editor;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

public final class EditorPackets {
    public static final int MAX_JSON = 32767;
    private EditorPackets() {}
    public record Request(String json) implements CustomPacketPayload {
        public static final Type<Request> TYPE = new Type<>(Identifier.fromNamespaceAndPath("cadeditor", "request"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Request> CODEC = StreamCodec.composite(
                ByteBufCodecs.stringUtf8(MAX_JSON), Request::json, Request::new);
        @Override public Type<Request> type() { return TYPE; }
    }
    public record Reply(String json) implements CustomPacketPayload {
        public static final Type<Reply> TYPE = new Type<>(Identifier.fromNamespaceAndPath("cadeditor", "reply"));
        public static final StreamCodec<RegistryFriendlyByteBuf, Reply> CODEC = StreamCodec.composite(
                ByteBufCodecs.stringUtf8(MAX_JSON), Reply::json, Reply::new);
        @Override public Type<Reply> type() { return TYPE; }
    }
}
