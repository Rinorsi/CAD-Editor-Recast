let messages=[],timers=[],segments=[],grids=[];
c.oriel={send(op,msg){messages.push({op,msg:JSON.parse(JSON.stringify(msg))});return true;}};
c.setTimeout=(fn,ms)=>{if(ms===12000)timers.push(fn);return timers.length;};c.toastDismiss=()=>{};
c.kSeg=(opts,value,onChange)=>{segments.push({opts,value,onChange});return {el:{}};};
c.Reg.nameOf2=()=>null;c.attrName=id=>id;c.attrIconEl=()=>({});c.weDndHint=()=>({});
c.kSlotGrid=o=>{grids.push(o);return {};};
function fresh(){reset();messages=[];timers=[];segments=[];grids=[];c.WE.lastSendAt=0;c.WE.commandVersion=0;c.WE.tab='pstat';}
function control(tab,title){controls=[];segments=[];if(tab==='position')c.wpCommandPosition(body);else if(tab==='attr')c.wpAttrTab(body);else c.wpStatusTab(body);const found=controls.find(x=>x.title===title);assert.ok(found,'real control '+title);return found.onChange;}
function apply(){c.WE.lastSendAt=0;c.weApply();assert.equal(messages.length,1,'exactly one accepted command request');assert.ok(c.WE.pending);return messages[0].msg;}
function saved(change){const w=JSON.parse(JSON.stringify(c.WE.w));change(w.views.player.value);const id=c.WE.pending;c.weSaved(w);c.weResult({requestId:id,status:'saved'});assert.equal(messages.length,1,'receipt must never auto-submit new intent');}
function attrs(){c.WE.w.views.player.schema.attributes=[{id:'minecraft:max_health',base:20,min:1,max:1024},{id:'minecraft:movement_speed',base:0.1,min:0,max:1024}];}
// Reviewer repro: actual X onChange and accepted weApply.
fresh();let x=control('position','X');x(8);assert.equal(apply().entity.player.commandPosition.x,8);x(1);
assert.equal(c.WE.ent.player,undefined,'old-baseline delta still disappears');assert.equal(c.evDirty(),true,'in-flight intent remains visibly dirty');
saved(v=>v.commandPosition.x=8);assert.equal(c.wpG('commandPosition').x,1);assert.equal(c.wpCommandPatch().commandPosition.x,1);
// Same-as-submitted still records a newer version; once confirmed equal it may become clean.
fresh();x=control('position','X');x(8);apply();x(8);const sameVersion=c.WE.commandFlight.version;saved(v=>v.commandPosition.x=8);
assert.ok(sameVersion>0);assert.equal(c.wpCommandPatch().commandPosition,undefined,'same desired value is already confirmed and may be clean');
x=control('position','X');x(8);assert.equal(c.wpCommandPatch().commandPosition,undefined,'idle edit back to fresh baseline clears explicit draft');
// Input between the world patch and terminal result is also newer than the submitted version.
fresh();x=control('position','X');x(8);apply();x(1);
const splitWorld=JSON.parse(JSON.stringify(c.WE.w));splitWorld.views.player.value.commandPosition.x=8;c.weSaved(splitWorld);
x=control('position','X');x(8);assert.equal(c.wpCommandPatch().commandPosition.x,8);c.weResult({requestId:c.WE.pending,status:'saved'});
assert.equal(c.wpCommandPatch().commandPosition,undefined);assert.equal(messages.length,1);
// Several later edits: final version wins, no intermediate replay.
fresh();x=control('position','X');x(8);apply();x(5);const firstVersion=c.WE.commandFlight.version;x(1);assert.ok(c.WE.commandFlight.version>firstVersion);
saved(v=>v.commandPosition.x=8);assert.equal(c.wpCommandPatch().commandPosition.x,1);
// Axis-granular intent must not restore an unedited old Y.
fresh();x=control('position','X');x(8);control('position','Y')(70);apply();x(1);saved(v=>{v.commandPosition.x=8;v.commandPosition.y=70;});
assert.equal(JSON.stringify(c.wpCommandPatch().commandPosition),JSON.stringify({x:1}));assert.equal(c.wpG('commandPosition').y,70);
// XP levels and points record only explicitly edited subfields.
fresh();let level=control('status','等级');level(5);apply();level(4);saved(v=>{v.experience.XpLevel=5;v.experience.XpTotal=99;});
assert.equal(JSON.stringify(c.wpCommandPatch().experience),JSON.stringify({XpLevel:4}));assert.equal(c.wpG('experience').XpTotal,99);
fresh();c.WE.w.views.player.value.experience.XpP=Math.fround(4/15);let points=control('status','当前等级点数');points(8);apply();points(4);
saved(v=>{v.experience.XpP=Math.fround(8/15);v.experience.XpTotal=77;});assert.equal(c.wpCommandPatch().experience.XpP,Math.fround(4/15));assert.equal(c.wpCommandPatch().experience.XpTotal,undefined);
fresh();c.WE.w.views.player.value.experience.XpP=Math.fround(4/15);points=control('status','当前等级点数');points(8);apply();points(8);
saved(v=>v.experience.XpP=Math.fround(8/15));assert.equal(c.wpCommandPatch().experience,undefined,'same points intent can clean after matching confirmation');
// Base reversals don't restore unedited rows or modifiers.
fresh();attrs();let baseChange=control('attr','minecraft:max_health');baseChange(24);apply();baseChange(20);
saved(v=>{v.attributes[0].base=24;v.attributes[1].base=0.2;});assert.equal(JSON.stringify(c.wpCommandPatch().attributes),JSON.stringify([{id:'minecraft:max_health',base:20}]));
assert.equal(c.wpG('attributes')[1].base,0.2);
fresh();attrs();baseChange=control('attr','minecraft:max_health');baseChange(24);apply();baseChange(24);saved(v=>v.attributes[0].base=24);
assert.equal(c.wpCommandPatch().attributes,undefined,'same base intent can clean after matching confirmation');
// Mode, restricted Health and another base coexist while waiting.
fresh();attrs();control('status','等级');let mode=segments.find(s=>s.opts.some(o=>o.v==='creative')).onChange;mode('creative');apply();mode('survival');
let health=control('status','生命');health(5);health(20);control('attr','minecraft:movement_speed')(0.2);
saved(v=>{v.playerGameType='creative';v.Health=19;v.experience.XpTotal=81;});assert.equal(c.wpG('playerGameType'),'survival');assert.equal(c.wpG('Health'),20);
assert.equal(c.wpCommandPatch().attributes[0].base,0.2);assert.equal(c.wpCommandPatch().experience,undefined);assert.match(c.wpCommandNote(),/Health 仅保留草稿/);
// Actual inventory grid setter: empty intent survives a fresh naturally filled slot.
fresh();c.WE.w.views.player.value.container={size:36,slots:[]};c.WE.w.views.player.schema.inventorySize=36;
x=control('position','X');x(8);apply();c.wpInventoryTab(body);const setSlot=grids.find(g=>g.indices.includes(0)).set;
setSlot(0,{id:'minecraft:stone',count:1});setSlot(0,{empty:true});assert.equal(c.WE.pslots.container[0],undefined);
saved(v=>{v.commandPosition.x=8;v.container.slots=[{slot:0,stack:{id:'minecraft:dirt',count:1}}];});assert.equal(c.wpContainerStack('container',0).empty,true);assert.match(c.wpCommandNote(),/库存后端/);
// Rejection and timeout retain reverse intent without sending again.
fresh();x=control('position','X');x(8);apply();x(1);c.weResult({requestId:c.WE.pending,status:'rejected',code:'command_unconfirmed',reason:'unknown'});
assert.equal(c.wpCommandPatch().commandPosition.x,1);assert.equal(messages.length,1);assert.equal(c.WE.pending,null);
fresh();x=control('position','X');x(8);apply();x(1);assert.equal(timers.length,1);timers[0]();assert.equal(c.wpCommandPatch().commandPosition.x,1);assert.equal(messages.length,1);
// Page reset drops journals; host Document tests cover rejecting late network responses.
const changed=JSON.parse(JSON.stringify(c.WE.w));changed.slot.token='new-page';c.weOpen(changed);assert.equal(c.WE.commandFlight,null);assert.equal(c.WE.commandExplicit,null);
reset([], 'server');c.WE.pending='server-request';c.evSet('player','Health',20);assert.equal(c.WE.commandFlight,null);assert.equal(c.WE.ent.player,undefined);
console.log('PASS in-flight real controls: reverse/same-value/multiple edits; axis/XP/base/mode; Health/slots; no natural total/modifier leakage; rejection/timeout; no resend; page reset/full-backend isolation');
