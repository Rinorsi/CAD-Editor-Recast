const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'), base=process.env.EDITOR_BASE_SOURCE_ROOT||root;
const relative='common/src/main/resources/assets/cadeditor/ui/js';
const context=vm.createContext({Reg:{on(){}},Labels:{slotEquip:{},mode:{},dim:{}},setTimeout(){},clearTimeout(){},console,clone:x=>JSON.parse(JSON.stringify(x))});
for(const name of ['data','core','nbt','worldedit','worldview','worldentity','worldplayer']){const candidate=path.join(root,relative,name+'.js');vm.runInContext(fs.readFileSync(fs.existsSync(candidate)?candidate:path.join(base,relative,name+'.js'),'utf8'),context);}
const c=context;let sends=0,controls=[];c.toast=()=>{};c.weDirtyText=()=>false;c.weRender=()=>{};c.drawWorldTop=()=>{};c.drawWorldFoot=()=>{};
c.oriel={send(){sends++;return true;}};c.xNum=o=>{controls.push(o);return o;};c.xSec=()=>({});c.kHint=t=>({text:t});c.xText=o=>o;c.h=()=>({});c.kSeg=()=>({el:{}});c.fmtNum=x=>x;c.fullId=x=>x.includes(':')?x:'minecraft:'+x;
const all=['playerGameType','experience.XpLevel','experience.XpP','commandPosition','attributes.base'];
function reset(editable=all,backend='vanilla_self'){
 c.WE.w={kind:'entity',player:{self:true},slot:{token:'same'},capabilities:{backend,editable,supported:all,reason:'一条命令；受限字段保留草稿'},views:{player:{value:{playerGameType:'survival',Health:20,AbsorptionAmount:0,food:{foodLevel:20,saturation:5},experience:{XpLevel:4,XpP:0.25,XpTotal:43},commandPosition:{x:1,y:64,z:2,yaw:0,pitch:0},attributes:[{id:'minecraft:max_health',base:20},{id:'minecraft:movement_speed',base:0.1}]},schema:{bounds:{},gameModes:['survival','creative'],xpPointsNeeded:15,xpPointsLevel:4,commandMinY:-64,commandMaxY:320,commandDimension:'minecraft:overworld',attributes:[]}}}};
 c.WE.ent={};c.wpReset();c.WE.pending=null;c.WE.lastMsg=null;controls=[];
}
reset();c.evSet('player','experience',{XpLevel:4,XpP:Math.fround(7/15),XpTotal:43});let msg={entity:{player:{}}};c.wpCommandMessage(msg);
assert.equal(JSON.stringify(msg.entity.player),JSON.stringify({experience:{XpP:Math.fround(7/15)}}));assert.equal(c.wpCommandProblems().length,0);assert.match(c.wpCommandNote(),/7 \/ 15 点/);
const body={appendChild(){}};c.wpStatusTab(body);const points=controls.find(x=>x.title==='当前等级点数');assert.equal(points.max,14);assert.match(points.sub,/XpTotal 不变/);points.onChange(8);assert.equal(c.wpCommandPatch().experience.XpP,Math.fround(8/15));
reset([], 'server');c.WE.w.views.player.schema.bounds['experience.XpLevel']={min:0,max:2147483647};c.WE.w.views.player.schema.xpLevelCostOverflowAbove=238609311;c.wpStatusTab(body);
assert.equal(controls.find(x=>x.title==='等级').max,2147483647);assert.match(controls.find(x=>x.title==='等级').sub,/整数溢出/);
const fraction=controls.find(x=>x.title==='当前等级进度');assert.equal(fraction.preservePrecision,true);fraction.onChange(0.123456789);assert.equal(c.wpSection('experience').XpP,0.123456789);
reset();c.evSet('player','experience',{XpLevel:4,XpP:Math.fround(8/15),XpTotal:43});
c.evSet('player','experience',{XpLevel:5,XpP:Math.fround(8/15),XpTotal:43});assert.match(c.wpCommandNote(),/分开提交/);c.weApply();assert.equal(sends,0);
reset();c.evSet('player','experience',{XpLevel:4,XpP:0.25,XpTotal:44});assert.match(c.wpCommandNote(),/XpTotal 仅保留草稿/);
reset();c.WE.w.views.player.schema.xpPointsLevel=3;c.evSet('player','experience',{XpLevel:4,XpP:0.5,XpTotal:43});assert.match(c.wpCommandNote(),/点数范围/);
reset();c.wpCommandPosition(body);controls.find(x=>x.title==='X').onChange(8.25);assert.equal(JSON.stringify(c.wpCommandPatch()),JSON.stringify({commandPosition:{x:8.25}}));assert.equal(c.wpCommandProblems().length,0);
reset();c.evSet('player','attributes',[{id:'minecraft:max_health',base:24},{id:'minecraft:movement_speed',base:0.1}]);assert.equal(JSON.stringify(c.wpCommandPatch()),JSON.stringify({attributes:[{id:'minecraft:max_health',base:24}]}));assert.equal(c.wpCommandProblems().length,0);
c.evSet('player','attributes',[{id:'minecraft:max_health',base:24,modifiers:[]}]);assert.match(c.wpCommandNote(),/修饰符/);c.weApply();assert.equal(sends,0);
reset();c.evSet('player','attributes',[{id:'minecraft:max_health',base:24},{id:'minecraft:movement_speed',base:0.2}]);assert.match(c.wpCommandNote(),/分开提交/);
reset([]);c.evSet('player','commandPosition',{x:2,y:64,z:2,yaw:0,pitch:0});assert.match(c.wpCommandNote(),/仅保留草稿/);
reset([], 'server');c.evSet('player','Health',3);assert.equal(c.wpCommandProblems().length,0);msg={entity:{player:{Health:3}}};c.wpCommandMessage(msg);assert.equal(msg.entity.player.Health,3);
// Sparse payload reconciliation: server XP total changes do not become accidental new drafts.
reset();c.WE.pending='sent';c.WE.tab='pstat';c.WE.lastMsg={msg:{entity:{player:{experience:{XpLevel:5}}}}};c.WE.ent={player:{experience:{XpLevel:5,XpP:0.25,XpTotal:43},Health:3}};
c.weOpen=w=>{c.WE.w=w;c.WE.ent={};c.wpReset();};const updated=JSON.parse(JSON.stringify(c.WE.w));updated.views.player.value.experience={XpLevel:5,XpP:0.25,XpTotal:45};c.weSaved(updated);
assert.equal(c.WE.ent.player.Health,3);assert.equal(c.WE.ent.player.experience,undefined);assert.equal(c.wpCommandPatch().experience,undefined);
console.log('PASS candidate UI: integer XP points, sparse XP/position/base payloads, no total/modifiers leakage, no-OP/mixed restrictions, full backend bypass, fresh-snapshot draft reconciliation');
