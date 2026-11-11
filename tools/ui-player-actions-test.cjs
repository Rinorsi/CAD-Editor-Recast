const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');
const t=H.create(),c=t.c;c.snd=()=>{};c.Reg.meta={};
function reset(self=true){
 c.WE.w={kind:'entity',type:'minecraft:player',slot:{kind:'entity',uuid:'11111111-2222-3333-4444-555555555555',token:'player'},revision:'world-r1',snbt:'{}',nbt:{},player:{self,name:self?'我':'另一位玩家'}};
 c.WE.text='{}';c.WE.slots={};c.WE.pending=null;c.WE.lastSendAt=0;c.weResetEdits();c.weEntReset();c.wpReset();c.pxReset();t.sent.length=0;
}
const top=()=>t.doc.getElementById('topbar'),apply=()=>top().querySelectorAll('.k-apply').find(e=>e.textContent.includes('应用修改'));
reset();c.WE.tab='ppos';
const st=c.pxState('position');Object.assign(st,{status:'ready',loaded:true,revision:'position-r1',value:{dimension:'minecraft:overworld',x:1.5,y:70,z:2.5,yaw:0,pitch:0}});
Object.assign(c.pxState('respawn'),{status:'ready',loaded:true,value:null});
c.drawWorldTop();assert(apply().classList.contains('dim'));
const body=c.h('div');c.pxPosition(body);
const input=body.querySelectorAll('.k-numin')[0];input.value='11.5';input.fire('change');
assert.equal(st.draft.x,11.5);assert.equal(c.pxDirtyCount(),1);
assert(!apply().classList.contains('dim'),'editing actual X control must enable the top Apply immediately');
apply().fire('click');const sent=t.sent.find(x=>x[0]==='player_extended'&&x[1].action==='apply');assert(sent);assert.equal(sent[1].patch.x,11.5);assert.equal(sent[1].revision,'position-r1');
console.log('PASS actual position input -> enabled top Apply -> revision-bound teleport request');
// 其他玩家背包：无草稿时可复制；只存 inventory，再读取自己并走预览/备份确认。
reset(false);c.WE.tab='pinv';c.drawWorldTop();
let uploaded,calls=[];
c.Vault.upload=(text,cb)=>{uploaded=JSON.parse(text);cb({ok:true,token:'uploaded'});};
c.Vault.call=(op,f,cb)=>{calls.push([op,f]);cb({ok:true,entry:{id:'backpack-entry'}});};
let copy=top().querySelectorAll('.k-apply').find(e=>e.textContent==='套用此玩家的背包');
assert(copy&&!copy.classList.contains('dim'),'clean other-player inventory has enabled copy action');
assert.equal(apply(),undefined,'clean page needs no inactive write-to-other button');
copy.fire('click');assert.deepEqual(uploaded.sections,['inventory']);assert.equal(uploaded.world.slot.uuid,c.WE.w.slot.uuid);
assert.equal(calls[0][0],'save');assert.equal(calls[0][1].kind,'player_preset');
assert.equal(t.sent[0][0],'open_world');assert.equal(t.sent[0][1].apply_preset,'backpack-entry');assert(!t.sent.some(x=>x[0]==='apply'));
reset(false);c.WE.tab='pinv';c.WE.ent={player:{Health:15}};c.drawWorldTop();
assert(apply(),'editing the other player still offers original Apply');
calls=[];c.vwPlayerBackpackToSelf();assert.equal(calls.length,0);assert.equal(t.sent.length,0,'copy must not discard source-page edits');
reset(true);c.WE.tab='pinv';c.drawWorldTop();assert(!top().textContent.includes('套用此玩家的背包'));
reset(false);c.WE.tab='pstat';c.drawWorldTop();assert(!top().textContent.includes('套用此玩家的背包'));
console.log('PASS other-player backpack top action: inventory-only snapshot, authoritative self navigation, edits protected and original Apply retained');
