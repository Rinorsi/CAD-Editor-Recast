import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// NativePageInput offsets are vanilla GUI pixels. OrielAutomation.rect already
// calls driver.toGui: never convert its rectangle twice. moveOnly:true routes
// mouseMoved/afterMouseMove without a press/release; drag endpoints may leave
// the source rect. Eval sets up/inspects the page; all tested input uses Screen.
export async function runScaleDebug({out,config,request,delay}) {
 const results=[];
 const js=async code=>{
  const r=(await request('host','eval',{js:'(function(){try{return {ok:true,value:eval('+JSON.stringify(code)+')};}catch(e){return {ok:false,error:String(e),stack:String(e.stack||"")};}})()'})).value;
  assert(r.ok,r.error+' '+r.stack);return r.value;
 };
 const pointer=(selector,params={})=>request('host','pagePointer',{selector,...params});
 const state=()=>js('({scale:UI.uiScale,maxed:!!UI.maxed,mode:UI.windowMode,winW:UI.winW,winH:UI.winH,heroW:UI.heroW,viewport:{width:window.innerWidth,height:window.innerHeight},dirty:diffDoc(Store.doc()).length,pending:EditorBridge.pending!==null})');
 const rect=selector=>js('(function(){var r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};})()');
 async function until(fn,label){let last;for(let n=0;n<100;n++){try{if(await fn())return;}catch(e){last=e;}await delay(150);}throw Error('等待超时：'+label+(last?'；'+last.message:''));}
 async function test(name,fn){
  try{results.push({name,status:'PASS',evidence:await fn()});}
  catch(e){results.push({name,status:'FAIL',error:e.stack});throw e;}
  finally{writeFileSync(join(out,'scale-scenarios.json'),JSON.stringify(results,null,2));}
 }
 async function choose(group,label){
  await js('(function(){var old=document.getElementById("scale-native-choice");if(old)old.removeAttribute("id");var xs=document.querySelector('+JSON.stringify(group)+').querySelectorAll(".k-segi");for(var i=0;i<xs.length;i++)if(xs[i].textContent==='+JSON.stringify(label)+'){xs[i].id="scale-native-choice";if(xs[i].scrollIntoView)xs[i].scrollIntoView({block:"nearest"});return true;}throw Error("找不到设置选项");})()');
  const receipt=await pointer('#scale-native-choice');assert(receipt.pressed,'Screen没有处理原生点击');await delay(500);return receipt;
 }
 async function settings(){await js('closeModal();openSettings();true');await delay(500);}
 async function modalBounds(label){
  const geometry=await js('(function(){var out=[];var selectors=[".k-modal",".k-mh",".k-mf",".addbody",".addcats",".addmain",".addtop",".k-sbox",".k-sbox .k-input",".advbody",".advnav",".advmain",".adv",".adv-l",".adv-r",".advbar"];function b(e,s){var r=e.getBoundingClientRect();if(r.width&&r.height)out.push({selector:s,x:r.left,y:r.top,width:r.width,height:r.height});}for(var i=0;i<selectors.length;i++){var e=document.querySelector("#modal "+selectors[i]);if(e)b(e,selectors[i]);}var bars=document.querySelectorAll("#modal .k-mh,#modal .k-mf");for(var j=0;j<bars.length;j++){var p=bars[j].getBoundingClientRect();for(var k=0;k<bars[j].children.length;k++){var c=bars[j].children[k],r=c.getBoundingClientRect();if(r.width&&r.height)out.push({selector:"bar-child",x:r.left,y:r.top,width:r.width,height:r.height,parent:{x:p.left,y:p.top,width:p.width,height:p.height}});}}return {viewport:{width:window.innerWidth,height:window.innerHeight},boxes:out};})()');
  for(const b of geometry.boxes){
   assert(b.x>=-.6&&b.x+b.width<=geometry.viewport.width+.6,label+' 横向越屏：'+b.selector);
   assert(b.y>=-.6&&b.y+b.height<=geometry.viewport.height+.6,label+' 纵向越屏：'+b.selector);
   if(b.selector==='.k-sbox .k-input')assert(b.width>=40,label+' 搜索输入框过窄');
   if(b.parent)assert(b.x>=b.parent.x-.6&&b.x+b.width<=b.parent.x+b.parent.width+.6&&b.y>=b.parent.y-.6&&b.y+b.height<=b.parent.y+b.parent.height+.6,label+' 标题/底栏内容越过父栏');
  }
  return geometry;
 }
 async function reopen(){
  await request('host','close');await delay(400);await request('host','open');
  await until(()=>js('typeof Store!=="undefined"&&!!Store.doc()&&!!document.getElementById("win")'),'重新打开物品页');await delay(900);
 }
 const initial=await request('host','state');
 await request('host','operator',{name:'LanHost',grant:true});
 await request('host','serverCommand',{command:'gamemode creative LanHost'});
 await request('host','serverCommand',{command:'item replace entity LanHost hotbar.0 with minecraft:paper 1'});
 await request('host','select',{slot:0});await reopen();

 await test('native-scale-auto-1-2-3-4-and-search',async()=>{
  const cases=[];
  await js('window.__scaleDoc=Store.doc();window.__scaleHistory=Store.doc().hist;true');
  await request('host','resizeWindow',{width:1280,height:800});await delay(1200);
  for(const value of [1,2,3,4,0]){
   await settings();const click=await choose('#editor-scale',value===0?'自动':String(value));
   const s=await state();assert.equal(s.scale,value);
   assert(await js('window.__scaleDoc===Store.doc()&&window.__scaleHistory===Store.doc().hist'),'缩放替换了草稿或历史');
   await js('closeModal();openEffectPicker({present:{},onConfirm:function(){throw Error("验收不得写入物品");}});true');await delay(650);
   const boxes=await js('(function(){function b(e){var r=e.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};}var q=document.querySelector(".k-sbox"),i=q.querySelector("input"),a=q.querySelector(".k-sbtn");i.id="scale-search-input";a.id="scale-search-button";window.__scaleSearchHits=0;a.addEventListener("click",function(){window.__scaleSearchHits++;});return {box:b(q),input:b(i),button:b(a),icon:b(a.firstChild),label:b(a.lastChild),hint:i.getAttribute("placeholder"),title:i.getAttribute("data-tip")||i.getAttribute("title")};})()');
   assert(boxes.input.width>40,'搜索输入框被挤掉');
   assert(boxes.input.x+boxes.input.width<=boxes.button.x+1,'搜索框与按钮重叠');
   assert(boxes.button.x+boxes.button.width<=boxes.box.x+boxes.box.width+1,'搜索按钮被裁切');
   assert(boxes.button.x>=0&&boxes.button.x+boxes.button.width<=s.viewport.width+0.5,'搜索按钮超出屏幕右缘');
   assert(boxes.input.x>=0&&boxes.input.x+boxes.input.width<=s.viewport.width+0.5,'搜索输入框超出屏幕右缘');
   for(const child of [boxes.icon,boxes.label]){
    assert(child.x>=boxes.button.x-1&&child.x+child.width<=boxes.button.x+boxes.button.width+1,'按钮内容水平裁切');
    assert(child.y>=boxes.button.y-1&&child.y+child.height<=boxes.button.y+boxes.button.height+1,'按钮内容垂直裁切');
   }
   assert(!boxes.hint.includes('；'),'长语法仍挤在占位文字中');
   const effectBounds=await modalBounds('效果选择窗');
   const focus=await pointer('#scale-search-input');assert(focus.pressed);
   assert(await js('document.activeElement===document.getElementById("scale-search-input")'),'实际点击未聚焦搜索输入框');
   await request('host','pageType',{text:'minecraft:speed'});
   const searchClick=await pointer('#scale-search-button');assert(searchClick.pressed);
   assert.equal(await js('window.__scaleSearchHits'),1,'原生坐标未命中搜索按钮');
   assert.equal(await js('document.getElementById("scale-search-input").value'),'minecraft:speed');
   const guiPerPage=searchClick.elementRect.width/boxes.button.width;
   assert(guiPerPage>0&&Number.isFinite(guiPerPage),'没有可核对的屏幕坐标');
   assert(Math.abs(guiPerPage-(value===0?1:value/2))<0.03,'正式宿主没有应用原生倍率，或全局GUI比例被改变');
   assert(Math.abs(searchClick.fromX-(boxes.button.x+boxes.button.width/2)*guiPerPage)<2,'页面坐标和Screen坐标不一致');
   await request('host','screenshot',{name:'scale-'+value+'-search.png'});
   const category=await js('(function(){var cs=document.querySelectorAll("#modal .addcat");if(cs.length<2)throw Error("缺少效果分类");cs[1].id="scale-category";return {count:cs.length,label:cs[1].querySelector("span").textContent};})()');
   const categoryClick=await pointer('#scale-category');assert(categoryClick.pressed);
   assert.equal(await js('document.querySelector("#modal .addcat.on span").textContent'),category.label,'原生点击未切换分类');
   assert.equal(await js('document.querySelectorAll("#modal .addcat").length'),category.count,'窄视口丢失了分类');
   // Manual IDs remain usable at every scale, without selecting/committing an item.
   await pointer('#scale-search-input');await request('host','pageKey',{key:'a',ctrl:true});
   await request('host','pageType',{text:'scale_probe:custom_effect'});await pointer('#scale-search-button');await delay(150);
   assert(await js('!!document.querySelector(".addrow.custom")'),'手动输入ID入口不可用');
   await js('closeModal();openAddSetting();true');await delay(500);
   const addBounds=await modalBounds('添加设置窗');await request('host','screenshot',{name:'scale-'+value+'-add.png'});await delay(200);
   await js('closeModal();openAdvanced("all");true');await delay(500);
   const advancedBounds=await modalBounds('高级双栏窗');await request('host','screenshot',{name:'scale-'+value+'-advanced.png'});await delay(200);
   cases.push({value,state:s,boxes,guiPerPage,click,focus,searchClick,category,categoryClick,effectBounds,addBounds,advancedBounds});
  }
  await js('closeModal();true');return cases;
 });

 await test('native-hover-divider-geometry-stable',async()=>{
  await settings();await choose('#editor-scale','2');
  // Production xRow is shared by settings and the experience section from 图3.
  await js('(function(){var r=document.querySelector(".set-list .k-xrow");r.id="scale-hover-row";window.__scaleHoverMoves=0;r.addEventListener("mousemove",function(){window.__scaleHoverMoves++;});return true;})()');
  const before=await rect('#scale-hover-row'),samples=[];
  const first=await pointer('#scale-hover-row',{moveOnly:true});
  assert.equal(first.pressed,false,'探针必须只移动，不能以点击替代hover');
  assert.equal(first.released,false,'hover不应发出释放事件');
  const guiPerPage=first.elementRect.width/before.width;
  for(let n=0;n<12;n++){
   const hover=await pointer('#scale-hover-row',{moveOnly:true,fromX:6*guiPerPage,fromY:(before.height-1.25)*guiPerPage});
   await delay(100);const box=await rect('#scale-hover-row');
   assert(Math.abs(box.y-before.y)<0.05&&Math.abs(box.height-before.height)<0.05,'悬停导致行几何抖动');
   samples.push({box,hover});
  }
  assert((await js('window.__scaleHoverMoves'))>0,'Screen移动没有命中被测列表行');
  await request('host','screenshot',{name:'scale-hover-divider.png'});await js('closeModal();true');return {before,samples};
 });

 await test('native-window-resize-and-opening-modes-persist',async()=>{
  await request('host','resizeWindow',{width:1280,height:800});await delay(1200);
  await settings();await choose('#editor-scale','1');await choose('#editor-window-mode','窗口化');await reopen();
  assert.equal((await state()).maxed,false);
  const before=await rect('#win'),drag=await pointer('#edresize',{toX:-30,toY:-20});
  assert(drag.pressed&&drag.released&&drag.drag,'窗口大小拖动必须经Screen原生路径');
  await delay(1400);const after=await rect('#win'),saved=await state();
  assert(after.width<before.width-15&&after.height<before.height-10,'原生拖动没有调整窗口大小');
  assert(saved.winW>=320&&saved.winH>=200);
  const modes=[];
  for(const [label,mode,maxed] of [['最大化','maximized',true],['窗口化','windowed',false],['记住上次','remember',false]]){
   await settings();const clicked=await choose('#editor-window-mode',label);await reopen();const s=await state();
   assert.equal(s.mode,mode);assert.equal(s.maxed,maxed);
   assert.equal(s.winW,saved.winW);assert.equal(s.winH,saved.winH);modes.push({s,clicked});
  }
  const maximize=await pointer('#editor-maximize');assert(maximize.pressed);await reopen();
  const expected=await state();assert(expected.maxed&&expected.mode==='remember');
  await request('host','close');await delay(1200);
  const disk=JSON.parse(readFileSync(join(out,'host','config','cadeditor-ui.json'),'utf8'));
  for(const [key,value] of Object.entries({uiScale:1,windowMode:'remember',windowMax:true,winW:expected.winW,winH:expected.winH}))assert.equal(disk[key],value,'配置未落盘：'+key);
  writeFileSync(join(out,'scale-restart-expected.json'),JSON.stringify({sha256:config.sha256,expected,disk},null,2));
  return {before,after,drag,saved,modes,maximize,expected,disk};
 });
 const final=await request('host','state');assert.equal(final.commandAttempts,initial.commandAttempts,'缩放验收不应发送客户端写回命令');
 writeFileSync(join(out,'scale-result.json'),JSON.stringify({status:'PASS',sha256:config.sha256,results,restart:'pending fresh JVM',scope:'正式包、隐藏且未聚焦的自有backend-single；Screen原生鼠标/键盘；未点击应用'},null,2));
}

export async function checkScaleRestart({out,config,request,delay}){
 const receipt=JSON.parse(readFileSync(join(out,'scale-restart-expected.json'),'utf8'));assert.equal(receipt.sha256,config.sha256);
 await request('host','open');let actual;
 for(let n=0;n<100;n++){await delay(150);try{actual=(await request('host','eval',{js:'({scale:UI.uiScale,maxed:!!UI.maxed,mode:UI.windowMode,winW:UI.winW,winH:UI.winH})'})).value;if(actual)break;}catch(e){if(n===99)throw e;}}
 assert(actual,'重启后未打开编辑器');
 for(const key of ['scale','maxed','mode','winW','winH'])assert.equal(actual[key],receipt.expected[key],'新JVM未恢复配置：'+key);
 await delay(1200); // Page state is available before the first painted frame after attach.
 assert.equal((await request('host','eval',{js:'!!document.querySelector("#modal .k-modal")'})).value,false,'新JVM截图仍被测试草稿恢复弹窗遮挡');
 await request('host','screenshot',{name:'scale-fresh-jvm-restored.png'});
 await delay(400); // Keep the editor open while the screenshot is captured/saved.
 writeFileSync(join(out,'scale-restart-result.json'),JSON.stringify({status:'PASS',sha256:config.sha256,expected:receipt.expected,actual},null,2));
 const first=JSON.parse(readFileSync(join(out,'scale-result.json'),'utf8'));first.restart='PASS fresh JVM';
 writeFileSync(join(out,'scale-result.json'),JSON.stringify(first,null,2));
 await request('host','close');
}
