package dev.rinorsi.editor.registry;
import dev.rinorsi.editor.client.EditDispatch;
import static dev.rinorsi.editor.client.EditDispatch.Action.*;
import static dev.rinorsi.editor.client.EditDispatch.Hit.*;
import java.nio.file.*;
public final class EditDispatchTest {
    private static int checks;
    public static void main(String[] args)throws Exception{
        for(var hit:EditDispatch.Hit.values())for(boolean empty:new boolean[]{false,true}) {
            check(EditDispatch.decide(true,false,hit,empty)==ITEM,"hover priority");
            check(EditDispatch.decide(true,true,hit,empty)==ITEM,"hover before shift");
            check(EditDispatch.decide(false,true,hit,empty)==(empty?SELF:ITEM),"shift skips world");
        }
        for(boolean empty:new boolean[]{false,true}){
            check(EditDispatch.decide(false,false,EditDispatch.Hit.ENTITY,empty)==EditDispatch.Action.ENTITY,"entity wins held item");
            check(EditDispatch.decide(false,false,BLOCK_ENTITY,empty)==BLOCK,"block entity wins held item");
            check(EditDispatch.decide(false,false,BLOCK_STATE,empty)==(empty?BLOCK:ITEM),"plain property block priority");
            check(EditDispatch.decide(false,false,NONE,empty)==(empty?SELF:ITEM),"stone and miss fallback");
        }
        var root=Path.of(System.getProperty("editor.sourceJava", "common/src/main/java"), "dev/rinorsi/editor/client");
        var edit=Files.readString(root.resolve("EditorClient.java"));var world=Files.readString(root.resolve("WorldEditorClient.java"));var vault=Files.readString(root.resolve("VaultClient.java"));
        check(edit.contains("key.cadeditor.edit")&&edit.contains("InputConstants.KEY_I"),"edit registration I language key");
        check(vault.contains("key.cadeditor.vault")&&vault.contains("InputConstants.KEY_O"),"vault registration O language key");
        check(!world.contains("registerKey(new"),"no duplicate world key registration");
        check(!vault.contains("Button.builder")&&!vault.contains("VaultButtonLayout"),"no vault menu button injection");
        check(vault.contains("mc.gui.screen() == null && !modifiersDown(mc)"),"game shortcut rejects modifiers");
        check(edit.split("registerKey",-1).length-1+vault.split("registerKey",-1).length-1+world.split("registerKey",-1).length-1==2,"exactly two registered key mappings");
        for(String lang:new String[]{"zh_cn","en_us"}){var language=com.google.gson.JsonParser.parseString(Files.readString(Path.of("common/src/main/resources/assets/cadeditor/lang/"+lang+".json"))).getAsJsonObject();check(language.has("key.cadeditor.edit")&&language.has("key.cadeditor.vault"),"shortcut languages exist");check(!language.has("gui.cadeditor.vault")&&!language.has("gui.cadeditor.vault.tooltip"),"removed button-only language keys");}
        System.out.println("EditDispatchTest: "+checks+" checks passed");
    }
    private static void check(boolean b,String message){if(!b)throw new AssertionError(message);checks++;}
}
