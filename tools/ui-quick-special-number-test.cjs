const assert=require('node:assert/strict'),H=require('./lib/ui-harness.cjs');const t=H.create(),c=t.c;c.snd=()=>{};c.toast=()=>{};c.Reg.meta={};c.window.EDITOR_PREVIEW=true;
c.applyLiveRanges([{id:'minecraft:attribute_modifiers',ranges_for_ui:[{path:'$[].amount',number_type:'double',allow_nan:true,allow_positive_infinity:true,allow_negative_infinity:true}]}]);
c.Store.open({id:'minecraft:diamond_sword',count:1,comps:{attribute_modifiers:[{type:'minecraft:attack_damage',id:'minecraft:base_attack_damage',amount:29,operation:'add_value',slot:'mainhand'}]},removed:{}},true);
let card=c.CARDS.attackDamage();const input=card.el.querySelector('.k-numin');const num=()=>c.nbtNumberValue(c.Ctx.get('attribute_modifiers')[0].amount);
for(const [text,expect,tag] of [['NaN',NaN,'NaNd'],['+Infinity',Infinity,'Infinityd'],['-Infinity',-Infinity,'-Infinityd']]){
 input.value=text;input.fire('input');input.fire('change');card.update();assert(Object.is(num(),expect),text);assert(c.nbtComponentText(c.Store.doc(),'attribute_modifiers').includes(tag));assert(!card.el.textContent.includes('不换算'));assert(!card.el.textContent.includes('15 颗心'));assert.equal(input.value,Number.isNaN(expect)?'NaN':expect>0?'∞':'−∞');
 const slider=card.el.querySelector('.k-slider');assert(!JSON.stringify(slider.children.map(x=>x.style)).match(/NaN|Infinity/));
 const before=c.snapOf(c.Store.doc());card.el.querySelectorAll('.k-step')[1].fire('click');assert.equal(c.snapOf(c.Store.doc()),before,'nudge cannot corrupt special');
 const restored=c.nbtReadSnapshot(before);assert(Object.is(c.nbtNumberValue(restored.comps.attribute_modifiers[0].amount),expect));
 c.Store.undo();c.Store.redo();assert.equal(c.snapOf(c.Store.doc()),before);
}
input.value='garbage';input.fire('change');assert.equal(num(),-Infinity);assert.equal(input.value,'garbage');assert.match(card.el.textContent,/请输入数字/);
input.value='8';input.fire('change');card.update();assert.equal(c.attrSum('attack_damage',['mainhand'])+1,8);assert(!card.el.textContent.includes('不换算'));
let writes=[];const bounded=c.kNumber(2,{min:0,max:10,step:1,onChange:v=>writes.push(v)});const bi=bounded.el.querySelector('input');for(const bad of ['NaN','Infinity','-Infinity']){bi.value=bad;bi.fire('change');assert.equal(bi.value,bad);}assert.equal(writes.length,0);
bi.value='3';bi.fire('change');assert.equal(writes[0],3);
console.log('PASS actual attackDamage special input, blur, typed double callback, exact snapshot/undo/redo, honest summary/hearts, finite recovery, invalid text and bounded integer rejection, no invalid slider CSS');
