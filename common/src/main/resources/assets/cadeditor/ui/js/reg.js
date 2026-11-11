/* 实时注册表（宿主推送，见 docs/registry-contract.md）：附魔、状态效果、音效等一律从游戏当前世界的注册表来，
   没有宿主（浏览器 / 文件夹预览）时才退回 data.js 里的内置数据，并在界面上标明。 */
/* Scoped entity transport. Consumers only observe complete responses. */
var RegWire = {
  pending: Object.create(null), active: Object.create(null), reserved: 0, sequence: 0,
  nonce: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
  entity: function (name) { return /^(entity_info(?::|$)|entity_schema(?::|$)|entity_base_attributes$|equipment_slot_groups$|spawner_info$)/.test(name); },
  reset: function () {
    Object.keys(this.pending).forEach(function (k) { clearTimeout(RegWire.pending[k].timer); });
    this.pending = Object.create(null); this.active = Object.create(null); this.reserved = 0;
  },
  finish: function (id) {
    var p = this.pending[id]; if (!p) return;
    clearTimeout(p.timer); delete this.pending[id];
    if (p.transfer && this.active[p.transfer]) { this.reserved -= this.active[p.transfer].size; delete this.active[p.transfer]; }
  },
  fail: function (id, reason) {
    var p = this.pending[id]; if (!p) return;
    var error = '实体数据传输失败：' + reason;
    if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.fragments', new Error(error + ' name=' + p.name + ' id=' + (p.id || '') + ' requestId=' + id + ' transfer=' + (p.transfer || 'none')));
    // Before the first frame there is no host counter; never invent one or reuse the world epoch.
    try { Reg.ingest('registry.' + p.name, {version:1, name:p.name, id:p.id, requestId:id, generation:p.generation, worldGeneration:p.world, entries:[], offset:0, total:0, done:true, error:error}); }
    finally { this.finish(id); }
  },
  request: function (name, id) {
    var token = this.nonce + '-' + (++this.sequence), world = Reg.meta && String(Reg.meta.generation);
    var p = this.pending[token] = { name:name, id:id, world:world };
    if (Object.keys(this.pending).length > 64) { this.fail(token, '并发请求超过64'); return; }
    p.timer = setTimeout(function () { RegWire.fail(token, '30秒内未收到完整响应（可能缺少分片）'); }, 30000);
    var request = {name:name, requestId:token}; if (id !== undefined) request.id = id;
    try { oriel.send('registry', request); } catch (e) { this.fail(token, String(e.message || e)); }
  },
  checksum: function (s) { var h=0x811c9dc5; for(var i=0;i<s.length;i++) h=Math.imul(h ^ s.charCodeAt(i),0x01000193); return ('00000000'+(h>>>0).toString(16)).slice(-8); },
  signature: function (v, frame) {
    var skip = frame ? ['version','encoding','transferId','responseChars','checksum','fragmentIndex','fragmentCount','fragmentOffset','payload','entries'] : ['version','entries'];
    return JSON.stringify(Object.keys(v).filter(function(k){return skip.indexOf(k)<0;}).sort().map(function(k){return [k,v[k]];}));
  },
  accept: function (key, v) {
    var name=key.slice(9), token=v.requestId, p=typeof token==='string' && this.pending[token];
    /* Legacy v1 hosts omit requestId. Modern root replays must match this Document's request. */
    if (v.version !== 2) {
      if (token !== undefined) { if (!p || p.name!==name || p.id!==v.id || p.world!==String(v.worldGeneration)) return null; if(v.done) this.finish(token); }
      else if (v.done) Object.keys(this.pending).forEach(function (id) { var q=RegWire.pending[id]; if(q.name===name && q.id===v.id) RegWire.finish(id); });
      return v;
    }
    if (!p) return null;
    try {
      function integer(n,min,max){return typeof n==='number' && Number.isInteger(n) && n>=min && n<=max;}
      if (!Reg.meta || !this.entity(name) || v.name!==name || p.name!==name || p.id!==v.id || p.world!==String(v.worldGeneration)) throw Error('请求/实体/世界关联不符');
      if (v.encoding!=='registry-json-fragments-v1' || typeof v.transferId!=='string' || !/^[A-Za-z0-9_-]{1,80}$/.test(v.transferId) || typeof v.generation!=='string' || v.generation.length>80) throw Error('分片协议或批次标识无效');
      if (!integer(v.responseChars,1,2097152) || !integer(v.fragmentCount,1,256) || !integer(v.fragmentIndex,0,v.fragmentCount-1) || !integer(v.fragmentOffset,0,v.responseChars-1) || !integer(v.total,0,16384) || v.offset!==0 || v.done!==true || !Array.isArray(v.entries) || v.entries.length) throw Error('分片长度/数量/信封无效');
      if (typeof v.payload!=='string' || !v.payload.length || v.fragmentOffset+v.payload.length>v.responseChars || typeof v.checksum!=='string' || !/^[0-9a-f]{8}$/.test(v.checksum) || JSON.stringify(v).length>24000) throw Error('分片内容或页长无效');
      if (p.transfer && p.transfer!==v.transferId) throw Error('同一请求收到不同传输批次');
      var a=this.active[v.transferId], sig=this.signature(v,true);
      if (!a) {
        if (Object.keys(this.active).length>=8 || this.reserved+v.responseChars>4194304) throw Error('分片缓存超过8批或4Mi字符预算');
        p.transfer=v.transferId; p.generation=v.generation;
        a=this.active[v.transferId]={token:token, size:v.responseChars, count:v.fragmentCount, checksum:v.checksum, signature:sig, parts:[], offsets:[], received:0, chars:0, wire:0}; this.reserved+=a.size;
      }
      if (a.token!==token || a.size!==v.responseChars || a.count!==v.fragmentCount || a.checksum!==v.checksum || a.signature!==sig) throw Error('同批分片信封冲突');
      var i=v.fragmentIndex;
      if (a.parts[i]!==undefined) { if(a.parts[i]!==v.payload || a.offsets[i]!==v.fragmentOffset) throw Error('重复分片冲突'); return null; }
      if(a.chars+v.payload.length>a.size || a.wire+JSON.stringify(v).length>4194304) throw Error('分片总长度超限');
      a.parts[i]=v.payload; a.offsets[i]=v.fragmentOffset; a.chars+=v.payload.length; a.wire+=JSON.stringify(v).length; a.received++;
      if (a.received!==a.count) return null;
      var offset=0; for(i=0;i<a.count;i++){if(a.offsets[i]!==offset)throw Error('分片偏移不连续');offset+=a.parts[i].length;}
      var text=a.parts.join(''); if(offset!==a.size || this.checksum(text)!==a.checksum) throw Error('完整长度或校验和不符');
      var out=JSON.parse(text);
      if(!out || out.version!==1 || this.signature(out,false)!==a.signature || !Array.isArray(out.entries) || out.entries.length!==out.total) throw Error('完整响应与分片信封不符');
      this.finish(token); return out;
    } catch(e) { this.fail(token, String(e.message || e)); return null; }
  }
};
var Reg = {
  meta: null, kinds: {}, subs: [], cache: {},
  /* RegistryBridge uses the world epoch for catalog/default/schema pages. EntityRegistryChannel
     and TranslateChannel have separate counters; never compare those as world epochs.
     generation-less objects are legacy/preview fixtures, not an alternate production epoch. */
  acceptsGeneration: function (key, val) {
    if (!this.meta || !val) return true;
    /* Explicit host capability preserves compatibility with legacy independent counters. */
    if (this.meta.entity_world_scope === true && /^(registry\.entity_info(?::|$)|registry\.entity_schema(?::|$)|registry\.entity_base_attributes$|registry\.equipment_slot_groups$|registry\.spawner_info$)/.test(key)) {
      return val.worldGeneration !== undefined && String(this.meta.generation) === String(val.worldGeneration);
    }
    var current = this.meta.generation, incoming = val.worldGeneration !== undefined ? val.worldGeneration : val.generation;
    if (current === undefined || incoming === undefined) return true;
    if (val.worldGeneration === undefined && this.entityGeneration(key, incoming)) return true;
    return String(current) === String(incoming);
  },
  entityGeneration: function (key, generation) {
    return /^registry\.entity_schema(?::|$)/.test(key) ? /^entity-schema-\d+$/.test(String(generation))
      : /^(registry\.entity_info(?::|$)|registry\.entity_base_attributes$|registry\.equipment_slot_groups$|registry\.spawner_info$)/.test(key) && /^entity-\d+$/.test(String(generation));
  },
  clearRangeFacts: function () {
    Object.keys(this.numericFacts).forEach(function (id) { clearTimeout(Reg.numericFacts[id].timer); }); this.numericFacts = {};
    Object.keys(this.formFacts).forEach(function (id) { clearTimeout(Reg.formFacts[id].timer); }); this.formFacts = {};
    var seen = new WeakSet();
    function clear(sc) {
      if (!sc || typeof sc !== 'object' || seen.has(sc)) return; seen.add(sc);
      /* Ranges are facts of the last Codec, not an initializer for the next world.
         Preserve numeric serialization metadata and every existing form/field. */
      if (sc.live && (sc.t === 'num' || sc.t === 'int')) { delete sc.min; delete sc.max; delete sc.minEx; delete sc.live; delete sc.allowNaN; delete sc.allowPositiveInfinity; delete sc.allowNegativeInfinity; }
      (sc.f || []).forEach(function (f) { clear(f.s); }); (sc.a || []).forEach(clear);
      Object.keys(sc.br || {}).forEach(function (k) { clear(sc.br[k]); }); clear(sc.i); clear(sc.v);
    }
    Object.keys(CIDX).forEach(function (cid) { clear(CIDX[cid].schema); });
  },
  ingest: function (key, val) {
    if (key === 'registry.translate') { if (typeof Tr !== 'undefined') Tr.accept(val); return; }
    if (key === 'vault.result') { if (typeof Vault !== 'undefined') Vault.receive(val); return; }
    if (key === 'tooltip.result') { if (typeof HostTip !== 'undefined') HostTip.receive(val); return; }
    if (key === 'search.result') { if (typeof HostSearch !== 'undefined') HostSearch.receive(val); return; }
    if (key === 'component_validate.result') { if (typeof Valid !== 'undefined') Valid.receiveHost(val); return; }
    if (key === 'validate_component.result') { if (typeof Valid !== 'undefined') Valid.receive(val); return; }
    if (typeof key !== 'string' || key.indexOf('registry.') !== 0) return;
    if (key === 'registry.client_features') { if (val && val.accepted) this.features = val.accepted; if (val && val.lazy) this.setLazy(val.lazy); this.fire(); return; }
    if (key === 'registry.meta') {
      if (!val || typeof val !== 'object') return;
      /* Official epochs are monotonic decimal strings. A retained root-bag meta must not
         move a live document back to an earlier world (do not coerce longs to Number). */
      var oldGen = this.meta && String(this.meta.generation), newGen = String(val.generation);
      if (/^\d+$/.test(oldGen) && /^\d+$/.test(newGen) && (newGen.length < oldGen.length || (newGen.length === oldGen.length && newGen < oldGen))) return;
      var entityReset = !this.meta || oldGen !== newGen || this.meta.entity_world_scope !== val.entity_world_scope;
      if (entityReset) {
        RegWire.reset(); if (typeof Tr !== 'undefined') Tr.reset(); this.eschema = {}; this.esAsk = {}; this.esAt = {};
        this.ebase = {}; this.ebAsk = {}; this.einfo = {}; this.eiAsk = {}; this.eggMap = null; this.eggAsk = false;
        delete this.kinds.equipment_slot_groups; delete this.kinds.spawner_info;
        delete this.tblAsk.equipment_slot_groups; delete this.tblAsk.spawner_info;
      }
      if (this.meta && val && this.meta.generation !== val.generation) {
        this.clearRangeFacts();
        this.kinds = {}; this.defs = {}; this.defAsk = {}; this.imeta = {}; this.imAsk = {}; this.imAll = false;
        this.rel = {}; this.relAsk = {}; this.asked = {}; this.tblAsk = {}; this.rows = {}; this.lookAsked = {}; this.lookPending = {}; this.lazy = {};
        this.bprops = {}; this.bpAsk = {}; this.bpAll = null; this.tags = {}; this.tagAsk = {}; this.hints = {}; this.hintAsk = {};
        this.ebase = {}; this.ebAsk = {}; this.einfo = {}; this.eiAsk = {}; this.eggMap = null; this.eggAsk = false; this.csAsk = false; this.fieldDefaults = new WeakMap(); this.codecDefaults = {}; this.formEnums = new WeakMap(); this.formVariants = new WeakMap();
      }
      this.meta = val; this.cache = {}; if (val && val.lazy) this.setLazy(val.lazy); this.askSchema(); this.fire(); return;
    }
    if (!val || typeof val !== 'object') return;
    if (!this.acceptsGeneration(key, val)) return;
    if (RegWire.entity(key.substring(9))) { val = RegWire.accept(key, val); if (!val) return; }
    else if (val.version === 2) return;
    if (key === 'registry.relation') { this.ingestRel(val); return; }
    var kind = key.substring(9), k = this.kinds[kind];
    if (kind === 'item_defaults_one') { this.ingestDef(val); return; }
    if (kind === 'item_model_hints') { this.ingestHints(val); return; }
    if (kind === 'block_properties') { this.ingestBP(val); return; }
    if (kind === 'item_meta_one' || kind === 'item_meta') { this.ingestIM(kind, val); return; }
    if (kind === 'entity_base_attributes') { this.ingestEB(val); return; }
    if (kind === 'entity_info' || kind.indexOf('entity_info:') === 0) { this.ingestEI(val); return; }
    if (kind === 'component_schema' || kind.indexOf('component_schema:') === 0) {
      if (val.id) { var factId = this.full(val.id), pending = this.numericFacts[factId]; if (pending) clearTimeout(pending.timer); this.numericFacts[factId] = {pending:false,error:val.error ? String(val.error) : null}; }
      if (!val.rangesOnly) {
        var formIds = (val.entries || []).filter(function (e) { return Array.isArray(e.fields); }).map(function (e) { return Reg.full(e.id); });
        if (val.id && val.error) formIds.push(this.full(val.id));
        formIds.forEach(function (id) { var st = Reg.formFacts[id]; if (st) clearTimeout(st.timer); Reg.formFacts[id] = {pending:false,error:val.error ? String(val.error) : null}; });
      }
      this.ingestSchemaDefaults(val.entries); if (typeof applyLiveRanges === 'function') applyLiveRanges(val.entries); this.fire('component_schema'); return;
    }
    if (kind === 'entity_schema' || kind.indexOf('entity_schema:') === 0) { this.ingestES(val); return; }
    if (kind.indexOf('tag:') === 0) { this.ingestTag(kind, val); return; }
    if (!k || k.gen !== val.generation) { k = this.kinds[kind] = { gen: val.generation, entries: [], total: val.total || 0, done: false, name: val.name }; delete this.cache[kind]; }
    delete this.cache['opt:' + kind];
    delete this.cache[kind];
    var off = val.offset || 0, ents = val.entries || [];
    for (var i = 0; i < ents.length; i++) k.entries[off + i] = ents[i];
    k.total = val.total || k.total; if (val.done) { k.done = true; delete this.cache[kind]; }
    if (kind === 'data_component_types' && typeof registerLiveComps === 'function') registerLiveComps(val.entries);
    if (val.availability === 'unavailable') k.unavail = String(val.reason || '服务器没有向客户端同步完整列表');   /* 远程服务器上的战利品表 / 配方等：空是“拿不到”，不是“没有” */
    if (val.error) k.error = String(val.error);
    this.fire(kind);
  },
  /* 物品原型默认组件：按需向宿主要；未到不是空原型，也不能用预览样例替代。 */
  defs: {}, defAsk: {},
  ingestDef: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.defs[e.id] = e; });
    if (v.id && !ents.length) Reg.defs[v.id] = false;
    this.fire('item_defaults_one');
  },
  defaultsOf: function (full) {
    full = this.full(full);
    if (!this.live()) return null;
    var e = this.defs[full];
    if (e) return e.comps || null;
    if (e === undefined && !this.defAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.defAsk[full] = 1; oriel.send('registry', { name: 'item_defaults_one', id: full }); }
    return null;
  },
  /* 物品模型定义里实际用到的自定义模型数据（哪个下标、什么类型、有哪些取值） */
  hints: {}, hintAsk: {},
  ingestHints: function (v) {
    var id = v.id; if (!id) return;
    var cur = this.hints[id]; if (!cur || cur.gen !== v.generation) cur = this.hints[id] = { gen: v.generation, list: [], done: false, error: null };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) cur.list[off + i] = ents[i];
    if (v.error) cur.error = v.error;
    if (v.done) { cur.done = true; this.fire('item_model_hints'); }
  },
  hintsOf: function (id) {
    if (!this.live()) return null;
    var h0 = this.hints[id];
    if (h0 && h0.done) return h0.list.filter(Boolean);
    if (!h0 && !this.hintAsk[id] && typeof oriel !== 'undefined' && oriel.send) { this.hintAsk[id] = 1; oriel.send('registry', { name: 'item_model_hints', id: id }); }
    return null;
  },
  /* 方块属性表（block_properties）：单个方块按需请求；成员很多的标签一次取全表。未知方块 = false，还在等 = null */
  bprops: {}, bpAsk: {}, bpAll: null,
  ingestBP: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.bprops[e.id] = e.properties || {}; });
    if (v.id && !ents.length) Reg.bprops[this.full(v.id)] = false;
    if (!v.id && v.done) this.bpAll = { done: true };
    this.fire('block_properties');
  },
  blockProps: function (full, bulk) {
    if (!this.live()) return false;
    full = this.full(full);
    var p = this.bprops[full];
    if (p !== undefined) return p;
    if (bulk) return this.bpAll && this.bpAll.done ? false : null;
    if (!this.bpAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.bpAsk[full] = 1; oriel.send('registry', { name: 'block_properties', id: full }); }
    return null;
  },
  blockPropsAll: function () {
    if (!this.live()) return true;
    if (this.bpAll && this.bpAll.done) return true;
    if (!this.bpAll && typeof oriel !== 'undefined' && oriel.send) { this.bpAll = { done: false }; oriel.send('registry', { name: 'block_properties' }); }
    return false;
  },
  /* 标签成员（tag:<注册表>）：id 不带 #；回来前返回 null */
  tags: {}, tagAsk: {},
  ingestTag: function (kind, v) {
    if (!v.id) return;
    var k = kind + '|' + this.full(v.id), cur = this.tags[k];
    if (!cur || cur.gen !== v.generation) cur = this.tags[k] = { gen: v.generation, list: [], done: false };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) cur.list[off + i] = ents[i];
    if (v.done) { cur.done = true; this.fire(kind); }
  },
  tagMembers: function (regKind, id) {
    var kind = 'tag:' + regKind, full = this.full(id), k = kind + '|' + full, cur = this.tags[k];
    if (cur && cur.done) return cur.list.filter(Boolean);
    if (!this.live()) return [];
    if (!this.tagAsk[k] && typeof oriel !== 'undefined' && oriel.send) { this.tagAsk[k] = 1; oriel.send('registry', { name: kind, id: full }); }
    return null;
  },
  /* 实体信息（entity_info）：默认属性、刷怪蛋、装备槽、变种来源、默认 NBT 模板。按需请求；未知 = false，还在等 = null */
  einfo: {}, eiAsk: {},
  ingestEI: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.einfo[e.id] = e; });
    if (v.id && !ents.length) Reg.einfo[this.full(v.id)] = false;
    this.fire('entity_info');
  },
  entityInfo: function (full) {
    if (!this.live()) return false;
    full = this.full(full);
    var p = this.einfo[full];
    if (p !== undefined) return p;
    if (!this.eiAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.eiAsk[full] = 1; RegWire.request('entity_info', full); }
    return null;
  },
  /* 实体能改什么（entity_schema）：变种、常用开关、装备槽。按需请求；离线 / 未知实体 = false，还在等 = null，
     工厂不可用 = {available:false}。世界或语言换了（registry.meta 重新推送）就重新要 */
  eschema: {}, esAsk: {}, esAt: {},
  ingestES: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { if (e && e.id) Reg.eschema[Reg.full(e.id)] = e; });
    if (v.id && !ents.length) Reg.eschema[this.full(v.id)] = v.error ? { id: this.full(v.id), available: false, error: String(v.error) } : false;
    this.fire('entity_schema');
  },
  entitySchema: function (full) {
    full = this.full(full);
    /* 有宿主但注册表还没到：算「正在读取」，等 registry.meta 来了再重画并发请求；只有根本没有宿主（浏览器预览）才算没连接 */
    if (!this.live()) { if (typeof oriel !== 'undefined' && oriel.send) { if (!this.esAt[full]) this.esAt[full] = Date.now(); return null; } return false; }
    var p = this.eschema[full];
    if (p !== undefined) return p;
    if (!this.esAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.esAsk[full] = 1; if (!this.esAt[full]) this.esAt[full] = Date.now(); RegWire.request('entity_schema', full); }
    return null;
  },
  /* 物品元信息（item_meta_one / item_meta）：武器 / 工具 / 食物 / 盔甲槽 / 容器格数 / 收纳袋容量 / 刷怪蛋实体 等事实。
     单件按需请求；全表到齐后没有的就是未知。未到 = null，未知 = false */
  imeta: {}, imAsk: {}, imAll: false,
  ingestIM: function (kind, v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.imeta[e.id] = e; });
    this.eggMap = null;
    if (kind === 'item_meta_one' && v.id && !ents.length) this.imeta[this.full(v.id)] = false;
    if (kind === 'item_meta' && v.done) this.imAll = true;
    this.fire(kind);
  },
  /* 实体 → 它的刷怪蛋物品（来自 item_meta.spawn_egg_entity，含模组蛋）；全表只请求一次，没到 / 没有蛋 = null */
  eggMap: null, eggAsk: false,
  eggFor: function (entity) {
    if (!this.live()) return null;
    if (!this.eggMap) {
      if (!this.eggAsk) { this.eggAsk = true; this.request('item_meta'); }
      var m = {}, k, e; for (k in this.imeta) { e = this.imeta[k]; if (e && e.spawn_egg_entity && !m[this.full(e.spawn_egg_entity)]) m[this.full(e.spawn_egg_entity)] = e.id; }
      this.eggMap = m;
    }
    return this.eggMap[this.full(entity)] || null;
  },
  itemMeta: function (full) {
    if (!this.live()) return false;
    full = this.full(full);
    var m = this.imeta[full];
    if (m !== undefined) return m;
    if (this.imAll) return false;
    if (!this.imAsk[full] && typeof oriel !== 'undefined' && oriel.send) { this.imAsk[full] = 1; oriel.send('registry', { name: 'item_meta_one', id: full }); }
    return null;
  },
  /* 整张表按需取（枚举、装备槽组……）：到齐返回条目数组，没到返回 null 并只请求一次 */
  tblAsk: {},
  table: function (name) {
    var k = this.kinds[name];
    if (k && k.done) return k.entries.filter(Boolean);
    if (!this.live()) return null;
    if (!this.tblAsk[name]) { this.tblAsk[name] = 1; this.request(name); }
    return null;
  },
  /* 实体基础属性（entity_base_attributes）：玩家的攻击伤害 / 攻击速度基础值等，替换手写的 1 和 4。取不到（离线 / 还没到）用 dflt */
  ebase: {}, ebAsk: {},
  ingestEB: function (v) {
    var ents = v.entries || [];
    ents.forEach(function (e) { Reg.ebase[e.id] = e.attributes || {}; });
    if (v.id && !ents.length) this.ebase[this.full(v.id)] = false;
    this.fire('entity_base_attributes');
  },
  baseAttr: function (entity, attr, dflt) {
    if (!this.live()) return dflt;
    entity = this.full(entity);
    var m = this.ebase[entity];
    if (m === undefined && !this.ebAsk[entity] && typeof oriel !== 'undefined' && oriel.send) { this.ebAsk[entity] = 1; RegWire.request('entity_base_attributes', entity); }
    var v = m ? m[this.full(attr)] : undefined;
    return typeof v === 'number' ? v : dflt;
  },
  /* 宿主搜索（search 消息）里这类候选对应的 kind：和 options() 用同一套映射 */
  hostKind: function (reg) { return this.KIND[reg] || (this.isDirect(reg) ? reg : 'minecraft:' + reg); },
  /* 请求名就是它自己、不带 minecraft: 前缀的：枚举 / 标签（带冒号）和资源 ID 类（装备外观、提示框样式、物品模型、遮罩与皮肤贴图） */
  DIRECT: { equipment_asset: 1, tooltip_style: 1, item_model: 1, camera_overlay: 1, profile_texture: 1, profile_cape: 1, profile_elytra: 1 },
  isDirect: function (reg) { return reg.indexOf(':') > 0 || this.DIRECT[reg] === 1; },
  /* 这类注册表在当前连接里是否“拿不到完整列表”（远程服务器）：返回原因文字，否则 null。拿不到时必须保留手动输入 */
  unavailable: function (reg) {
    var kind = this.KIND[reg] || (this.isDirect(reg) ? reg : 'minecraft:' + reg), k = this.kinds[kind];
    return k && k.unavail ? k.unavail : null;
  },
  tagsOf: function (full) { var e = this.defs[full]; return e && e.tags ? e.tags : null; },
  /* 大数组（适用物品/互斥附魔太多）被宿主改为延迟加载：条目带 xxx_ref，按需请求，分页回来后合并 */
  rel: {}, relAsk: {},
  ingestRel: function (v) {
    if (!v.id || !v.field) return;
    var k = v.id + '|' + v.field, r = this.rel[k];
    if (!r || r.gen !== v.generation) r = this.rel[k] = { gen: v.generation, list: [], done: false };
    var off = v.offset || 0, ents = v.entries || [];
    for (var i = 0; i < ents.length; i++) r.list[off + i] = ents[i];
    if (v.error || v.availability === 'unavailable') r.error = String(v.error || v.reason || '关系数据不可用');
    if (v.done) { r.done = true; delete this.cache.enchantments; this.fire('enchantments'); }
  },
  relOf: function (e, field) {
    var ref = e[field + '_ref']; if (!ref) return e[field] || [];
    var k = ref.id + '|' + ref.field, r = this.rel[k];
    if (r && r.done) return r.error ? null : r.list;
    if (!this.relAsk[k] && typeof oriel !== 'undefined' && oriel.send) { this.relAsk[k] = 1; oriel.send('registry', { name: ref.name, id: ref.id, field: ref.field }); }
    return null;   // 还没回来：当作未知，不是「没有」
  },
  /* 通知订阅者：同一批到达的多页合并成一次（宿主一页一页推送，不合并的话每页都会重建列表、重画界面，既闪又会触发引擎的停页保护）。
     订阅者收到 (kind, kinds)：kind 是这一批里第一个种类，kinds 是这一批出现过的全部种类。 */
  pendingKinds: [], fireTimer: null,
  fire: function (kind) {
    if (kind !== undefined && this.pendingKinds.indexOf(kind) < 0) this.pendingKinds.push(kind);
    if (this.fireTimer !== null) return;
    if (typeof setTimeout !== 'function') { this.flush(); return; }
    this.fireTimer = setTimeout(function () { Reg.fireTimer = null; Reg.flush(); }, 160);
  },
  flush: function () {
    var kinds = this.pendingKinds; this.pendingKinds = [];
    try { syncEnums(); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.syncEnums', e); }
    this.subs.slice().forEach(function (f) { try { f(kinds[0], kinds); } catch (e) { if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.subscriber', e); } });
  },
  on: function (f) { this.subs.push(f); return function () { Reg.subs = Reg.subs.filter(function (x) { return x !== f; }); }; },
  attach: function () {
    if (typeof oriel === 'undefined') return;
    /* 告诉宿主：这个页面会用搜索 / 精确查询取大目录，不必再把物品、方块、音效、标签等整张表推过来（lazy-catalog-v1）。必须是第一条 registry 消息 */
    try { if (oriel.send) oriel.send('registry', { name: 'client_features', features: ['lazy-catalog-v1'] }); } catch (e) {}
    /* Root bags retain old keys; establish the current epoch before replaying any facts. */
    var d = oriel.data || {}, touched = Object.create(null);
    // Listen first. A fresh reply must win over the retained root snapshot.
    if (oriel.on) oriel.on('patch', function (p) { if (p && p.key) { touched[p.key] = true; Reg.ingest(p.key, p.value); } });
    if (d['registry.meta']) this.ingest('registry.meta', d['registry.meta']);
    var replay = Object.keys(d).filter(function (key) { return key !== 'registry.meta' && key.indexOf('registry.') === 0; }).map(function (key) { return {key:key,value:d[key]}; });
    var index = 0;
    function next() {
      if (index >= replay.length) return;
      var row = replay[index++];
      try {
        if (!touched[row.key]) {
          if (typeof EditorDiag !== 'undefined') EditorDiag.phase('registry.replay.' + row.key, function () { Reg.ingest(row.key, row.value); });
          else Reg.ingest(row.key, row.value);
        }
      } finally { if (index < replay.length) setTimeout(next, 20); }
    }
    if (replay.length) setTimeout(next, 20);
  },
  /* 取任意注册表（含模组自己的）：页面发请求，宿主回 registry.<name> */
  request: function (name) { if (typeof oriel !== 'undefined' && oriel.send && this.meta) { if (RegWire.entity(name)) RegWire.request(name); else oriel.send('registry', { name: name }); } },
  live: function () { return !!this.meta; },
  /* 无桥接的浏览器才是样例预览；有宿主但尚无 meta 仍是正在读取。 */
  preview: function () { return (typeof window !== 'undefined' && window.EDITOR_PREVIEW === true) || typeof oriel === 'undefined' || typeof oriel.send !== 'function'; },
  fieldDefaults: new WeakMap(),
  formEnums: new WeakMap(),
  formVariants: new WeakMap(),
  variantOptions: function (sc) { return (this.preview() ? Object.keys(sc.br || {}) : this.formVariants.get(sc) || []).map(function (v) { return { v: v, label: v }; }); },
  schemaEnumOptions: function (sc) { var values = this.preview() ? sc.en || [] : this.formEnums.get(sc) || []; return values.map(function (v) { return { v: v, label: v }; }); },
  enumOptions: function (name, labels) {
    var live = this.options('enum:' + name);
    if (!live) return this.preview() ? labels : [];
    return live.map(function (e) {
      var local = (labels || []).filter(function (l) { return l.v === e.v; })[0];
      var key = typeof Labels.enumKey === 'function' ? Labels.enumKey(name, e.v) : null, translated = key && typeof Tr !== 'undefined' ? Tr.get(key) : null;
      // A real game translation must not be replaced by a handwritten label.
      var nativeName = e.label && e.label !== e.v ? e.label : null;
      return Object.assign({}, local || {}, e, {label:translated || nativeName || (local && local.label) || e.v});
    });
  },
  codecOptions: function (cid, key, labels) {
    var c = CIDX[shortId(cid)], f = c && c.schema && (c.schema.f || []).filter(function (f) { return f.k === key; })[0];
    var entries = this.preview() ? labels : (f ? this.schemaEnumOptions(f.s) : []);
    return entries.map(function (e) { var label = (labels || []).filter(function (l) { return l.v === e.v; })[0]; return { v: e.v, label: label ? label.label : e.label }; });
  },
  codecDefaults: {},
  codecDefault: function (cid, key, preview) { if (this.preview()) return preview; var m = this.codecDefaults[this.full(cid)]; return m && Object.prototype.hasOwnProperty.call(m, '$.' + key) ? clone(m['$.' + key]) : undefined; },
  fieldDefault: function (f) { var live = this.fieldDefaults.get(f); return this.preview() ? f.df : (live && live.known ? live.value : undefined); },
  fieldDefaultReady: function (f) { return this.preview() || f.df === undefined || !!this.fieldDefaults.get(f); },
  formFacts: {},
  formStatus: function (cid) {
    var id = this.full(cid), st = this.formFacts[id]; if (st) return st;
    st = this.formFacts[id] = {pending:!this.preview(),error:null};
    if (!st.pending) return st;
    try {
      if (oriel.send('registry', {name:'component_schema:' + id}) === false) throw new Error('宿主未接受默认值请求');
      st.timer = setTimeout(function () { if (Reg.formFacts[id] !== st || !st.pending) return; st.pending = false; st.error = '默认值读取超时'; if (typeof EditorDiag !== 'undefined') EditorDiag.warn('registry.defaults.timeout', id); Reg.fire('component_schema'); }, 10000);
    } catch (e) { st.pending = false; st.error = String(e.message || e); if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.defaults.request', e); }
    return st;
  },
  /* Align only existing form paths with actual Codec optional-field defaults. Prototype examples are not defaults. */
  ingestSchemaDefaults: function (entries) {
    (entries || []).forEach(function (entry) {
      var c = CIDX[shortId(entry.id || '')]; if (!c || !c.schema || !Array.isArray(entry.fields)) return;
      var paths = {};
      function collect(n) { if (!n || typeof n !== 'object') return; if (n.path) (paths[n.path] || (paths[n.path] = [])).push(n); (n.fields || []).forEach(collect); if (n.element) collect(n.element); (n.alternatives || []).forEach(collect); (n.variants || []).forEach(function (v) { collect(v.schema || v); }); }
      (entry.fields || []).forEach(collect);
      var defaults = Reg.codecDefaults[Reg.full(entry.id)] = {};
      Object.keys(paths).forEach(function (p) { var matches = paths[p]; if (matches.every(function (m) { return JSON.stringify(m.default) === JSON.stringify(matches[0].default); }) && Object.prototype.hasOwnProperty.call(matches[0], 'default')) defaults[p] = clone(matches[0].default); });
      function bind(sc, path) {
        if (!sc) return;
        var variants = (paths[path] || []).filter(function (n) { return n.kind === 'variants' && Array.isArray(n.variants); });
        if (variants.length === 1) Reg.formVariants.set(sc, variants[0].variants.map(function (v) { return v.discriminator_value; }).filter(function (v) { return typeof v === 'string'; }));
        var enums = (paths[path] || []).filter(function (n) { return n.kind === 'enum' && Array.isArray(n.values); });
        if (enums.length && enums.every(function (n) { return JSON.stringify(n.values) === JSON.stringify(enums[0].values); })) Reg.formEnums.set(sc, enums[0].values.slice());
        (sc.f || []).forEach(function (f) {
          var p = path + '.' + f.k, matches = paths[p] || [];
          if (matches.length && matches.every(function (m) { return JSON.stringify(m.default) === JSON.stringify(matches[0].default) && m.default_absent === matches[0].default_absent; })) {
            var m = matches[0]; Reg.fieldDefaults.set(f, { known: true, value: Object.prototype.hasOwnProperty.call(m, 'default') ? clone(m.default) : undefined });
          }
          bind(f.s, p);
        });
        if (sc.i) bind(sc.i, path + '[]'); if (sc.v) bind(sc.v, path + '{value}');
        (sc.a || []).forEach(function (a) { bind(a, path); }); if (sc.br) Object.keys(sc.br).forEach(function (k) { bind(sc.br[k], path); });
      }
      bind(c.schema, '$');
    });
  },
  /* 组件的数值范围以游戏真实 Codec 为准（component_schema 的 ranges_for_ui），到了就覆盖内置表；没有宿主时用内置范围 */
  askSchema: function () {
    if (this.csAsk || typeof oriel === 'undefined' || !oriel.send) return;
    this.csAsk = 1;
    // The all-components index is slow and one oversized row can fail that job.
    // Quick damage controls need their own actual Codec facts, independently.
    try { this.numericStatus('attribute_modifiers'); oriel.send('registry', { name: 'component_schema' }); }
    catch (e) { this.csAsk = false; if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.component_schema.request', e); }
  },
  numericFacts: {},
  numericStatus: function (cid) {
    var id = this.full(cid), st = this.numericFacts[id]; if (st) return st;
    st = this.numericFacts[id] = {pending:true,error:null};
    if (this.preview()) { st.pending = false; return st; }
    try {
      if (oriel.send('registry', {name:'component_schema:' + id,rangesOnly:true}) === false) throw new Error('宿主未接受字段信息请求');
      st.timer = setTimeout(function () { if (Reg.numericFacts[id] !== st || !st.pending) return; st.pending = false; st.error = '读取字段信息超时；应用时仍由游戏校验'; if (typeof EditorDiag !== 'undefined') EditorDiag.warn('registry.numeric.timeout', id); Reg.fire('component_schema'); }, 10000);
    } catch (e) { st.pending = false; st.error = String(e.message || e); if (typeof EditorDiag !== 'undefined') EditorDiag.error('registry.numeric.request', e); }
    return st;
  },
  has: function (kind) { if (this.lazy[kind] !== undefined) return true; var k = this.kinds[kind]; return !!(k && k.entries.length); },
  list: function (kind) { var k = this.kinds[kind]; return k ? k.entries.filter(Boolean) : null; },
  full: function (id) { id = String(id || ''); return id.indexOf(':') < 0 ? 'minecraft:' + id : id; },
  isMod: function (full) { return full.indexOf('minecraft:') !== 0; },

  /* ---- 归一化视图（宿主只用实时数据；无桥接/显式预览才用样例）---- */
  enchants: function () {
    if (this.cache.enchantments) return this.cache.enchantments;
    var live = this.list('enchantments'), out;
    if (!live && !this.preview()) this.table('enchantments');
    if (live) out = live.map(function (e) {
      var excl = Reg.relOf(e, 'exclusive'), supported = Reg.relOf(e, 'supported');
      return { full: e.id, name: e.name || e.id, desc: e.desc || '', max: typeof e.max_level === 'number' && e.max_level >= 1 ? e.max_level : null, excl: excl || [], exclusiveKnown: excl !== null && (e.exclusive !== undefined || !!e.exclusive_ref), supported: supported !== null && (e.supported !== undefined || !!e.supported_ref) ? setOf(supported) : null, primary: Reg.relOf(e, 'primary') || [], tags: e.tags || [], weight: e.weight, anvil: e.anvil_cost, live: true };
    });
    else out = (this.preview() ? EDATA.enchants || [] : []).map(function (e) {
      return { full: Reg.full(e.id), name: e.name, desc: e.desc || '', max: e.max, excl: (e.excl || []).map(Reg.full), exclusiveKnown: true, supported: setOf((e.items || []).map(Reg.full)), primary: [], tags: [], live: false };
    });
    /* 未到齐的目录/关系不能被缓存成最终结果。 */
    var k = this.kinds.enchantments;
    if (this.preview() || (k && k.done && out.every(function (e) { return e.exclusiveKnown && e.supported !== null; }))) this.cache.enchantments = out;
    return out;
  },
  effects: function () {
    if (this.cache.mob_effects) return this.cache.mob_effects;
    var live = this.list('mob_effects'), out;
    if (!live && !this.preview()) this.table('mob_effects');
    if (live) out = live.map(function (e) { return { full: e.id, name: e.name || e.id, cat: e.category || 'neutral', color: e.color, instant: !!e.instant, desc: '', live: true }; });
    else out = (this.preview() ? EDATA.effects || [] : []).map(function (e) { return { full: Reg.full(e.id), name: e.name, cat: e.kind === '正面' ? 'beneficial' : e.kind === '负面' ? 'harmful' : 'neutral', desc: e.desc || '', live: false }; });
    return (this.cache.mob_effects = out);
  },
  soundLabel: function (e) { return e.name && e.name !== e.id ? e.name : (e.subtitle || e.name || e.id); },
  sounds: function () {
    if (this.cache.sounds) return this.cache.sounds;
    var live = this.list('sounds'), out;
    if (live) out = live.map(function (e) { return { full: e.id, name: Reg.soundLabel(e), sub: e.subtitle || '', live: true }; });
    else out = (this.preview() ? [].concat(typeof SOUNDS !== 'undefined' ? SOUNDS : [], typeof EQ_SOUNDS !== 'undefined' ? EQ_SOUNDS : []) : []).map(function (s) { return { full: s.v, name: s.label, sub: '', live: false }; });
    var seen = {}; out = out.filter(function (s) { if (seen[s.full]) return false; seen[s.full] = 1; return true; });
    return (this.cache.sounds = out);
  },
  KIND: { item: 'items', enchantment: 'enchantments', attribute: 'attributes', mob_effect: 'mob_effects', sound_event: 'sounds', block: 'blocks', entity_type: 'entity_types', damage_type: 'damage_types', instrument: 'instruments', jukebox_song: 'jukebox_songs', trim_material: 'trim_materials', trim_pattern: 'trim_patterns', banner_pattern: 'banner_patterns', potion: 'potions', painting_variant: 'painting_variants', data_component_type: 'data_component_types' },
  /* 通用候选：{v,label,sub}；没推送过的注册表（战利品表等）第一次用到时按需请求 */
  rowToOpt: function (reg, e) { return { v: e.id, label: reg === 'sound_event' ? Reg.soundLabel(e) : ((reg === 'jukebox_song' && e.description) ? e.description : (e.name || e.id)), sub: e.id, n: e.count, rgb: e.rgb, sound: e.sound_event, len: e.length_in_seconds, frame: e.has_frame }; },
  options: function (reg) {
    var direct = this.isDirect(reg), kind = this.KIND[reg] || (direct ? reg : 'minecraft:' + reg), ck = 'opt:' + kind;
    if (this.lazyKind(reg)) return this.cachedOpts(reg);   /* 大目录不在页面里：只有已经查过 / 搜到过的行 */
    if (this.cache[ck]) return this.cache[ck];
    var l = this.list(kind);
    if (!l) { if (!this.asked) this.asked = {}; if (this.live() && !this.asked[kind]) { this.asked[kind] = 1; this.request(kind); } return null; }
    var out = l.map(function (e) { return Reg.rowToOpt(reg, e); });
    if (this.kinds[kind] && this.kinds[kind].done) this.cache[ck] = out;
    return out;
  },
  /* 属性自己的数值范围（游戏里 attribute 的 min/max）；没有就用 dflt */
  attrMax: function (id, dflt) { var l = this.list('attributes'), f = this.full(id); if (l) for (var i = 0; i < l.length; i++) if (l[i].id === f && typeof l[i].max === 'number') return l[i].max; return dflt; },
  nameOf2: function (reg, full) { var o = this.optionFor(reg, full); return o ? o.label : null; },
  /* 某个 ID 对应的候选行 {v,label,…}；大目录里没缓存的会在后台精确查询，到了会重画。没有 = null */
  optionFor: function (reg, full) {
    var f = this.full(full), lk = this.lazyKind(reg);
    if (lk) { var r = this.want(lk, f); return r ? this.rowToOpt(reg, r) : null; }
    var l = this.options(reg); if (!l) return null;
    for (var i = 0; i < l.length; i++) if (l[i].v === f) return l[i];
    return null;
  },
  /* true=存在，false=完整目录/精确查询证实不存在，null=尚未读取；不能把 null 报成非法 ID。 */
  entryState: function (reg, full) {
    var f = this.full(full), lk = this.lazyKind(reg);
    if (lk) { var row = this.want(lk, f); if (row) return true; return this.rows[lk] && this.rows[lk][f] === false ? false : null; }
    var kind = this.hostKind(reg), k = this.kinds[kind], l = this.options(reg);
    if (l && l.some(function (e) { return e.v === f || e.v === full; })) return true;
    return k && k.done && !k.unavail && !k.error ? false : null;
  },
  nameOf: function (kind, full) {
    if (kind === 'sounds' && this.lazyKind('sound_event')) { var so = this.optionFor('sound_event', full); return so ? so.label : null; }
    var fn = kind === 'enchantments' ? this.enchants : kind === 'mob_effects' ? this.effects : kind === 'sounds' ? this.sounds : null;
    if (!fn) return null;
    var list = fn.call(this), f = this.full(full);
    for (var i = 0; i < list.length; i++) if (list[i].full === f) return list[i].name;
    return null;
  },
  itemName: function (full) {
    if (this.lazyKind('item')) { var r = this.want(this.lazyKind('item'), this.full(full)); return r ? (r.name || r.id) : null; }
    if (!this.has('items')) return null;
    var m = this.cache.itemMap; if (!m) { m = this.cache.itemMap = {}; this.list('items').forEach(function (e) { m[e.id] = e.name || e.id; }); }
    return m[this.full(full)] || null;
  },
  hasItem: function (full) { return this.itemName(full) !== null; },
  enchant: function (full) { var f = this.full(full), l = this.enchants(); for (var i = 0; i < l.length; i++) if (l[i].full === f) return l[i]; return null; },
  enchantFits: function (e, item) { return e && e.supported !== null ? !!e.supported[this.full(item)] : null; },
  /* 互斥是双向判断；任一侧关系尚未读取时不能承诺相容。 */
  enchantConflict: function (a, b) {
    a = typeof a === 'string' ? this.enchant(a) : a; b = typeof b === 'string' ? this.enchant(b) : b;
    if (!a || !b) return null;
    if (a.excl.indexOf(b.full) >= 0 || b.excl.indexOf(a.full) >= 0) return true;
    return a.exclusiveKnown && b.exclusiveKnown ? false : null;
  }
};
/* 官方枚举值同步：界面里有中文说明/图标的手工表，只保留游戏里真实存在的值，游戏有而表里没有的值追加进来（原地修改，已有引用自动生效）。
   没有宿主时保持原表不动。 */
var ENUM_TABLES = [];
function regEnumTable(name, table, idOf, mk) { ENUM_TABLES.push({ name: name, table: table, orig: table.slice(), idOf: idOf, mk: mk }); }
function syncEnums() {
  ENUM_TABLES.forEach(function (t) {
    var live = Reg.options('enum:' + t.name); if (!live) return;
    var ids = {}; live.forEach(function (e) { ids[e.v] = e; });
    var out = t.orig.filter(function (x) { return ids[t.idOf(x)] || ids[Reg.full(t.idOf(x))]; });
    var have = {}; out.forEach(function (x) { have[t.idOf(x)] = 1; });
    live.forEach(function (e) { var k = e.v, sk = k.indexOf('minecraft:') === 0 && t.name !== 'consume_effect_type' ? k.substring(10) : k; if (!have[k] && !have[sk]) out.push(t.mk(sk, optLabel(e))); });
    t.table.length = 0; out.forEach(function (x) { t.table.push(x); });
  });
}
function setOf(arr) { var o = {}; (arr || []).forEach(function (x) { o[x] = 1; }); return o; }

/* 枚举字段 → 游戏里的枚举（enum:<名>）。候选以游戏为准；内置的 en 只是离线 / 数据没到之前的备用。
   这些都是 Java 枚举，写入值只能用条目的 id（不是 symbol）。 */
var LIVE_ENUM = { 'axolotl/variant': 'axolotl_variant', 'horse/variant': 'horse_variant', 'llama/variant': 'llama_variant', 'mooshroom/variant': 'mooshroom_variant', 'fox/variant': 'fox_variant', 'rabbit/variant': 'rabbit_variant', 'parrot/variant': 'parrot_variant', 'tropical_fish/pattern': 'tropical_fish_pattern', 'salmon/size': 'salmon_size', rarity: 'rarity' };
/* 返回 [{v,label}]，数据没到 / 离线 / 这个字段没有对应枚举时返回 null */
function liveEnumOptions(cid, path) {
  var name = cid && !path ? LIVE_ENUM[cid] : null;
  if (!name || typeof Reg === "undefined" || Reg.preview()) return null;
  var l = Reg.options('enum:' + name);
  if (!l) return [];
  return l.map(function (e) { return { v: e.v, label: e.label && e.label !== e.v ? e.label : e.v, title: e.v }; });
}
function liveEnumHas(cid, path, v) {
  var l = liveEnumOptions(cid, path);
  if (l) for (var i = 0; i < l.length; i++) if (l[i].v === v) return true;
  /* Nested Codec enums can add values beyond the bundled form vocabulary too. */
  var c = CIDX[shortId(cid || '')], nodes = [];
  if (!Reg.preview() && c && c.schema) {
    var toks = liveRangeTokens('$' + String(path || '').replace(/\[\d+\]/g, '[]'));
    function visit(sc, i) {
      if (!sc) return;
      if (sc.t === 'union') { sc.a.forEach(function (s) { visit(s, i); }); return; }
      if (sc.t === 'dunion') { Object.keys(sc.br).forEach(function (k) { visit(sc.br[k], i); }); return; }
      if (i === toks.length) { nodes.push(sc); return; }
      if (toks[i] === '[]' && sc.i) visit(sc.i, i + 1);
      else if (toks[i] === '{value}' && sc.v) visit(sc.v, i + 1);
      else (sc.f || []).forEach(function (f) { if (f.k === toks[i]) visit(f.s, i + 1); });
    }
    visit(c.schema, 0);
    for (var n = 0; n < nodes.length; n++) if ((Reg.formEnums.get(nodes[n]) || []).indexOf(v) >= 0) return true;
  }
  return false;
}

/* ---- 大目录（lazy-catalog-v1）：物品 / 方块 / 音效 / 标签 / 资源 ID 等不再整张推进页面 ----
   宿主在 registry.meta.lazy / registry.client_features 里列出哪些 kind 是“按需”的。页面里只缓存搜到过 / 精确查过的行；
   选择窗走 search，已选值的名字走 lookup（批量，后台，到了重画）。老宿主没有 lazy 字段，一切照旧。 */
Reg.lazy = {}; Reg.features = null; Reg.rows = {}; Reg.lookPending = {}; Reg.lookAsked = {}; Reg.lookTimer = null; Reg.lookBusy = false;
Reg.setLazy = function (m) { for (var k in m) this.lazy[k] = (m[k] && typeof m[k].count === 'number') ? m[k].count : 0; this.cache = {}; };
/* reg 别名 → 它在 lazy 表里的 kind；不是大目录返回 null */
Reg.lazyKind = function (reg) {
  var k = this.hostKind(reg), alts = [k, reg, 'minecraft:' + reg];
  for (var i = 0; i < alts.length; i++) if (this.lazy[alts[i]] !== undefined) return alts[i];
  return null;
};
Reg.anyLazy = function () { for (var k in this.lazy) return true; return false; };
Reg.isLazy = function (reg) { return this.lazyKind(reg) !== null; };
Reg.noteRows = function (kind, entries) {
  var m = this.rows[kind] || (this.rows[kind] = {});
  (entries || []).forEach(function (e) { if (e && e.id) m[Reg.full(e.id)] = e; });
};
Reg.cachedOpts = function (reg) {
  var lk = this.lazyKind(reg), m = this.rows[lk] || {}, out = [];
  for (var id in m) if (m[id]) out.push(this.rowToOpt(reg, m[id]));
  return out;
};
/* 取一行（已缓存的立即返回；没有就排队批量精确查询，到了 Reg.fire 重画；查过没有的返回 null） */
Reg.want = function (kind, full) {
  var m = this.rows[kind] || (this.rows[kind] = {});
  if (m[full]) return m[full];
  if (m[full] === false || (this.lookAsked[kind] && this.lookAsked[kind][full])) return null;
  (this.lookPending[kind] || (this.lookPending[kind] = [])).push(full);
  (this.lookAsked[kind] || (this.lookAsked[kind] = {}))[full] = 1;
  if (!this.lookTimer) { this.lookTimer = setTimeout(function () { Reg.lookTimer = null; Reg.lookFlush(); }, 30); }
  return null;
};
Reg.lookFlush = function () {
  if (this.lookBusy) return;
  var kind = null, k;
  for (k in this.lookPending) if (this.lookPending[k].length) { kind = k; break; }
  if (!kind) return;
  var ids = this.lookPending[kind].splice(0, 64);
  var generation = this.meta && this.meta.generation;
  this.lookBusy = true;
  var done = function (r) {
    Reg.lookBusy = false;
    if (generation !== (Reg.meta && Reg.meta.generation)) { Reg.lookFlush(); return; }
    var m = Reg.rows[kind] || (Reg.rows[kind] = {});
    if (r && !r.fallback) Reg.noteRows(kind, r.entries);
    if (r && !r.fallback) ids.forEach(function (id) { if (!m[id]) m[id] = false; });   /* 超时/失败不是“不存在”的权威证据 */
    Reg.fire('lookup:' + kind);
    Reg.lookFlush();
  };
  if (!HostSearch.query({ view: 'lookup', kind: kind, ids: ids, limit: 64 }, done)) done({ fallback: true });
};
