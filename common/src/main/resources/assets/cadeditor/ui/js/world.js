/* 放置与数据：显式规则、扁平列表、原始数据先校验再写入草稿。 */
var WORLD_DETAIL = ['can_place_on','can_break','block_state','block_entity_data','entity_data','bucket_entity_data','custom_data','lock','container_loot','bees','pot_decorations','profile','charged_projectiles','recipes','map_decorations','lodestone_tracker','debug_stick_state'];
HEAD_AUTO.map_color=1;
AUTO_BODY.map_color=function(card,cid,v){
  var color=typeof v==='number'?v:0xffffff, chip=h('span',{class:'world-color-chip',style:'background:'+hex6(color)});
  var choose=kBtn(hex6(color),function(){
    kColorPop(choose,color,function(x){color=x;autoPut(cid,x);chip.setAttribute('style','background:'+hex6(x));choose.querySelector('span').textContent=hex6(x);},{cls:'world-color-pop',width:240,maxHeight:160});
  });headCtl(card,h('div',{class:'world-inline'},[chip,choose]));
};
var WORLD_SEC_ICON = I18n.keyed({ "cadeditor.ui.world.c9bf850b37": 'code', "cadeditor.ui.world.af70df7b9c": 'user', "cadeditor.data.aa224f5c04": 'book', "cadeditor.ui.structure.fee60ae594": 'list' });
function worldSection(title, action) { return xSec(WORLD_SEC_ICON[title] || 'list', title, '', action); }
/* 折叠区：一行文字开关 + 一句说明，不用按钮外观 */
function worldFold(title, content, opened, hint) {
  var box = h('div',{class:'world-fold'}), body = h('div',{class:'world-fold-body'}), on = !!opened;
  var chev = h('span',{class:'wf-chev'}), head = h('div',{class:'world-more',role:'button'},[chev,h('span',{class:'wf-t',text:title}),hint?h('span',{class:'wf-hint',text:hint}):null]);
  activate(head,function () { on = !on; paint(true); });
  function paint(animate) {
    head.setAttribute('aria-expanded',String(on)); chev.textContent = on ? '⌄' : '›';
    if (!animate) { body.style.display = on ? '' : 'none'; return; }
    if (on) { body.style.display = ''; uiSlide(body, true); } else uiSlide(body, false, function () { body.style.display = 'none'; });
  }
  body.appendChild(content); box.appendChild(head); box.appendChild(body); paint(false); return box;
}
function worldError() { return h('div',{class:'world-error',role:'status'}); }
/* SNBT 文本框（写入前先解析 / 校验，错了不写，有「撤回输入」和「写入草稿」）。要让用户直接改一段 NBT / SNBT 时用它，不要再手搭 textarea。
   value 当前值，set(新值) 写入，validate?(新值) 不合格就 throw */
function kSnbtEditor(value, set, validate) {
  var box = h('div', { class: 'world-raw' }), msg = worldError(), saved = toSnbt(value === undefined ? {} : value, null, true);
  var code = kCode({ value: saved, height: 220, validate: function (t) { parseSnbtUser(t); }, onInput: function () { msg.textContent = I18n.t("cadeditor.ui.world.0405293410"); } });
  var save = kBtn(I18n.t("cadeditor.ui.world.02391a80c7"), function () {
    try { var next = parseSnbtUser(code.get()); if (validate) validate(next); set(next); saved = code.get(); msg.textContent = I18n.t("cadeditor.ui.world.0fa16ed8b6"); }
    catch (e) { msg.textContent = I18n.t("cadeditor.ui.world.51cd394381", (e.message || e)); }
  }, { cls: 'pri' });
  box.appendChild(code.el); box.appendChild(h('div', { class: 'world-actions' }, [msg, kBtn(I18n.t("cadeditor.ui.world.f0044c72f7"), function () { code.set(saved, true); msg.textContent = ''; }), save]));
  return box;
}
/* 实体“常用字段”：来自游戏里新建的临时实体的默认 NBT（entity_info.default_nbt），不是手写清单 */
function suggestEntityFields(typeId, have, onPick, anchor) {
  if (!typeId) { toast(I18n.t("cadeditor.ui.world.ce77cbbccf"), 'warn'); return; }
  var info = Reg.entityInfo(typeId);
  if (info === null) { toast(I18n.t("cadeditor.ui.world.2a44e6e3f0")); return; }
  if (!info || !info.template_available || !info.default_nbt) { toast(I18n.t("cadeditor.ui.world.c2c2dfa58e"), 'warn'); return; }
  var nbt; try { nbt = parseSnbt(info.default_nbt); } catch (e) { toast(I18n.t("cadeditor.ui.world.cf04aa2201"), 'warn'); return; }
  var entries = Object.keys(nbt).filter(function (k) { return k !== 'id' && !have(k); }).map(function (k) { return { v: k, label: k, sub: toSnbt(nbt[k], null, false) }; });
  if (!entries.length) { toast(I18n.t("cadeditor.ui.world.422a00906f")); return; }
  pickFrom(anchor, entries, function (e) { onPick(e.v, nbtTake(nbt, e.v)); }, { width: 260 });
}
function worldCompound(v) { if(!isObj(v) || Array.isArray(v)) throw new Error(I18n.t("cadeditor.ui.world.f9d65d3506")); }
function worldMap(value, set, strings, ph) {
  ph = ph || {};
  var obj = clone(isObj(value) ? value : {}), box = h('div', { class: 'world-map' }), add = h('div', { class: 'world-new' }), msg = worldError();
  function put() { set(clone(obj)); }
  var TYPE = { string: ['edit', I18n.t("cadeditor.ui.code.dd81861811")], number: ['sliders', I18n.t("cadeditor.ui.cards4.c16ec9274e")], boolean: ['check', I18n.t("cadeditor.ui.cards4.92d9be0a0e")] };
  var xl = xList({
    items: function () { return Object.keys(obj); },
    empty: '',
    row: function (key) {
      var val = obj[key], prim = typeof val === "string" || typeof val === "boolean" || typeof val === "number";
      var t = TYPE[typeof val] || (Array.isArray(val) ? ['list', I18n.t("cadeditor.ui.forms.aedd6814ff")] : ['folder', I18n.t("cadeditor.ui.world.928500c555")]);
      var rm = kBtn('', function () { delete obj[key]; put(); xl.draw(); }, { icon: 'trash', title: I18n.t("cadeditor.ui.world.9bd797d084") });
      if (prim) {
        var ctl, update = function (x) { nbtPut(obj, key, x); put(); };
        if (typeof val === 'boolean') ctl = kToggle(val, update, '').el;
        else if (typeof val === 'number') ctl = numField5(val, 0, { min: -9007199254740991, max: 9007199254740991, step: Number.isInteger(val) ? 1 : 0.1 }, update);
        else { ctl = kInput(val, update, { placeholder: ph.val || I18n.t("cadeditor.ui.rules.839fc84264") }); ctl.classList.add('world-inline-value'); }
        ctl.setAttribute('aria-label', I18n.t("cadeditor.ui.world.3135e945a6", (key)));
        return { icon: uiIcon(t[0], 14), title: key, sub: t[1], right: h('div', { class: 'x-rt' }, [ctl, rm]) };
      }
      var text = toSnbt(val, null, false);
      return { icon: uiIcon(t[0], 14), title: key, sub: text, tip: text, body: function () {
        return [kSnbtEditor(nbtTake(obj, key), function (x) { nbtPut(obj, key, x); put(); }), xFoot('', function () { delete obj[key]; put(); xl.draw(); })];
      } };
    }
  });
  var key = kInput('', function () {}, { placeholder: ph.key || (strings ? I18n.t("cadeditor.ui.rules.a6f92a1bd4") : I18n.t("cadeditor.ui.world.2b018f9b10")) }), val = kInput('', function () {}, { placeholder: ph.val || (strings ? I18n.t("cadeditor.ui.rules.839fc84264") : I18n.t("cadeditor.ui.world.da055b035c")) });
  add.appendChild(key); add.appendChild(val); add.appendChild(kBtn(I18n.t("cadeditor.ui.cards3.7a8a11ead5"), function () {
    try { var name = key.value.trim(); if (!name) throw new Error(I18n.t("cadeditor.ui.world.ff53e0e6a9")); if (Object.prototype.hasOwnProperty.call(obj, name)) throw new Error(I18n.t("cadeditor.ui.world.0ff31013c6"));
      var next = strings ? val.value : parseSnbtUser(val.value), candidate = clone(obj); nbtPut(candidate, name, next); set(candidate); obj = candidate; xl.draw(); key.value = ''; val.value = ''; msg.textContent = '';
    } catch (e) { msg.textContent = e.message || String(e); }
  }));
  box.addField = function (name, next) { if (Object.prototype.hasOwnProperty.call(obj, name)) return false; var candidate = clone(obj); nbtPut(candidate, name, next); set(candidate); obj = candidate; xl.draw(); return true; };
  box.appendChild(xl.el); box.appendChild(add); box.appendChild(msg); return box;
}

/* 对象列表：行结构同「其它属性加成」。ops: add/remove/changed/summary，可选 title(it,i) 与 icon(it,i) */
function list5(host, items, rowFn, ops, label, empty) {
  var xl = xList({
    items: items, empty: empty || I18n.t("cadeditor.ui.world.590fdddd01"),
    add: { text: label || I18n.t("cadeditor.ui.cards3.7a8a11ead5"), fn: function () { var n = items().length; ops.add(); xl.select(items().length > n ? n : -1); } },
    row: function (it, i) {
      return { icon: ops.icon ? ops.icon(it, i) : uiIcon('list', 14), title: ops.title ? ops.title(it, i) : I18n.t("cadeditor.ui.world.942e34097e", (i + 1)), sub: ops.summary ? ops.summary(it, i) : '',
        body: function () { var body = h('div', { class: 'x-b' }); rowFn(body, it, i, function () { ops.changed(); }); return [body, xFoot('', function () { ops.remove(i); xl.select(-1); })]; } };
    }
  });
  host.appendChild(xl.el);
}

function worldBlockPicker(current,set,title){
  openTagPicker({title:title||I18n.t("cadeditor.ui.world.6270aa616d"),tagsReg:'block',entryReg:'block',multi:true,selected:(current===undefined?[]:Array.isArray(current)?current:[current]).map(pickerId),entryIcon:function(e){return refIcon('block',e.v);},onConfirm:function(ids){
    var tags=ids.filter(function(x){return x.charAt(0)==='#';}), entries=ids.filter(function(x){return x.charAt(0)!=='#';});
    if(tags.length && (tags.length>1||entries.length)) {toast(I18n.t("cadeditor.ui.world.6d2f8a2cf1"),'warn');return;}
    set(tags.length?tags[0]:(entries.length===1?entries[0]:entries));
  }});
}
function worldBlockName(blocks){
  if(blocks===undefined)return I18n.t("cadeditor.ui.rules.c72d9ee134");
  if(Array.isArray(blocks))return blocks.map(function(id){return worldBlockName(id);}).join('、');
  if(blocks.charAt(0)==='#')return blocks;
  var nm=Reg.nameOf2('block',blocks);return nm||blocks;
}
/* 一项条件：标题 + 一句人话说明 + 控件 */
function worldCond(title,hint,action,content){
  return h('div',{class:'world-cond'},[h('div',{class:'world-cond-h'},[h('b',{text:title}),h('div',{class:'grow'}),action||null]),hint?h('div',{class:'world-hint',text:hint}):null,content]);
}


['block_entity_data','entity_data','bucket_entity_data','custom_data'].forEach(function(cid){AUTO_BODY[cid]=function(card,id,v){
  var obj=clone(isObj(v)?v:{}), typed=cid==='block_entity_data'||cid==='entity_data';
  var DATA_NOTE={block_entity_data:I18n.t("cadeditor.ui.world.912f281111"),entity_data:I18n.t("cadeditor.ui.world.c2d960612c"),bucket_entity_data:I18n.t("cadeditor.ui.world.fe0fc68b94"),custom_data:I18n.t("cadeditor.ui.world.76114bfe2d")};
  card.body.appendChild(h('div',{class:'world-note',text:DATA_NOTE[cid]}));
  function put(){autoPut(id,clone(obj));}
  if(typed)card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.labels.ba40014ff4"),kRegSelect({reg:cid==='entity_data'?'entity_type':'block_entity_type',value:obj.id||'',title:I18n.t("cadeditor.ui.world.d16388bd5c"),entityText:function(){return nbtMerge(obj,null);},onChange:function(x){obj.id=x;put();},onEntityNbt:cid==='entity_data'?function(snbt){
    obj=vaultEntityObj(snbt);
    Store.set(id,obj,{label:I18n.t("cadeditor.ui.spawn.20afdf83d8"),structural:false});
    clear(card.body);AUTO_BODY[cid](card,id,obj);
  }:null}).el));
  var extra=clone(obj);if(typed)delete extra.id;
  var mapEl=worldMap(extra,function(x){if(typed&&Object.prototype.hasOwnProperty.call(x,'id'))throw new Error(I18n.t("cadeditor.ui.world.7d0a7744b3"));var type=obj.id;obj=x;if(typed)obj.id=type;put();},false);
  var sug=cid==='entity_data'?kBtn(I18n.t("cadeditor.ui.spawn.e56195638e"),function(){suggestEntityFields(obj.id,function(k){return Object.prototype.hasOwnProperty.call(obj,k);},function(k,val){try{mapEl.addField(k,val);}catch(e){toast(e.message||String(e),'warn');}},sug);},{title:I18n.t("cadeditor.ui.world.6829a85d82")}):null;
  card.body.appendChild(worldSection(I18n.t("cadeditor.ui.world.c9bf850b37"),sug));
  card.body.appendChild(mapEl);
  card.body.appendChild(Valid.badge(id));
};});
AUTO_BODY.lock=function(card,cid,v){
  card.body.appendChild(Valid.badge(cid));
  card.body.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.7a222f5d66")}));
  var obj=clone(isObj(v)?v:{});
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.43d4f9d7c6"),wHolderSet('item',obj.items===undefined?[]:obj.items,function(x){if(Array.isArray(x)&&!x.length)delete obj.items;else obj.items=x;autoPut(cid,obj);})));
  var rest=clone(obj);delete rest.items;
  card.body.appendChild(worldFold(I18n.t("cadeditor.ui.world.4b2b41abbe"),kSnbtEditor(rest,function(x){worldCompound(x);if(x.items!==undefined)throw new Error(I18n.t("cadeditor.ui.world.5dee8db359"));var items=obj.items;obj=x;if(items!==undefined)obj.items=items;autoPut(cid,obj);}),Object.keys(rest).length>0));
};
AUTO_BODY.container_loot=function(card,cid,v){
  var obj=clone(isObj(v)?v:{});
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.spawn.9a63c2e6fc"),kRegSelect({reg:'loot_table',value:obj.loot_table||'',title:I18n.t("cadeditor.ui.spawn.0c4481f3cf"),onChange:function(x){obj.loot_table=x;autoPut(cid,obj);}}).el));
  var msg=worldError(),seed=kInput(obj.seed===undefined?'0':String(obj.seed),function(x){
    if(!/^-?\d+$/.test(x)){msg.textContent=I18n.t("cadeditor.ui.world.7b6d6681e8");return;}
    var next=Number(x);if(!Number.isSafeInteger(next)){msg.textContent=I18n.t("cadeditor.ui.world.921fb48f9a");return;}obj.seed=next;autoPut(cid,obj);msg.textContent='';
  },{placeholder:I18n.t("cadeditor.ui.world.b29a4768cd")});
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.30eca98dc1"),seed));card.body.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.e98de99196")}));card.body.appendChild(msg);
};
AUTO_BODY.pot_decorations=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  /* Codec 的四个位置顺序固定；这是位置标签，不是可选数据清单。 */
  [I18n.t("cadeditor.ui.world.2d270b6ce4"),I18n.t("cadeditor.ui.world.6a24b14f33"),I18n.t("cadeditor.ui.world.1cf1d4d0b2"),I18n.t("cadeditor.ui.picker.740f5e8102")].forEach(function(label,i){card.body.appendChild(fieldRow(label,kRegSelect({reg:'item',value:arr[i]||'',empty:I18n.t("cadeditor.ui.world.26645e27a4"),title:I18n.t("cadeditor.ui.world.2957a8cea0", (label)),onChange:function(x){while(arr.length<=i)arr.push('minecraft:brick');arr[i]=x;autoPut(cid,arr);}}).el));});
};
AUTO_BODY.recipes = function (card, cid, v) {
  var arr = clone(Array.isArray(v) ? v : []);
  var xl = xList({
    items: function () { return arr; }, empty: I18n.t("cadeditor.ui.world.9b4a143a95"),
    add: { text: I18n.t("cadeditor.ui.world.c6fb315fd6"), fn: function () { openRegPick({ reg: 'recipe', title: I18n.t("cadeditor.ui.world.38bc75dc29"), onPick: function (id) { if (arr.indexOf(id) < 0) { arr.push(id); autoPut(cid, arr); xl.draw(); } } }); } },
    row: function (id, i) {
      return { icon: uiIcon('book', 14), title: Reg.nameOf2('recipe', id) || id, sub: id, tip: id, right: kBtn('', function () { arr.splice(i, 1); autoPut(cid, arr); xl.draw(); }, { icon: 'trash', title: I18n.t("cadeditor.ui.cards1.6135d4159e") }) };
    }
  });
  card.body.appendChild(kHint(I18n.t("cadeditor.ui.world.f18f9a0220"), 'note'));
  card.body.appendChild(xl.el);
};
AUTO_BODY.charged_projectiles=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  card.body.appendChild(Valid.badge(cid));
  list5(card.body,function(){return arr;},function(body,it,i,ch){
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.5a8114a4b3"),kRegSelect({reg:'item',value:it.id||'',title:I18n.t("cadeditor.ui.world.5a6d3483db"),onChange:function(x){it.id=x;ch();}}).el));
    if(it.id)body.appendChild(kBtn(I18n.t("cadeditor.ui.cards3.7f559289d4"),function(){editNestedStack(it,I18n.t("cadeditor.ui.world.1ac8932b59"),function(next){arr[i]=next;NBT_FORCE.charged_projectiles=true;autoPut(cid,arr);},drawDetail);},{icon:'edit'}));
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.pages.5e29d121dd"),numField5(it.count,1,{min:1,max:99,unit:I18n.t("cadeditor.ui.cards3.3a116815bc")},function(n){it.count=n;ch();})));
    var rest=clone(it);delete rest.id;delete rest.count;
    body.appendChild(worldFold(I18n.t("cadeditor.ui.world.1f47d74722"),kSnbtEditor(rest,function(x){worldCompound(x);if(x.id!==undefined||x.count!==undefined)throw new Error(I18n.t("cadeditor.ui.world.3f6fe37788"));var id=it.id,n=it.count;Object.keys(it).forEach(function(k){delete it[k];});Object.keys(x).forEach(function(k){nbtPut(it,k,nbtTake(x,k));});it.id=id;it.count=n;ch();}),false));
  },{add:function(){openRegPick({reg:'item',title:I18n.t("cadeditor.ui.world.adf08e13d9"),onPick:function(id){arr.push({id:id,count:1});autoPut(cid,arr);drawDetail();}});},remove:function(i){arr.splice(i,1);autoPut(cid,arr);},changed:function(){autoPut(cid,arr);},title:function(it){return nameOfItem(it.id);},icon:function(it){return itemIcon(it.id,16);},summary:function(it){return '× '+(it.count||1);}},I18n.t("cadeditor.ui.world.adf08e13d9"),I18n.t("cadeditor.ui.world.60d5d75453"));
  card.body.appendChild(h('div',{class:'k-row'},[kBtn(I18n.t("cadeditor.ui.world.31bb146d9a"),function(){openVault({pick:function(stack){arr.push(vaultNested(stack));NBT_FORCE.charged_projectiles=true;autoPut(cid,arr);drawDetail();}});},{icon:'chest',title:I18n.t("cadeditor.ui.world.86db527b5b")})]));
};

AUTO_BODY.bees=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  list5(card.body,function(){return arr;},function(body,it,i,ch){
    body.appendChild(esEntityHeader({id:it.entity_data&&it.entity_data.id||'minecraft:bee',snbtText:function(){return nbtMerge(it.entity_data||{id:'minecraft:bee'},null);},onPick:function(id){it.entity_data=clone(it.entity_data||{});it.entity_data.id=id;ch();drawDetail();},onEntityNbt:function(snbt){it.entity_data=vaultEntityObj(snbt);NBT_FORCE.bees=true;ch();drawDetail();}}));
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.7e2d0e09b4"),numField5(it.ticks_in_hive,0,{min:0,step:20,unit:I18n.t("cadeditor.ui.cards2.3ccf035260")},function(n){it.ticks_in_hive=n;ch();})));
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.c0e4eb276e"),numField5(it.min_ticks_in_hive,600,{min:0,step:20,unit:I18n.t("cadeditor.ui.cards2.3ccf035260")},function(n){it.min_ticks_in_hive=n;ch();})));
    body.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.c31b322426")}));
    body.appendChild(worldFold(I18n.t("cadeditor.ui.world.29d84cd083"),kSnbtEditor(it.entity_data||{},function(x){worldCompound(x);if(!x.id)throw new Error(I18n.t("cadeditor.ui.world.d7384677dc"));it.entity_data=x;ch();}),false));
  },{add:function(){arr.push({entity_data:{id:'minecraft:bee'},ticks_in_hive:0,min_ticks_in_hive:600});autoPut(cid,arr);},remove:function(i){arr.splice(i,1);autoPut(cid,arr);},changed:function(){autoPut(cid,arr);},title:function(it,i){return I18n.t("cadeditor.ui.world.eab90d1f5c", (i+1));},icon:function(){return uiIcon('flower',14);},summary:function(it){return I18n.t("cadeditor.ui.world.636fc4ceff", (fmtNum((it.ticks_in_hive||0)/20)), (fmtNum((it.min_ticks_in_hive||0)/20)));}},I18n.t("cadeditor.ui.world.4a66ac43cc"),I18n.t("cadeditor.ui.world.d985f6230c"));
};
AUTO_BODY.profile=function(card,cid,v){
  var obj=clone(typeof v==='string'?{name:v}:isObj(v)?v:{});
  function put(){autoPut(cid,Object.keys(obj).length===1&&obj.name!==undefined?obj.name:clone(obj));}
  function input(key,ph){return kInput(obj[key]||'',function(x){if(x)obj[key]=x;else delete obj[key];put();},{placeholder:ph||I18n.t("cadeditor.ui.world.394680d3ce")});}
  card.body.appendChild(worldSection(I18n.t("cadeditor.ui.world.af70df7b9c")));
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.screens.4498621999"),input('name',I18n.t("cadeditor.ui.world.2b7f600dd8"))));
  card.body.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.f5096a8b86")}));
  var resources=h('div');
  /* 贴图 ID 写入值是去掉 textures/ 和 .png 的 ns:path；游戏资源包里有的列出来选，也能手输 */
  function res(key,reg){return Reg.live()?kRegSelect({reg:reg,value:obj[key]||'',title:I18n.t("cadeditor.ui.world.ce0b615469"),empty:I18n.t("cadeditor.ui.spawn.481e392266"),allowClear:true,onChange:function(x){if(x)obj[key]=x;else delete obj[key];put();}}).el:input(key,I18n.t("cadeditor.ui.world.94b6d0a399"));}
  [['texture',I18n.t("cadeditor.ui.world.89ff95dfe7"),'profile_texture'],['cape',I18n.t("cadeditor.ui.world.ff6519c3a9"),'profile_cape'],['elytra',I18n.t("cadeditor.ui.cards2.09e4cdfa68"),'profile_elytra']].forEach(function(f){resources.appendChild(fieldRow(f[1],res(f[0],f[2])));});
  resources.appendChild(fieldRow(I18n.t("cadeditor.ui.world.6177b7d979"),kInput(obj.model||'',function(x){if(x)obj.model=x;else delete obj.model;put();},{placeholder:I18n.t("cadeditor.ui.world.5a870d407c")})));
  card.body.appendChild(worldFold(I18n.t("cadeditor.ui.world.32182ae901"),resources,!!(obj.texture||obj.cape||obj.elytra)));
  var advanced={};Object.keys(obj).forEach(function(k){if(['name','texture','cape','elytra','model'].indexOf(k)<0)nbtPut(advanced,k,nbtTake(obj,k));});
  card.body.appendChild(worldFold(I18n.t("cadeditor.ui.world.275cd9974d"),kSnbtEditor(advanced,function(x){worldCompound(x);Object.keys(x).forEach(function(k){if(['name','texture','cape','elytra','model'].indexOf(k)>=0)throw new Error(I18n.t("cadeditor.ui.world.f9e9fd56c1", (k)));});Object.keys(advanced).forEach(function(k){delete obj[k];});Object.keys(x).forEach(function(k){nbtPut(obj,k,nbtTake(x,k));});advanced=clone(x);put();}),false));
};
AUTO_BODY.map_decorations=function(card,cid,v){
  var obj=clone(isObj(v)?v:{}), arr=Object.keys(obj).map(function(k){return {key:k,val:obj[k]};});
  function put(){var out={};arr.forEach(function(e){out[e.key]=e.val;});autoPut(cid,out);}
  list5(card.body,function(){return arr;},function(body,e,i,ch){
    var err=worldError();
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.4fa94f8eab"),kInput(e.key,function(x){var k=x.trim();if(!k||arr.some(function(a,j){return j!==i&&a.key===k;})){err.textContent=I18n.t("cadeditor.ui.world.70e817b097");return;}e.key=k;err.textContent='';ch();},{placeholder:I18n.t("cadeditor.ui.world.6df5e52cd9")})));body.appendChild(err);
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.df164552a7"),kRegSelect({reg:'map_decoration_type',value:e.val.type||'',title:I18n.t("cadeditor.ui.world.ccedf474a6"),onChange:function(x){e.val.type=x;ch();}}).el));
    ['x','z'].forEach(function(k){body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.2ede68aefd", (k.toUpperCase())),numField5(e.val[k],0,{step:1},function(n){e.val[k]=n;ch();})));});
    body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.0798f8c3df"),numField5(e.val.rotation,0,{step:15,unit:I18n.t("cadeditor.ui.specs.e24a9725df")},function(n){e.val.rotation=n;ch();})));
  },{add:function(){var n=1;while(arr.some(function(e){return e.key==='mark'+n;}))n++;openRegPick({reg:'map_decoration_type',title:I18n.t("cadeditor.ui.world.6249458084"),onPick:function(id){arr.push({key:'mark'+n,val:{type:id,x:0,z:0,rotation:0}});put();drawDetail();}});},remove:function(i){arr.splice(i,1);put();},changed:put,title:function(e){return e.key;},icon:function(){return uiIcon('map',14);},summary:function(e){return 'X '+fmtNum(e.val.x||0)+' / Z '+fmtNum(e.val.z||0);}},I18n.t("cadeditor.ui.world.2b62bd0be5"),I18n.t("cadeditor.ui.world.f651405098"));
};
AUTO_BODY.lodestone_tracker=function(card,cid,v){
  var obj=clone(isObj(v)?v:{}), target=clone(obj.target||{pos:[0,64,0]}), box=h('div');
  function put(){autoPut(cid,clone(obj));}
  card.body.appendChild(fieldRow(I18n.t("cadeditor.ui.world.043d63e345"),kToggle(!!obj.target,function(on){if(on)obj.target=clone(target);else delete obj.target;put();draw();},'').el));card.body.appendChild(box);
  function draw(){
    clear(box);if(!obj.target){box.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.77f2c9925f")}));return;}
    var t=obj.target;if(!Array.isArray(t.pos))t.pos=[0,64,0];
    box.appendChild(fieldRow(I18n.t("cadeditor.ui.world.4fa164bacd"),kRegSelect({reg:'dimension',value:t.dimension||'',title:I18n.t("cadeditor.ui.world.768e6c733b"),empty:I18n.t("cadeditor.ui.world.acd00bd1a4"),onChange:function(x){t.dimension=x;target=clone(t);put();}}).el));
    ['X','Y','Z'].forEach(function(ax,i){box.appendChild(fieldRow(I18n.t("cadeditor.ui.world.a97d0972f4", (ax)),numField5(t.pos[i],0,{step:1},function(n){t.pos[i]=Math.round(n);target=clone(t);put();})));});
    box.appendChild(fieldRow(I18n.t("cadeditor.ui.world.63fa03f737"),kToggle(obj.tracked!==false,function(on){obj.tracked=on;put();},'').el));
    box.appendChild(h('div',{class:'world-note',text:I18n.t("cadeditor.ui.world.b8493517de")}));
  }
  draw();
};
