const fs=require('node:fs'),vm=require('node:vm'),H=require('../lib/ui-harness.cjs');
const seed=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=[];
function controls(){
 WE.w={kind:'entity',type:'minecraft:slime',slot:{kind:'entity',dim:'minecraft:overworld',uuid:'00000000-0000-0000-0000-000000000001'},snbt:caseName==='add'?seed.empty:seed.withEffect};
 WE.text=WE.w.snbt;WE.obj=null;WE.slots={};weResetEdits();weEntReset();
 drawWorldTop=function(){};drawWorldFoot=function(){};weHeroLive=function(){};
 var effects=esEffects({}, {get:weObj,set:function(v){WE.obj=v;wePut();}});
 if(caseName==='add'){
  openEffectPicker=function(o){o.onConfirm(['minecraft:speed'],{'minecraft:speed':{level:1,seconds:30}});};
  effects.querySelector('.k-add').click();
 }else{
  effects.querySelector('.k-xhead').click();
  var inputs=effects.querySelectorAll('input.k-numin'),toggles=effects.querySelectorAll('.k-toggle');
  if(caseName==='amplifier'||caseName==='duration'){var input=inputs[caseName==='amplifier'?0:1];input.value=caseName==='amplifier'?'3':'27';input.fire('input');input.fire('change');}
  else if(caseName==='remove'){effects.querySelectorAll('div,button').filter(function(e){return e.textContent==='删除这个效果';}).slice(-1)[0].click();}
  else {var i={'infinite':0,'particles-default':1,'icon-default':2,'ambient-default':3}[caseName];toggles[i].click();toggles=effects.querySelectorAll('.k-toggle');if(caseName!=='infinite')toggles[i].click();}
 }
 weApply();
 return {name:caseName,before:WE.w.snbt,requested:WE.text};
}
for(const name of ['add','amplifier','duration','infinite','particles-default','icon-default','ambient-default','remove']){
 const h=H.create();h.c.seed=seed;h.c.caseName=name;
 const row=vm.runInContext('('+controls.toString()+')()',h.c);row.productionSent=h.sent;
 if(row.requested===row.before)throw Error(name+' did not edit through actual controls');
 out.push(row);
}
fs.writeFileSync(process.argv[3],JSON.stringify(out,null,2));console.log('PASS actual esEffects/kEffectList controls -> wePut/weApply '+out.length+' cases');
