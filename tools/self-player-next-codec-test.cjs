const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'common/src/main/java/dev/rinorsi/editor/client');
const source=fs.readFileSync(path.join(dir,'SelfPlayerCommandPlan.java'),'utf8'),session=fs.readFileSync(path.join(dir,'SelfPlayerCommands.java'),'utf8');
function method(signature){const start=source.indexOf(signature);assert.ok(start>=0,signature);let end=source.indexOf('{',start)+1,depth=1;while(depth){if(source[end]==='{')depth++;if(source[end]==='}')depth--;end++;}return source.slice(start,end);}
const helpers=['private static int quantizePoints(','private static float wrap(','private static boolean sameFloat(','private static String decimal(','private static double attributeBase(','static JsonObject positionTag(','private static boolean matchesPosition(','private static IllegalArgumentException bad('].map(method).join(String.fromCharCode(10));
const probe=[
'import java.util.*;import java.math.BigDecimal;',
'class SelfPlayerNextCodecProbe {',helpers,
'static class Value {Number n;Value(Number n){this.n=n;}double getAsDouble(){return n.doubleValue();}float getAsFloat(){return n.floatValue();}}',
'static class JsonObject {Map<String,Value> map=new HashMap<>();void addProperty(String k,Number n){map.put(k,new Value(n));}Value get(String k){return map.get(k);}}',
'static class ListTag extends ArrayList<Object>{Optional<Double> getDouble(int i){return get(i) instanceof Number n?Optional.of(n.doubleValue()):Optional.empty();}Optional<Float> getFloat(int i){return get(i) instanceof Number n?Optional.of(n.floatValue()):Optional.empty();}}',
'static class CompoundTag {Map<String,Object> map=new HashMap<>();Optional<ListTag> getList(String k){return Optional.ofNullable((ListTag)map.get(k));}Optional<String> getString(String k){return Optional.ofNullable((String)map.get(k));}Optional<Double> getDouble(String k){return map.get(k) instanceof Number n?Optional.of(n.doubleValue()):Optional.empty();}}',
'static void check(boolean v,String m){if(!v)throw new AssertionError(m);}static void rejects(Runnable r){try{r.run();}catch(RuntimeException e){return;}throw new AssertionError("expected rejection");}',
'static ListTag list(Object... values){var l=new ListTag();l.addAll(Arrays.asList(values));return l;}',
'static CompoundTag pos(double x,float yaw){var t=new CompoundTag();t.map.put("Pos",list(x,64d,2d));t.map.put("Rotation",list(yaw,0f));return t;}',
'public static void main(String[] args){',
'check(quantizePoints(0,15)==0,"zero points");check(quantizePoints(0.5,15)==8,"nearest integer points");check(quantizePoints(Math.nextDown(1d),15)==14,"cannot accidentally level up");rejects(()->quantizePoints(Double.NaN,15));rejects(()->quantizePoints(1,15));rejects(()->quantizePoints(0.5,0));',
'check(sameFloat(0.5f,0.5f),"exact synchronized XP float");check(!sameFloat(Math.nextUp(0.5f),0.5f),"adjacent XP float cannot falsely confirm");check(!sameFloat(Float.NaN,0.5f),"NaN never confirms");',
'check(decimal(0.00000001).equals("0.00000001"),"Brigadier command has no exponent");check(wrap(360)==0&&wrap(-181)==179,"wrapped yaw");',
'var expected=positionTag(pos(1,-1));check(matchesPosition(pos(1,359),expected),"yaw wrap matching");check(matchesPosition(pos(1.005,-1),expected),"declared position tolerance");check(!matchesPosition(pos(1.02,-1),expected),"outside tolerance rejected");check(!matchesPosition(pos(Double.NaN,-1),expected),"NaN position cannot confirm");',
'var raw=new CompoundTag();raw.map.put("id","minecraft:max_health");raw.map.put("base",24d);raw.map.put("modifiers",list(new CompoundTag()));var tag=new CompoundTag();tag.map.put("attributes",list(raw));check(attributeBase(tag,"minecraft:max_health")==24,"real raw base read independent of modifiers");check(((ListTag)raw.map.get("modifiers")).size()==1,"modifiers untouched");rejects(()->attributeBase(tag,"minecraft:missing"));tag.map.put("attributes",list(raw,raw));rejects(()->attributeBase(tag,"minecraft:max_health"));',
'System.out.println("PASS production helpers: XP quantization/exact floats, plain-decimal commands, raw NBT position/rotation bounds, actual attribute base/missing/duplicate/modifier preservation");','}}'
].join(String.fromCharCode(10));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'self-player-next-')),file=path.join(tmp,'SelfPlayerNextCodecProbe.java');fs.writeFileSync(file,probe);
const run=spawnSync('java',[file],{encoding:'utf8'});process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'');assert.equal(run.status,0,String(run.error||''));
assert.ok(source.includes('keys(row,Set.of("id","base"))'));
assert.ok(source.includes('!holder.value().isClientSyncable()'));
assert.ok(source.includes('keys(patch,Set.of("x","y","z","yaw","pitch"))'));
assert.ok(source.includes('mc.player.getXpNeededForNextLevel()'));
assert.ok(session.indexOf('!plan.before().test(tag)')<session.indexOf('sendCommand(plan.command())'));
assert.equal(session.split('sendCommand(').length-1,1);assert.ok(session.includes('readback=()->confirm(mc,id,plan)'));
assert.ok(session.includes('if(!documentCurrent())return;'));assert.ok(!source.includes('data modify'));
console.log('PASS candidate wiring: fixed self targets, real registry/syncable filter, restricted request keys, prequery before one command, Document/read-only retry guards retained');
// Optional resolved-Minecraft classpath file: executes the actual WorldBorder implementation,
// with the exact production boundary call extracted above (not a copied boolean formula).
const cpAt=process.argv.indexOf('--border-classpath');
if(cpAt>=0){
 const cp=fs.readFileSync(process.argv[cpAt+1],'utf8').trim();
 const start=source.indexOf('var block=BlockPos.containing(x,y,z);'),end=source.indexOf(';',source.indexOf('if(mc.level.isOutsideBuildHeight(block)',start))+1;
 assert.ok(start>=0&&end>start);const boundary=source.slice(start,end);
 assert.ok(boundary.includes('getWorldBorder().isWithinBounds(x,z)'));assert.ok(boundary.includes('isOutsideBuildHeight(block)'));
 const actual=[
 'import net.minecraft.world.level.border.WorldBorder;import net.minecraft.core.BlockPos;',
 'class ActualBorderProbe {',
 'static class Level {final WorldBorder border;int heights;Level(WorldBorder b){border=b;}boolean isOutsideBuildHeight(BlockPos p){heights++;return p.getY()< -64||p.getY()>=320;}WorldBorder getWorldBorder(){return border;}}',
 'static class Minecraft {final Level level;Minecraft(WorldBorder b){level=new Level(b);}}',
 'static IllegalArgumentException bad(String message){return new IllegalArgumentException(message);}',
 'static void productionCheck(Minecraft mc,double x,double y,double z){',boundary,'}',
 'static void check(boolean v,String message){if(!v)throw new AssertionError(message);}',
 'static void outside(Minecraft mc,double x,double y,double z){try{productionCheck(mc,x,y,z);}catch(IllegalArgumentException e){return;}throw new AssertionError("outside point accepted: "+x+","+y+","+z);}',
 'public static void main(String[] args){var border=new WorldBorder();border.setCenter(0,0);border.setSize(21);var mc=new Minecraft(border);',
 'check(border.isWithinBounds(10.1,0),"positive fractional inside");check(!border.isWithinBounds(10.9,0),"positive fractional outside");check(border.isWithinBounds(-10.1,0),"negative fractional inside");check(!border.isWithinBounds(-10.9,0),"negative fractional outside");',
 'check(border.isWithinBounds(BlockPos.containing(10.9,64,0)),"old floored overload would wrongly accept positive outside");check(!border.isWithinBounds(BlockPos.containing(-10.1,64,0)),"old floored overload would wrongly reject negative inside");',
 'productionCheck(mc,10.1,64,0);productionCheck(mc,-10.1,64,0);productionCheck(mc,0,64,10.1);productionCheck(mc,0,64,-10.1);outside(mc,10.9,64,0);outside(mc,-10.9,64,0);outside(mc,0,64,10.9);outside(mc,0,64,-10.9);outside(mc,0,-64.1,0);check(mc.level.heights==9,"production still checks integer build height");',
 'System.out.println("PASS resolved WorldBorder + extracted production path: positive/negative X/Z fractional inside/outside, old-overload counterexamples, BlockPos height retained");','}}'
 ].join(String.fromCharCode(10));
 const actualFile=path.join(tmp,'ActualBorderProbe.java'),argfile=path.join(tmp,'border-java.args');fs.writeFileSync(actualFile,actual);
 fs.writeFileSync(argfile,'-cp'+String.fromCharCode(10)+'"'+cp.replaceAll(String.fromCharCode(92),'/')+'"');
 const actualRun=spawnSync('java',['@'+argfile,actualFile],{encoding:'utf8'});process.stdout.write(actualRun.stdout||'');process.stderr.write(actualRun.stderr||'');assert.equal(actualRun.status,0,String(actualRun.error||''));
}
