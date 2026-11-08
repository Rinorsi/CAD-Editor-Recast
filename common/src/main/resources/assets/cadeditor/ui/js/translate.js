/* 游戏语言翻译：按翻译键向客户端要译文（registry translate），批量、去重、缓存；译文到了就让当前世界页重画。
   用法：Tr.get('advancements.story.root.title') —— 有就返回译文，没有返回 undefined 并在后台去要。 */
var Tr = {
  map: {}, asked: {}, queue: [], timer: null, redraw: null,
  get: function (key) {
    if (!key) return undefined;
    if (this.map[key] !== undefined) return this.map[key];
    this.need(key); return undefined;
  },
  need: function (key) {
    if (this.asked[key] || typeof Reg === 'undefined' || !Reg.live()) return;
    this.asked[key] = 1; this.queue.push(key);
    if (this.timer === null) { var me = this; this.timer = setTimeout(function () { me.flush(); }, 40); }
  },
  flush: function () {
    this.timer = null;
    var q = this.queue.splice(0);
    if (!q.length || typeof oriel === 'undefined' || !oriel.send) return;
    for (var i = 0; i < q.length; i += 200) oriel.send('registry', { name: 'translate', keys: q.slice(i, i + 200) });
  },
  /* 回复形状见 docs/registry-contract.md：每页 {map:{键:译文}, entries:[{id:键, name:译文}]}，多页累积 */
  accept: function (v) {
    var m = v && (v.map || v.translations), n = 0, k;
    if (m && typeof m === 'object') for (k in m) if (typeof m[k] === 'string') { this.map[k] = m[k]; n++; }
    if (v && Array.isArray(v.entries)) v.entries.forEach(function (e) { if (e && typeof e.id === 'string' && typeof e.name === 'string') { Tr.map[e.id] = e.name; n++; } else if (e && typeof e.key === 'string' && typeof e.text === 'string') { Tr.map[e.key] = e.text; n++; } });
    if (!n) return;
    if (this.redraw !== null) clearTimeout(this.redraw);
    this.redraw = setTimeout(function () { Tr.redraw = null; if (typeof weActive === 'function' && weActive() && typeof weRedrawBody === 'function' && !$('modal')) weRedrawBody(); }, 80);
  }
};
