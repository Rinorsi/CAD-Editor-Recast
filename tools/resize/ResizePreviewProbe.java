import dev.oriel.engine.dom.Document;
import dev.oriel.engine.dom.Viewport;
import dev.oriel.preview.host.PreviewHost;
import dev.oriel.preview.render.*;
import java.nio.file.*;
import java.util.*;
import com.google.gson.*;

/** No Gradle, native window, Minecraft process, clipboard or OS input. Uses the installed preview with release engine first on classpath. */
public final class ResizePreviewProbe {
    private static double now;
    private static int assertions;
    private static final String SAMPLE = "(function(){var w=document.getElementById('win');var r=w.getBoundingClientRect();var sels=['.ed-stats','.ed-tags','.ed-tip','.ed-stagehead','.ed-addset span','.k-search span'];var h={};for(var i=0;i<sels.length;i++){var e=document.querySelector(sels[i]);h[sels[i]]=e!=null?getComputedStyle(e).display:'missing';}return {innerWidth:innerWidth,innerHeight:innerHeight,dpr:devicePixelRatio,width:r.width,classes:w.className,hidden:h,resizeEvents:resizeEvents};})()";
    public static void main(String[] args) throws Exception {
        Path root=Path.of(args[0]), out=root.resolve("logs/resize"); Files.createDirectories(out);
        try(var assets=MinecraftAssets.openForPage(List.of(root.resolve("fabric/src/main/resources"),Path.of(args[1]).resolve("kit/src/main/resources")),Optional.of(Path.of(args[2])))) {
            var font=new MinecraftFont(assets); var host=new PreviewHost(assets,font);
            String url="cadeditor:ui/index.html", html=host.loadText(url);
            String data="""
                {"stack":{"id":"minecraft:diamond_sword","count":1,"comps":{},"removed":{},"slot":{"kind":"inventory","index":0},"label":"resize probe"},"prefs":{}}
                """;
            JsonArray all=new JsonArray();
            // Independent initial viewport sweep then one unchanged Document with viewport and DPR changes.
            int[][] sizes={{1500,1100,1},{1100,800,2},{760,560,1},{600,420,1},{460,360,1}};
            for(int[] s:sizes) {
                float w=(float)Math.ceil((double)s[0]/s[2]),h=(float)Math.ceil((double)s[1]/s[2]);
                Document d=Document.parse(host,url,html,data,new Viewport(w,h,s[2]));
                instrument(d); frames(d,10); var row=sample(d); row.addProperty("physical",s[0]+"x"+s[1]+"@"+s[2]);row.addProperty("kind","initial");all.add(row);
                expect(row.get("classes").getAsString().equals(s[0]==1500?"ew":s[0]==460?"ew narrow":"ew snug"),"initial responsive mode: "+row);
                var image=new java.awt.image.BufferedImage(s[0],s[1],java.awt.image.BufferedImage.TYPE_INT_ARGB);
                var canvas=new ImageCanvas(image,s[2],assets,font); d.paint(canvas);canvas.dispose();
                javax.imageio.ImageIO.write(image,"png",out.resolve("initial-"+s[0]+"-"+s[2]+".png").toFile());
                check(d);d.close();
            }
            Document d=Document.parse(host,url,html,data,new Viewport(460,360,1));instrument(d);frames(d,10);
            for(int[] s:new int[][]{{460,360,1},{1500,1100,1},{600,420,1},{1500,1100,4},{1500,1100,1},{460,360,1},{1500,1100,1}}) {
                d.setViewport((float)Math.ceil((double)s[0]/s[2]),(float)Math.ceil((double)s[1]/s[2]),s[2]);
                var immediate=sample(d);frames(d,6);var settled=sample(d);
                settled.addProperty("physical",s[0]+"x"+s[1]+"@"+s[2]);settled.addProperty("kind","same_document");settled.add("immediate",immediate);all.add(settled);check(d);
            }
            String events=d.scripts().evaluateToJson("resizeSamples","resize-inspect");
            expect(JsonParser.parseString(events).getAsJsonArray().size()==6,"one event per changed viewport, none for unchanged viewport");
            Files.writeString(out.resolve("resize-events.json"),events);
            d.scripts().evaluate("scheduleFit();","manual-refit");frames(d,6);
            var afterTransition=sample(d);afterTransition.addProperty("kind","manual_refit_after_transition");all.add(afterTransition);
            expect(afterTransition.get("classes").getAsString().equals("ew"),"settled refit restores normal mode");
            d.scripts().evaluate("document.getElementById('win').style.setProperty('transition','none','important');resizeEvents=0;resizeSamples=[];","disable-transitions");frames(d,6);
            for(int w:new int[]{460,1500,460,1500}) {
                d.setViewport(w,w==460?360:1100,1);frames(d,6);
                var row=sample(d);row.addProperty("physical",w+"x"+(w==460?360:1100)+"@1");row.addProperty("kind","same_document_no_transition");all.add(row);
                expect(row.get("classes").getAsString().equals(w==460?"ew narrow":"ew"),"unanimated resize mode: "+row);
            }
            Files.writeString(out.resolve("resize-events-no-transition.json"),d.scripts().evaluateToJson("resizeSamples","resize-inspect"));
            d.close();
            Files.writeString(out.resolve("preview-results.json"),new GsonBuilder().setPrettyPrinting().create().toJson(all));
            if(!host.runtimeErrors().isEmpty()) throw new AssertionError(host.runtimeErrors());
            System.out.println("PASS initial viewport sweep and same-Document small/large/DPR resize; "+assertions+" assertions; "+all.size()+" samples; engine="+Document.class.getProtectionDomain().getCodeSource().getLocation());
            System.out.println(all);
        }
    }
    private static void instrument(Document d) {d.scripts().evaluate("var resizeEvents=0,resizeSamples=[];window.addEventListener('resize',function(){resizeEvents++;var e=document.getElementById('win');resizeSamples.push({innerWidth:innerWidth,innerHeight:innerHeight,dpr:devicePixelRatio,width:e.getBoundingClientRect().width,classes:e.className});});","resize-instrument");}
    private static void frames(Document d,int count) {for(int i=0;i<count;i++) {now+=80;d.frame(now);check(d);}}
    private static JsonObject sample(Document d) {return JsonParser.parseString(d.scripts().evaluateToJson(SAMPLE,"resize-sample")).getAsJsonObject();}
    private static void check(Document d) {if(d.error()!=null) throw new AssertionError("document stopped",d.error());}
    private static void expect(boolean condition,String message) {assertions++;if(!condition)throw new AssertionError(message);}
}
