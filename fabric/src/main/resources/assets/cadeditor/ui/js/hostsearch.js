/* 宿主侧搜索（docs/search-contract.md）：游戏的 Java 后台线程建好索引，页面只发查询、只收一小窗口已排序的结果，
   不再在 Rhino 里扫全表。老宿主（没有 search 通道）或该类别不支持时，调用方退回页面内的本地搜索。
   每个 view 同时只有一个有效请求，新请求自动取代旧的；最多用 2 个固定 view（宿主上限 8 个）。 */
var HostSearch = {
  seq: 0, views: {}, supported: null,   /* null = 还不知道；true = 宿主回过 search.result；false = 等了没有回应（老宿主） */
  /* o: { view, kind, query, offset?, limit?, filters? }；cb(result)：result 是宿主的最终窗口；
     {fallback:true, error?} 表示请用本地搜索。返回 false 表示根本没发出去（离线 / 老宿主），调用方直接走本地。 */
  query: function (o, cb) {
    if (this.supported === false || typeof Reg === 'undefined' || !Reg.live() || typeof oriel === 'undefined' || !oriel.send) return false;
    var me = this, id = 'hs' + (++this.seq), old = this.views[o.view];
    if (old) clearTimeout(old.timer);
    var v = this.views[o.view] = { id: id, cb: cb, timer: null, view: o.view };
    function arm(ms) {
      clearTimeout(v.timer);
      v.timer = setTimeout(function () {
        if (me.views[o.view] !== v) return;
        delete me.views[o.view];
        if (me.supported !== true) me.supported = false;   /* 第一次就没回应：当作老宿主，之后不再等 */
        cb({ fallback: true });
      }, ms);
    }
    v.arm = arm; arm(this.supported === true ? 8000 : 2500);
    var msg = { requestId: id, view: o.view, kind: o.kind, query: String(o.query || '').slice(0, 128), offset: o.offset || 0, limit: o.limit || 80 };
    if (o.filters) msg.filters = o.filters;
    if (o.ids) msg.ids = o.ids;
    var sent = false; try { sent = oriel.send('search', msg); } catch (e) {}
    if (sent === false) { clearTimeout(v.timer); delete this.views[o.view]; return false; }
    return true;
  },
  cancel: function (view) {
    var v = this.views[view]; if (!v) return;
    clearTimeout(v.timer); delete this.views[view];
    try { oriel.send('search', { requestId: 'hc' + (++this.seq), view: view, kind: 'items', cancel: true }); } catch (e) {}
  },
  receive: function (r) {
    if (!r || typeof r !== 'object') return;
    var v = null, k;
    for (k in this.views) if (this.views[k].id === r.requestId) v = this.views[k];
    if (!v) return;   /* 已被新请求取代的旧回应 */
    this.supported = true;
    if (r.cancelled) return;
    if (r.error) { clearTimeout(v.timer); delete this.views[v.view]; v.cb({ fallback: true, error: r.error }); return; }
    if (!r.ready) { v.arm(30000); return; }   /* 正在建索引：耐心等最终结果（宿主不要求轮询） */
    clearTimeout(v.timer); delete this.views[v.view];
    v.cb(r);
  }
};
