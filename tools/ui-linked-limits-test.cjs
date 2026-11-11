const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');
const t=H.create(),c=t.c;
c.snd=()=>{};c.toast=()=>{};c.weMarkDirty=()=>{};c.Reg.nameOf2=()=>null;c.attrName=id=>id;
function state(command=false){
 const defs=[{id:'minecraft:max_health',base:20,min:1,max:1024,transientModifiers:[]},{id:'minecraft:max_absorption',base:0,min:0,max:2048,transientModifiers:[]}];
 c.WE.w={kind:'entity',player:{self:true},views:{player:{value:{Health:20,AbsorptionAmount:0,food:{foodLevel:5,saturation:2},experience:{XpLevel:0,XpP:0,XpTotal:0},playerGameType:'survival',attributes:defs.map(d=>({id:d.id,base:d.base,modifiers:[]})),active_effects:[]},schema:{linkedAttributeLimits:true,attributes:defs,bounds:{Health:{min:0,max:20},AbsorptionAmount:{min:0,max:0},'food.foodLevel':{min:0,max:20},'food.saturation':{min:0,max:20}}}}}};
 if(command)c.WE.w.capabilities={backend:'vanilla_self',editable:[],supported:[],reason:'no server'};
 c.WE.ent={};c.wpReset();return c.WE.w;
}
function input(row,value){const i=row.querySelector('.k-numin');assert(i);i.value=String(value);i.fire('change');return i;}
function form(){const b=t.doc.createElement('div');c.wpStatusTab(b);return b;}
function row(body,title){const r=body.querySelectorAll('.k-xrow').find(r=>r.querySelector('.z')?.textContent===title);assert(r,title);return r;}
let w=state(),b=form(),health=row(b,'生命');input(health,200);
assert.equal(c.wpG('Health'),200);assert.equal(c.wpG('attributes')[0].base,200);assert.equal(w.views.player.value.Health,20);assert.match(health.textContent,/20 → 200/);assert.match(health.textContent,/游戏上限：1,024|游戏上限：1024/);input(health,200);assert.match(health.textContent,/20 → 200/,'repeated commit keeps numeric pending limit');
const before=c.weNorm(c.WE.ent);input(health,1025);assert.equal(c.weNorm(c.WE.ent),before);assert(health.querySelector('.k-numin').classList.contains('bad'));
input(row(b,'伤害吸收'),16);assert.equal(c.wpG('AbsorptionAmount'),16);assert.equal(c.wpG('attributes')[1].base,16);
input(row(b,'饱和度'),10.5);assert.equal(c.wpG('food').foodLevel,11);assert.equal(row(b,'饥饿值').num.get(),11);
input(row(b,'饥饿值'),3);assert.equal(c.wpG('food').saturation,3);assert.equal(row(b,'饱和度').num.get(),3);
let msg={};c.evMsg(msg);assert.equal(msg.entity.player.Health,200);assert.equal(msg.entity.player.attributes[0].base,200);
w=state();w.views.player.value.attributes[0].modifiers=[{id:'test:add',amount:5,operation:'add_value'}];w.views.player.schema.attributes[0].transientModifiers=[{id:'test:gear',amount:0.5,operation:'add_multiplied_total'}];
b=form();input(row(b,'生命'),90);assert.equal(c.wpG('attributes')[0].base,55);assert.equal(c.wpG('attributes')[0].modifiers[0].id,'test:add');
const attrs=t.doc.createElement('div');c.wpAttrTab(attrs);input(row(attrs,'minecraft:max_health'),15);assert.equal(c.wpG('Health'),30,'reverse uses effective cap with modifiers');
w=state();w.views.player.value.attributes[0].modifiers=[{id:'test:zero',amount:-1,operation:'add_multiplied_total'}];b=form();input(row(b,'生命'),200);assert.equal(Object.keys(c.WE.ent).length,0);assert.match(row(b,'生命').textContent,/无法达到/);
w=state(true);b=form();input(row(b,'生命'),200);assert.equal(Object.keys(c.WE.ent).length,0,'client-only does not gain unsupported writes');
w=state();c.evSet('player','active_effects',[{id:'minecraft:health_boost'}]);b=form();input(row(b,'生命'),200);assert.equal(c.wpG('Health'),20,'no calculation using stale effect state');
const blockedAttrs=t.doc.createElement('div');c.wpAttrTab(blockedAttrs);input(row(blockedAttrs,'minecraft:max_health'),10);assert.equal(c.wpG('attributes')[0].base,20,'reverse cannot use stale effect state');
w=state();delete w.views.player.schema.linkedAttributeLimits;b=form();assert.match(row(b,'生命').textContent,/重启/);input(row(b,'生命'),200);assert.equal(c.wpG('Health'),20);
const def={id:'minecraft:max_health',base:20,min:1,max:1024},data={Health:20,attributes:[{id:def.id,base:20,modifiers:[{id:'test:add',operation:'add_value',amount:5}]}],unknown:{keep:true}};
const er=c.esFlagRow({id:'health',key:'Health',type:'float',min:0,max:20,default:20},{get:()=>data},fn=>fn(data),{attributes:[def]});input(er,200);assert.equal(data.Health,200);assert.equal(data.attributes[0].base,195);assert.equal(data.attributes[0].modifiers.length,1);assert(data.unknown.keep);
c.esAttrSet(data,def,10);assert.equal(data.Health,15,'entity reverse retains add modifier');
c.window.EDITOR_PREVIEW=true;c.Store.open({id:'minecraft:diamond_sword',count:1,comps:{max_damage:10,damage:2,custom_data:c.parseSnbt('{n:9007199254740993L,a:[L;1L,2L]}')}},true);
const original=c.snapOf(c.Store.doc()),hi=c.Store.doc().hi,card=c.CARDS.damage();input(card.body,100);card.live.forEach(f=>f());
assert.equal(c.Ctx.get('max_damage'),100);assert.equal(c.Ctx.get('damage'),0);assert.equal(c.Store.doc().hi,hi+1,'one undo for two components');assert.match(card.body.textContent,/同步提高最大耐久/);
c.Store.undo();assert.equal(c.snapOf(c.Store.doc()),original,'undo preserves unsafe long and array');card.live.forEach(f=>f());assert(!card.body.textContent.includes('应用时将同步提高最大耐久'));c.Store.redo();assert.equal(c.Ctx.get('max_damage'),100);
assert.equal(t.sent.filter(x=>['apply','edit','undo'].includes(x[0])).length,0,'all linked edits remain local drafts');
console.log('PASS linked limits: real controls, combined draft, modifiers, native limits, zero multiplier, no authority bypass, reverse links, saturation, entity typed data, durability one-step undo/redo, no automatic Apply');
