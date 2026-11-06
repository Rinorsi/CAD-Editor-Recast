import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.nio.file.*;
import java.util.*;

/** External JDI driver; no test classes or mod metadata enter the game classpath. */
public final class LauncherDebugger {
    private static VirtualMachine vm;
    private static Value call(ObjectReference object, ThreadReference thread, String name, List<Value> args) throws Exception {
        Method method = object.referenceType().methodsByName(name).stream().filter(m -> m.argumentTypeNames().size()==args.size()).findFirst().orElseThrow();
        return object.invokeMethod(thread,method,args,ObjectReference.INVOKE_SINGLE_THREADED);
    }
    private static Value stat(String type, ThreadReference thread, String name, List<Value> args) throws Exception {
        ReferenceType owner = vm.classesByName(type).getFirst();
        Method method = owner.methodsByName(name).stream().filter(m -> m.argumentTypeNames().size()==args.size()).findFirst().orElseThrow();
        return owner instanceof ClassType cls
            ? cls.invokeMethod(thread,method,args,ObjectReference.INVOKE_SINGLE_THREADED)
            : ((InterfaceType)owner).invokeMethod(thread,method,args,ObjectReference.INVOKE_SINGLE_THREADED);
    }
    public static void main(String[] args) throws Exception {
        Path output=Path.of(args[0]);
        AttachingConnector connector=Bootstrap.virtualMachineManager().attachingConnectors().stream().filter(c->c.name().endsWith("SocketAttach")).findFirst().orElseThrow();
        var options=connector.defaultArguments(); options.get("hostname").setValue("127.0.0.1");options.get("port").setValue("5007");
        long deadline=System.currentTimeMillis()+180000;
        while(true){try{vm=connector.attach(options);break;}catch(java.io.IOException e){if(System.currentTimeMillis()>deadline)throw e;Thread.sleep(200);}}
        ReferenceType mcType;
        while(vm.classesByName("net.minecraft.client.Minecraft").isEmpty())Thread.sleep(100);
        mcType=vm.classesByName("net.minecraft.client.Minecraft").getFirst();
        BreakpointRequest breakpoint=vm.eventRequestManager().createBreakpointRequest(mcType.methodsByName("tick").getFirst().location());
        breakpoint.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD); breakpoint.enable();
        int stage=0;long next=0;ObjectReference mc=null,driver=null;
        while(System.currentTimeMillis()<deadline){
            EventSet events=vm.eventQueue().remove(2000);if(events==null)continue;
            boolean finish=false;
            for(Event event:events){
                if(!(event instanceof BreakpointEvent hit)||System.currentTimeMillis()<next)continue;
                ThreadReference thread=hit.thread();breakpoint.disable();
                try {
                    mc=(ObjectReference)stat("net.minecraft.client.Minecraft",thread,"getInstance",List.of());
                    ObjectReference screen=(ObjectReference)mc.getValue(mc.referenceType().fieldByName("screen"));
                    if(stage==0){
                        if(screen==null||!screen.referenceType().name().endsWith("TitleScreen")||call(mc,thread,"getOverlay",List.of())!=null)continue;
                        ObjectReference loader=(ObjectReference)stat("net.fabricmc.loader.api.FabricLoader",thread,"getInstance",List.of());
                        for(String id:List.of("editor","oriel")){if(!((BooleanValue)call(loader,thread,"isModLoaded",List.of(vm.mirrorOf(id)))).value())throw new IllegalStateException("Missing "+id);}
                        if(((BooleanValue)call(loader,thread,"isModLoaded",List.of(vm.mirrorOf("editor_backend_probe")))).value())throw new IllegalStateException("Probe leaked");
                        if(vm.allClasses().stream().anyMatch(c->c.name().startsWith("dev.rinorsi.editor.probe.")))throw new IllegalStateException("Probe class loaded");
                        Files.writeString(output.resolve("launcher-debug-phase.txt"),"title");
                        System.out.println("PASS ordinary launcher title screen; editor+oriel loaded; probe absent");
                        stage=1;next=System.currentTimeMillis()+3000;
                    }else if(stage==1){
                        ObjectReference opened=(ObjectReference)stat("dev.oriel.mod.client.OrielScreens",thread,"open",List.of(vm.mirrorOf("oriel_mine:item-editor/index.html")));
                        driver=(ObjectReference)call(opened,thread,"driver",List.of());
                        stage=2;next=System.currentTimeMillis()+3000;
                    }else if(stage==2){
                        ObjectReference doc=(ObjectReference)call(driver,thread,"document",List.of());
                        if(doc==null)continue;
                        ObjectReference scripts=(ObjectReference)call(doc,thread,"scripts",List.of());
                        StringReference value=(StringReference)call(scripts,thread,"evaluateToJson",List.of(vm.mirrorOf("document.documentElement.getAttribute('data-editor-controller')==='ready'&&!!document.getElementById('win')"),vm.mirrorOf("external-launcher-check")));
                        if(!"true".equals(value.value()))throw new IllegalStateException("Folder page not ready: "+value.value());
                        Files.writeString(output.resolve("launcher-debug-phase.txt"),"page");
                        System.out.println("PASS folder URL opened through Oriel public API on render thread; controller ready");
                        stage=3;next=System.currentTimeMillis()+3000;
                    }else{call(mc,thread,"stop",List.of());finish=true;}
                }finally{if(!finish)breakpoint.enable();}
            }
            events.resume();
            if(finish){vm.dispose();System.out.println("PASS clean stop requested");return;}
        }
        vm.dispose();throw new IllegalStateException("Launcher verification timeout stage="+stage);
    }
}
