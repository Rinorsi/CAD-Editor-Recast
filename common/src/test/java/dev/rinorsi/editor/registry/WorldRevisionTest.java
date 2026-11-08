package dev.rinorsi.editor.registry;
import com.google.gson.*;
import dev.rinorsi.editor.*;
import dev.rinorsi.editor.world.*;
import java.util.*;
/** Frozen session generations, reason metadata and a deterministic non-sliding rate window. */
public final class WorldRevisionTest {
    private static int checks;
    public static void main(String[] args){
        net.minecraft.SharedConstants.tryDetectVersion();net.minecraft.server.Bootstrap.bootStrap();
        long[] clock={0};var sessions=new WorldEditSessions(()->clock[0]);var player=UUID.randomUUID();var slot=JsonParser.parseString("{kind:'entity',dim:'minecraft:overworld',uuid:'horse',token:'t'}").getAsJsonObject();
        var base=WorldNbt.parse("{id:'minecraft:horse',UUID:'horse',Pos:[0d,65d,0d],Temper:0,Passengers:[{id:'minecraft:chicken',UUID:'chicken',Pos:[0d,66d,0d],Age:-200,InLove:200,EggLayTime:200}]}");
        var state=sessions.open(player,slot,base);String revision=state.revision;var current=base.copy();var chicken=current.getList("Passengers").orElseThrow().getCompound(0).orElseThrow();chicken.putInt("EggLayTime",180);chicken.putInt("InLove",0);chicken.putInt("Age",-180);current.putInt("Temper",1);
        check(sessions.require(player,slot,revision,current)==state,"live unknown timers never become a revision mismatch");check(state.baseline.equals(base)&&state.revision.equals(revision),"baseline and cached revision immutable under require");
        sessions.rateLimit(player);var limited=error(()->sessions.rateLimit(player),"rate_limited");check(limited.retryAfterMs==500,"initial retry delay");clock[0]=100_100_000L;check(error(()->sessions.rateLimit(player),"rate_limited").retryAfterMs==400,"retry rounds up remaining time");clock[0]=499_000_001L;check(error(()->sessions.rateLimit(player),"rate_limited").retryAfterMs==1,"last fractional ms");clock[0]=500_000_000L;sessions.rateLimit(player);checks++;check(state.revision.equals(revision),"rate outcomes do not change revision");
        var after=current.copy();after.putString("CustomName","new");state.saved(current,after,false);check(!state.revision.equals(revision)&&state.preimage().equals(current),"success advances exact baseline and stores actual preimage");var stale=error(()->sessions.require(player,slot,revision,after),"target_changed");check(stale.stale.equals("client_revision"),"old successful-save revision is explicitly diagnosed");var reply=reply("target_changed",stale);check(reply.get("stale").getAsString().equals("client_revision"),"stale wire shape");
        var other=after.copy();other.putString("UUID","different");try{sessions.require(player,slot,state.revision,other);throw new AssertionError("identity accepted");}catch(WorldMerge.Conflict conflict){var r=reply("target_changed",conflict);check(r.get("stale").getAsString().equals("identity")&&r.getAsJsonArray("conflicts").size()==1,"identity includes reason and paths");}
        var mine=after.copy();mine.putInt("Temper",2);var theirs=after.copy();theirs.putInt("Temper",3);try{WorldMerge.merge(after,mine,theirs);throw new AssertionError("path conflict accepted");}catch(WorldMerge.Conflict conflict){var r=reply("target_changed",conflict);check(r.has("conflicts")&&!r.has("stale"),"real path conflict remains distinct");}
        check(reply("target_changed",new EditorSessions.Failure("target_changed","old branch")).get("stale").getAsString().equals("session"),"every legacy target_changed has an explicit reason");check(reply("session_lost",new EditorSessions.Failure("session_lost","closed")).get("stale").getAsString().equals("session"),"lost session diagnosed");check(reply("rate_limited",limited).get("retryAfterMs").getAsInt()==500,"rate wire field");
        String previous=state.revision;var same=state.baseline.copy();state.saved(same,same,false);check(!state.revision.equals(previous)&&state.revision.matches("[a-f0-9]{64}"),"even a no-op save advances an opaque session generation, with no ticking-field hash rule");error(()->sessions.require(player,slot,previous,same),"target_changed");
        System.out.println("PASS WorldRevisionTest "+checks+" checks");
    }
    private static WorldEditError error(Runnable run,String code){try{run.run();throw new AssertionError("expected "+code);}catch(WorldEditError e){check(e.code.equals(code),"error code "+code);return e;}}
    private static JsonObject reply(String code,RuntimeException e){var r=new JsonObject();r.addProperty("code",code);WorldEditError.annotate(r,e);var parsed=WorldWire.decode(JsonParser.parseString(WorldWire.encode(r)).getAsJsonObject());check(parsed.equals(r),"error metadata survives wire encoding");return r;}
    private static void check(boolean b,String m){if(!b)throw new AssertionError(m);checks++;}
}
