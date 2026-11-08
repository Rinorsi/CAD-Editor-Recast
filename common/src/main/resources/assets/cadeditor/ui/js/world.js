/* 放置与数据：显式规则、扁平列表、原始数据先校验再写入草稿。 */
var WORLD_DETAIL = ['can_place_on','can_break','block_state','block_entity_data','entity_data','bucket_entity_data','custom_data','lock','container_loot','bees','pot_decorations','profile','charged_projectiles','recipes','map_decorations','lodestone_tracker','debug_stick_state'];
HEAD_AUTO.map_color=1;
AUTO_BODY.map_color=function(card,cid,v){
  var color=typeof v==='number'?v:0xffffff, chip=h('span',{class:'world-color-chip',style:'background:'+hex6(color)});
  var choose=kBtn(hex6(color),function(){
    kColorPop(choose,color,function(x){color=x;autoPut(cid,x);chip.setAttribute('style','background:'+hex6(x));choose.querySelector('span').textContent=hex6(x);},{cls:'world-color-pop',width:240,maxHeight:160});
  });headCtl(card,h('div',{class:'world-inline'},[chip,choose]));
};
var WORLD_SEC_ICON = { '数据字段': 'code', '玩家皮肤': 'user', '解锁配方': 'book', '条目': 'list' };
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
  var code = kCode({ value: saved, height: 220, validate: function (t) { parseSnbtUser(t); }, onInput: function () { msg.textContent = '尚未写入草稿'; } });
  var save = kBtn('写入草稿', function () {
    try { var next = parseSnbtUser(code.get()); if (validate) validate(next); set(next); saved = code.get(); msg.textContent = '已写入草稿'; }
    catch (e) { msg.textContent = '未写入：' + (e.message || e); }
  }, { cls: 'pri' });
  box.appendChild(code.el); box.appendChild(h('div', { class: 'world-actions' }, [msg, kBtn('撤回输入', function () { code.set(saved, true); msg.textContent = ''; }), save]));
  return box;
}
/* 实体“常用字段”：来自游戏里新建的临时实体的默认 NBT（entity_info.default_nbt），不是手写清单 */
function suggestEntityFields(typeId, have, onPick, anchor) {
  if (!typeId) { toast('请先选择实体类型', 'warn'); return; }
  var info = Reg.entityInfo(typeId);
  if (info === null) { toast('正在读取实体默认数据，稍后再点一次'); return; }
  if (!info || !info.template_available || !info.default_nbt) { toast('读不到这个实体的默认数据，请手动添加', 'warn'); return; }
  var nbt; try { nbt = parseSnbt(info.default_nbt); } catch (e) { toast('默认数据无法解析，请手动添加', 'warn'); return; }
  var entries = Object.keys(nbt).filter(function (k) { return k !== 'id' && !have(k); }).map(function (k) { return { v: k, label: k, sub: toSnbt(nbt[k], null, false) }; });
  if (!entries.length) { toast('默认数据里的字段都已经添加了'); return; }
  pickFrom(anchor, entries, function (e) { onPick(e.v, nbt[e.v]); }, { width: 260 });
}
function worldCompound(v) { if(!isObj(v) || Array.isArray(v)) throw new Error('需要 {键:值} 形式的复合数据'); }
function worldMap(value, set, strings, ph) {
  ph = ph || {};
  var obj = clone(isObj(value) ? value : {}), box = h('div', { class: 'world-map' }), add = h('div', { class: 'world-new' }), msg = worldError();
  function put() { set(clone(obj)); }
  var TYPE = { string: ['edit', '文本'], number: ['sliders', '数字'], boolean: ['check', '开关'] };
  var xl = xList({
    items: function () { return Object.keys(obj); },
    empty: '',
    row: function (key) {
      var val = obj[key], prim = typeof val === "string" || typeof val === "boolean" || typeof val === "number";
      var t = TYPE[typeof val] || (Array.isArray(val) ? ['list', '列表'] : ['folder', '复合数据']);
      var rm = kBtn('', function () { delete obj[key]; put(); xl.draw(); }, { icon: 'trash', title: '删除这个字段' });
      if (prim) {
        var ctl, update = function (x) { obj[key] = x; put(); };
        if (typeof val === 'boolean') ctl = kToggle(val, update, '').el;
        else if (typeof val === 'number') ctl = numField5(val, 0, { min: -9007199254740991, max: 9007199254740991, step: Number.isInteger(val) ? 1 : 0.1 }, update);
        else { ctl = kInput(val, update, { placeholder: ph.val || '属性值' }); ctl.classList.add('world-inline-value'); }
        ctl.setAttribute('aria-label', key + ' 的值');
        return { icon: uiIcon(t[0], 14), title: key, sub: t[1], right: h('div', { class: 'x-rt' }, [ctl, rm]) };
      }
      var text = toSnbt(val, null, false);
      return { icon: uiIcon(t[0], 14), title: key, sub: text, tip: text, body: function () {
        return [kSnbtEditor(val, function (x) { obj[key] = x; put(); }), xFoot('', function () { delete obj[key]; put(); xl.draw(); })];
      } };
    }
  });
  var key = kInput('', function () {}, { placeholder: ph.key || (strings ? '属性名' : '字段名') }), val = kInput('', function () {}, { placeholder: ph.val || (strings ? '属性值' : '值（SNBT）') });
  add.appendChild(key); add.appendChild(val); add.appendChild(kBtn('添加', function () {
    try { var name = key.value.trim(); if (!name) throw new Error('请填写字段名'); if (Object.prototype.hasOwnProperty.call(obj, name)) throw new Error('同名字段已存在');
      var next = strings ? val.value : parseSnbtUser(val.value), candidate = clone(obj); candidate[name] = next; set(candidate); obj = candidate; xl.draw(); key.value = ''; val.value = ''; msg.textContent = '';
    } catch (e) { msg.textContent = e.message || String(e); }
  }));
  box.addField = function (name, next) { if (Object.prototype.hasOwnProperty.call(obj, name)) return false; var candidate = clone(obj); candidate[name] = next; set(candidate); obj = candidate; xl.draw(); return true; };
  box.appendChild(xl.el); box.appendChild(add); box.appendChild(msg); return box;
}

/* 对象列表：行结构同「其它属性加成」。ops: add/remove/changed/summary，可选 title(it,i) 与 icon(it,i) */
function list5(host, items, rowFn, ops, label, empty) {
  var xl = xList({
    items: items, empty: empty || '暂无条目',
    add: { text: label || '添加', fn: function () { var n = items().length; ops.add(); xl.select(items().length > n ? n : -1); } },
    row: function (it, i) {
      return { icon: ops.icon ? ops.icon(it, i) : uiIcon('list', 14), title: ops.title ? ops.title(it, i) : '第 ' + (i + 1) + ' 项', sub: ops.summary ? ops.summary(it, i) : '',
        body: function () { var body = h('div', { class: 'x-b' }); rowFn(body, it, i, function () { ops.changed(); }); return [body, xFoot('', function () { ops.remove(i); xl.select(-1); })]; } };
    }
  });
  host.appendChild(xl.el);
}

function worldBlockPicker(current,set,title){
  openTagPicker({title:title||'选择目标方块',tagsReg:'block',entryReg:'block',multi:true,entryIcon:function(e){return refIcon('block',e.v);},onConfirm:function(ids){
    var tags=ids.filter(function(x){return x.charAt(0)==='#';}), entries=ids.filter(function(x){return x.charAt(0)!=='#';});
    if(tags.length && (tags.length>1||entries.length)) {toast('一条规则只能使用一个标签或多个方块，请分别添加规则','warn');return;}
    if(ids.length)set(tags.length?tags[0]:(entries.length===1?entries[0]:entries));
  }});
}
function worldBlockName(blocks){
  if(blocks===undefined)return '任意方块';
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
  var DATA_NOTE={block_entity_data:'这个物品被放下变成方块时，方块内部会带上这些数据，例如箱子里的物品、告示牌文字。',entity_data:'用这个物品生成实体时，实体会带上这些数据，例如 NoAI = 1 表示生物不会自己行动。',bucket_entity_data:'用桶放出生物时，生物会带上这些数据，例如 NoAI = 1 表示生物不会自己行动。',custom_data:'随物品保存的自定义数据，游戏本身不使用，常给数据包、命令或其他模组读取。'};
  card.body.appendChild(h('div',{class:'world-note',text:DATA_NOTE[cid]}));
  function put(){autoPut(id,clone(obj));}
  if(typed)card.body.appendChild(fieldRow('类型',kRegSelect({reg:cid==='entity_data'?'entity_type':'block_entity_type',value:obj.id||'',title:'选择类型',onChange:function(x){obj.id=x;put();}}).el));
  var extra=clone(obj);if(typed)delete extra.id;
  var mapEl=worldMap(extra,function(x){if(typed&&Object.prototype.hasOwnProperty.call(x,'id'))throw new Error('类型请通过上方选择器修改');var type=obj.id;obj=x;if(typed)obj.id=type;put();},false);
  var sug=cid==='entity_data'?kBtn('常用字段',function(){suggestEntityFields(obj.id,function(k){return Object.prototype.hasOwnProperty.call(obj,k);},function(k,val){try{mapEl.addField(k,val);}catch(e){toast(e.message||String(e),'warn');}},sug);},{title:'从这个实体的默认数据里挑字段'}):null;
  card.body.appendChild(worldSection('数据字段',sug));
  card.body.appendChild(mapEl);
  card.body.appendChild(Valid.badge(id));
};});
AUTO_BODY.lock=function(card,cid,v){
  card.body.appendChild(Valid.badge(cid));
  card.body.appendChild(h('div',{class:'world-note',text:'钥匙匹配条件 · 所有已填写条件都必须满足'}));
  var obj=clone(isObj(v)?v:{});
  card.body.appendChild(fieldRow('钥匙物品',wHolderSet('item',obj.items===undefined?[]:obj.items,function(x){if(Array.isArray(x)&&!x.length)delete obj.items;else obj.items=x;autoPut(cid,obj);})));
  var rest=clone(obj);delete rest.items;
  card.body.appendChild(worldFold('其他条件',kSnbtEditor(rest,function(x){worldCompound(x);if(x.items!==undefined)throw new Error('钥匙物品请在上方选择');var items=obj.items;obj=x;if(items!==undefined)obj.items=items;autoPut(cid,obj);}),Object.keys(rest).length>0));
};
AUTO_BODY.container_loot=function(card,cid,v){
  var obj=clone(isObj(v)?v:{});
  card.body.appendChild(fieldRow('战利品表',kRegSelect({reg:'loot_table',value:obj.loot_table||'',title:'选择战利品表',onChange:function(x){obj.loot_table=x;autoPut(cid,obj);}}).el));
  var msg=worldError(),seed=kInput(obj.seed===undefined?'0':String(obj.seed),function(x){
    if(!/^-?\d+$/.test(x)){msg.textContent='请输入整数种子';return;}
    var next=Number(x);if(!Number.isSafeInteger(next)){msg.textContent='此种子超出当前编辑器的精确整数范围，未修改';return;}obj.seed=next;autoPut(cid,obj);msg.textContent='';
  },{placeholder:'0 表示随机'});
  card.body.appendChild(fieldRow('随机种子',seed));card.body.appendChild(h('div',{class:'world-note',text:'0 表示每次随机生成。'}));card.body.appendChild(msg);
};
AUTO_BODY.pot_decorations=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  /* Codec 的四个位置顺序固定；这是位置标签，不是可选数据清单。 */
  ['背面','左侧','右侧','正面'].forEach(function(label,i){card.body.appendChild(fieldRow(label,kRegSelect({reg:'item',value:arr[i]||'',empty:'砖块（默认）',title:'选择'+label+'装饰',onChange:function(x){while(arr.length<=i)arr.push('minecraft:brick');arr[i]=x;autoPut(cid,arr);}}).el));});
};
AUTO_BODY.recipes = function (card, cid, v) {
  var arr = clone(Array.isArray(v) ? v : []);
  var xl = xList({
    items: function () { return arr; }, empty: '没有额外解锁的配方',
    add: { text: '添加配方', fn: function () { openRegPick({ reg: 'recipe', title: '选择配方', onPick: function (id) { if (arr.indexOf(id) < 0) { arr.push(id); autoPut(cid, arr); xl.draw(); } } }); } },
    row: function (id, i) {
      return { icon: uiIcon('book', 14), title: Reg.nameOf2('recipe', id) || id, sub: id, tip: id, right: kBtn('', function () { arr.splice(i, 1); autoPut(cid, arr); xl.draw(); }, { icon: 'trash', title: '移除' }) };
    }
  });
  card.body.appendChild(kHint('使用这个物品时，玩家额外解锁的配方。', 'note'));
  card.body.appendChild(xl.el);
};
AUTO_BODY.charged_projectiles=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  card.body.appendChild(Valid.badge(cid));
  list5(card.body,function(){return arr;},function(body,it,i,ch){
    body.appendChild(fieldRow('弹药',kRegSelect({reg:'item',value:it.id||'',title:'选择弹药',onChange:function(x){it.id=x;ch();}}).el));
    body.appendChild(fieldRow('数量',numField5(it.count,1,{min:1,max:99,unit:'个'},function(n){it.count=n;ch();})));
    var rest=clone(it);delete rest.id;delete rest.count;
    body.appendChild(worldFold('弹药附加数据',kSnbtEditor(rest,function(x){worldCompound(x);if(x.id!==undefined||x.count!==undefined)throw new Error('物品和数量请在上方修改');var id=it.id,n=it.count;Object.keys(it).forEach(function(k){delete it[k];});Object.keys(x).forEach(function(k){it[k]=x[k];});it.id=id;it.count=n;ch();}),false));
  },{add:function(){openRegPick({reg:'item',title:'添加弹药',onPick:function(id){arr.push({id:id,count:1});autoPut(cid,arr);drawDetail();}});},remove:function(i){arr.splice(i,1);autoPut(cid,arr);},changed:function(){autoPut(cid,arr);},title:function(it){return nameOfItem(it.id);},icon:function(it){return itemIcon(it.id,16);},summary:function(it){return '× '+(it.count||1);}},'添加弹药','尚未装填弹药');
  card.body.appendChild(h('div',{class:'k-row'},[kBtn('从保险库取一件',function(){openVault({pick:function(stack){arr.push(vaultNested(stack));NBT_FORCE.charged_projectiles=true;autoPut(cid,arr);drawDetail();}});},{icon:'chest',title:'带着它的全部自定义组件放进来'})]));
};

AUTO_BODY.bees=function(card,cid,v){
  var arr=clone(Array.isArray(v)?v:[]);
  list5(card.body,function(){return arr;},function(body,it,i,ch){
    body.appendChild(fieldRow('已在巢中',numField5(it.ticks_in_hive,0,{min:0,step:20,unit:'刻'},function(n){it.ticks_in_hive=n;ch();})));
    body.appendChild(fieldRow('离巢所需',numField5(it.min_ticks_in_hive,600,{min:0,step:20,unit:'刻'},function(n){it.min_ticks_in_hive=n;ch();})));
    body.appendChild(h('div',{class:'world-note',text:'20 刻 = 1 秒；达到所需时间后才允许离巢。'}));
    body.appendChild(worldFold('蜜蜂实体数据',kSnbtEditor(it.entity_data||{},function(x){worldCompound(x);if(!x.id)throw new Error('实体数据需要 id');it.entity_data=x;ch();}),false));
  },{add:function(){arr.push({entity_data:{id:'minecraft:bee'},ticks_in_hive:0,min_ticks_in_hive:600});autoPut(cid,arr);},remove:function(i){arr.splice(i,1);autoPut(cid,arr);},changed:function(){autoPut(cid,arr);},title:function(it,i){return '蜜蜂 '+(i+1);},icon:function(){return uiIcon('flower',14);},summary:function(it){return '已停留 '+fmtNum((it.ticks_in_hive||0)/20)+' 秒 / 所需 '+fmtNum((it.min_ticks_in_hive||0)/20)+' 秒';}},'添加蜜蜂','巢中没有蜜蜂');
};
AUTO_BODY.profile=function(card,cid,v){
  var obj=clone(typeof v==='string'?{name:v}:isObj(v)?v:{});
  function put(){autoPut(cid,Object.keys(obj).length===1&&obj.name!==undefined?obj.name:clone(obj));}
  function input(key,ph){return kInput(obj[key]||'',function(x){if(x)obj[key]=x;else delete obj[key];put();},{placeholder:ph||'可不填'});}
  card.body.appendChild(worldSection('玩家皮肤'));
  card.body.appendChild(fieldRow('玩家名',input('name','输入玩家名')));
  card.body.appendChild(h('div',{class:'world-note',text:'游戏联网获取该玩家的皮肤。'}));
  var resources=h('div');
  /* 贴图 ID 写入值是去掉 textures/ 和 .png 的 ns:path；游戏资源包里有的列出来选，也能手输 */
  function res(key,reg){return Reg.live()?kRegSelect({reg:reg,value:obj[key]||'',title:'选择贴图',empty:'（未指定）',allowClear:true,onChange:function(x){if(x)obj[key]=x;else delete obj[key];put();}}).el:input(key,'贴图 ID，如 minecraft:entity/player/wide/steve');}
  [['texture','身体皮肤','profile_texture'],['cape','披风','profile_cape'],['elytra','鞘翅','profile_elytra']].forEach(function(f){resources.appendChild(fieldRow(f[1],res(f[0],f[2])));});
  resources.appendChild(fieldRow('手臂模型',kInput(obj.model||'',function(x){if(x)obj.model=x;else delete obj.model;put();},{placeholder:'资源定义中的模型名'})));
  card.body.appendChild(worldFold('资源包皮肤覆盖',resources,!!(obj.texture||obj.cape||obj.elytra)));
  var advanced={};Object.keys(obj).forEach(function(k){if(['name','texture','cape','elytra','model'].indexOf(k)<0)advanced[k]=obj[k];});
  card.body.appendChild(worldFold('UUID 与签名属性',kSnbtEditor(advanced,function(x){worldCompound(x);Object.keys(x).forEach(function(k){if(['name','texture','cape','elytra','model'].indexOf(k)>=0)throw new Error('请在对应字段修改 '+k);});Object.keys(advanced).forEach(function(k){delete obj[k];});Object.keys(x).forEach(function(k){obj[k]=x[k];});advanced=clone(x);put();}),false));
};
AUTO_BODY.map_decorations=function(card,cid,v){
  var obj=clone(isObj(v)?v:{}), arr=Object.keys(obj).map(function(k){return {key:k,val:obj[k]};});
  function put(){var out={};arr.forEach(function(e){out[e.key]=e.val;});autoPut(cid,out);}
  list5(card.body,function(){return arr;},function(body,e,i,ch){
    var err=worldError();
    body.appendChild(fieldRow('标记名称',kInput(e.key,function(x){var k=x.trim();if(!k||arr.some(function(a,j){return j!==i&&a.key===k;})){err.textContent='名称不能为空，也不能重复';return;}e.key=k;err.textContent='';ch();},{placeholder:'唯一名称'})));body.appendChild(err);
    body.appendChild(fieldRow('标记图案',kRegSelect({reg:'map_decoration_type',value:e.val.type||'',title:'选择标记图案',onChange:function(x){e.val.type=x;ch();}}).el));
    ['x','z'].forEach(function(k){body.appendChild(fieldRow('世界 '+k.toUpperCase(),numField5(e.val[k],0,{step:1},function(n){e.val[k]=n;ch();})));});
    body.appendChild(fieldRow('旋转角度',numField5(e.val.rotation,0,{step:15,unit:'度'},function(n){e.val.rotation=n;ch();})));
  },{add:function(){var n=1;while(arr.some(function(e){return e.key==='mark'+n;}))n++;openRegPick({reg:'map_decoration_type',title:'选择新标记的图案',onPick:function(id){arr.push({key:'mark'+n,val:{type:id,x:0,z:0,rotation:0}});put();drawDetail();}});},remove:function(i){arr.splice(i,1);put();},changed:put,title:function(e){return e.key;},icon:function(){return uiIcon('map',14);},summary:function(e){return 'X '+fmtNum(e.val.x||0)+' / Z '+fmtNum(e.val.z||0);}},'添加标记','地图没有额外标记');
};
AUTO_BODY.lodestone_tracker=function(card,cid,v){
  var obj=clone(isObj(v)?v:{}), target=clone(obj.target||{pos:[0,64,0]}), box=h('div');
  function put(){autoPut(cid,clone(obj));}
  card.body.appendChild(fieldRow('固定目标',kToggle(!!obj.target,function(on){if(on)obj.target=clone(target);else delete obj.target;put();draw();},'').el));card.body.appendChild(box);
  function draw(){
    clear(box);if(!obj.target){box.appendChild(h('div',{class:'world-note',text:'未指定磁石目标。'}));return;}
    var t=obj.target;if(!Array.isArray(t.pos))t.pos=[0,64,0];
    box.appendChild(fieldRow('维度',kRegSelect({reg:'dimension',value:t.dimension||'',title:'选择目标维度',empty:'请选择维度',onChange:function(x){t.dimension=x;target=clone(t);put();}}).el));
    ['X','Y','Z'].forEach(function(ax,i){box.appendChild(fieldRow('坐标 '+ax,numField5(t.pos[i],0,{step:1},function(n){t.pos[i]=Math.round(n);target=clone(t);put();})));});
    box.appendChild(fieldRow('追踪磁石',kToggle(obj.tracked!==false,function(on){obj.tracked=on;put();},'').el));
    box.appendChild(h('div',{class:'world-note',text:'追踪开启时，磁石被移除后指南针失效。'}));
  }
  draw();
};
