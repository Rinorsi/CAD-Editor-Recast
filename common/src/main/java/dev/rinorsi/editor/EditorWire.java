package dev.rinorsi.editor;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;

/** Bounded, ordered transport on the existing packet channel. No partial request is executed. */
public final class EditorWire {
    public static final int MAX_NBT_CHARS = 1_048_576;
    // JSON carries the value, typed sidecar, baseline and escaped strings, not only the NBT.
    public static final int MAX_JSON_BYTES = 16 * 1024 * 1024;
    private static final int PART_CHARS = 24000, MAX_PARTS = 1024;
    private EditorWire() {}
    public static void requirePayload(String text) {
        if(text.length()>MAX_JSON_BYTES || text.getBytes(StandardCharsets.UTF_8).length>MAX_JSON_BYTES)
            EditorSessions.fail("payload_too_large","编辑消息超过 16 MiB");
    }
    public static List<String> frames(String text) {
        requirePayload(text);
        byte[] bytes=text.getBytes(StandardCharsets.UTF_8);
        if(text.length()<=24000 && bytes.length<=30000)return List.of(text);
        try {
            var output=new ByteArrayOutputStream();
            try(var gzip=new GZIPOutputStream(output)){gzip.write(bytes);}
            String data=Base64.getEncoder().encodeToString(output.toByteArray());
            int count=(data.length()+PART_CHARS-1)/PART_CHARS;
            if(count>MAX_PARTS)EditorSessions.fail("payload_too_large","编辑消息分片超过上限");
            String id=UUID.randomUUID().toString();var frames=new ArrayList<String>(count);
            for(int index=0;index<count;index++){
                var frame=new JsonObject();frame.addProperty("editorEncoding","gzip-parts-v1");frame.addProperty("transfer",id);
                frame.addProperty("index",index);frame.addProperty("count",count);
                frame.addProperty("data",data.substring(index*PART_CHARS,Math.min(data.length(),(index+1)*PART_CHARS)));
                frames.add(frame.toString());
            }
            return frames;
        }catch(IOException failure){throw new IllegalArgumentException("编辑消息压缩失败",failure);}
    }
    /** One bounded in-flight transfer per connection, on its owning game thread. */
    public static final class Receiver {
        private String transfer;private StringBuilder data;private int count,next;private long deadline;
        public void clear(){transfer=null;data=null;count=next=0;deadline=0;}
        public String accept(String text){
            if(!text.contains("\"editorEncoding\""))return text;
            var frame=JsonParser.parseString(text).getAsJsonObject();
            if(!frame.has("editorEncoding"))return text;
            try {
                if(!StackCodec.string(frame,"editorEncoding").equals("gzip-parts-v1"))throw new IllegalArgumentException("未知编辑消息分片格式");
                String id=StackCodec.string(frame,"transfer");UUID.fromString(id);
                int index=StackCodec.integer(frame,"index",0,MAX_PARTS-1),parts=StackCodec.integer(frame,"count",1,MAX_PARTS);
                String part=StackCodec.string(frame,"data");
                if(part.isEmpty()||part.length()>PART_CHARS)throw new IllegalArgumentException("编辑消息分片大小无效");
                long now=System.nanoTime();
                if(index==0){clear();transfer=id;count=parts;data=new StringBuilder();deadline=now+30_000_000_000L;}
                if(data==null||now>deadline||!id.equals(transfer)||count!=parts||next!=index)throw new IllegalArgumentException("编辑消息分片过期或顺序不匹配；请重新提交");
                data.append(part);next++;
                if(next<count)return null;
                byte[] zipped=Base64.getDecoder().decode(data.toString());clear();
                try(var gzip=new GZIPInputStream(new ByteArrayInputStream(zipped))){
                    byte[] decoded=gzip.readNBytes(MAX_JSON_BYTES+1);
                    if(decoded.length>MAX_JSON_BYTES)EditorSessions.fail("payload_too_large","编辑消息展开后超过 16 MiB");
                    String result=new String(decoded,StandardCharsets.UTF_8);
                    var value=JsonParser.parseString(result).getAsJsonObject();
                    if(value.has("editorEncoding"))throw new IllegalArgumentException("不允许嵌套编辑消息分片");
                    return result;
                }
            }catch(IOException failure){clear();throw new IllegalArgumentException("编辑消息分片解压失败",failure);}
            catch(RuntimeException failure){clear();throw failure;}
        }
    }
}
