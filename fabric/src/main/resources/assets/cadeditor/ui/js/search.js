/* 搜索匹配：子串命中，或拼音命中（规则参考 JustEnoughCharacters / PinIn）。
   「钻石剑」可以用 zuanshijian、zsj、zuanshij、zuansj、钻shi剑 等全拼 / 首字母 / 汉字混合输入命中；声调不需要，ü 写 v。
   拼音数据来自 pinyin-data.js（见 docs/THIRD-PARTY.md）；没有这个文件时只做子串匹配。

   性能（受限脚本引擎对“一次入口”有指令预算，超了会直接停页）：
   ①每个文本只算一次“全拼串 / 首字母串 / 全读音串”并缓存，常见输入直接 indexOf；
   ②只有“全拼和首字母混写”或多音字才走回溯，而且先过一道必要条件：查询里的字母必须是该文本“全读音串”的子序列，
     绝大多数不可能命中的条目在这里就被挡掉，不会进回溯；
   ③回溯本身有单条步数上限；快速模式（默认，给同步调用）还有整轮总步数预算，用完不再回溯；
   ④条目很多时（选择窗里的音效 / 物品 / 方块），用 kFilterSliced 按时间片分批过滤，每批都是一次新的入口，
     此时用精确模式（不设总预算），既不会停页，也不会漏掉命中。 */
var PY = null, PY_INI = ["zh", "ch", "sh"], PYK = {}, PYK_N = 0, DFS_LEFT = 0, DFS_T = 0, DFS_EXACT = false, DFS_PER = 1500;
function pyInit() {
  PY = {};
  if (typeof PINYIN_BY === "undefined") return;
  for (var r in PINYIN_BY) {
    var chars = PINYIN_BY[r];
    for (var i = 0; i < chars.length; i++) { var c = chars.charAt(i); (PY[c] || (PY[c] = [])).push(r); }
  }
}
function pyIni(r) { var two = r.substring(0, 2); return PY_INI.indexOf(two) >= 0 ? two : r.charAt(0); }
/* 文本的“全拼串”和“首字母串”（多音字取第一个读音，其余读音走回溯）；all 是每个字全部读音首尾相连，只用来做子序列过滤。缓存最多 6000 条 */
function pyKey(t) {
  var k = PYK[t]; if (k) return k;
  if (PYK_N > 6000) { PYK = {}; PYK_N = 0; }
  var full = "", ini = "", all = "", any = false;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i), rs = PY[c];
    if (rs) { full += rs[0]; ini += rs[0].charAt(0); any = true; all += rs.length === 1 ? rs[0] : rs.join(""); }
    else if (/[a-z0-9]/.test(c)) { full += c; ini += c; all += c; }
  }
  PYK_N++;
  return (PYK[t] = { full: full, ini: ini, all: all, cjk: any });
}
/* a 是不是 b 的子序列 */
function isSubseq(a, b) {
  var i = 0, n = a.length;
  if (!n) return true;
  for (var j = 0; j < b.length; j++) if (b.charAt(j) === a.charAt(i) && ++i >= n) return true;
  return false;
}
/* 开始新的一轮搜索：exact=true 不设总步数预算（只给按时间片分批的调用方用） */
function kSearchBegin(exact) { DFS_EXACT = !!exact; DFS_LEFT = DFS_EXACT ? 1e9 : 40000; DFS_T = Date.now(); }
function kMatch(text, query) {
  if (!query) return true;
  var q = String(query).toLowerCase().replace(/[ '’]/g, "").replace(/ü/g, "v");
  if (!q) return true;
  var t = String(text).toLowerCase();
  if (t.indexOf(q) >= 0) return true;
  if (!PY) pyInit();
  var k = pyKey(t);
  if (!k.cjk) return false;
  if (/^[a-z0-9]+$/.test(q) && (k.full.indexOf(q) >= 0 || k.ini.indexOf(q) >= 0)) return true;
  /* 必要条件：查询里的字母 / 数字是全读音串的子序列；查询里夹的汉字必须真的出现在文本里 */
  var qa = q.replace(/[^a-z0-9]/g, "");
  if (qa && !isSubseq(qa, k.all)) return false;
  if (qa.length !== q.length) for (var z = 0; z < q.length; z++) { var qc = q.charAt(z); if (!/[a-z0-9]/.test(qc) && t.indexOf(qc) < 0) return false; }
  /* 混写（zhongg、钻shi剑）和多音字：有限步数的回溯。快速模式下每轮搜索（30ms 内的连续调用算一轮）共享步数预算 */
  if (!DFS_EXACT) { var now = Date.now(); if (now - DFS_T > 30) { DFS_LEFT = 40000; } DFS_T = now; }
  if (DFS_LEFT <= 0 || t.length > 60) return false;
  var n = t.length, m = q.length, bad = {}, mine = DFS_PER;
  function f(i, j) {
    if (j >= m) return true;
    if (i >= n || --DFS_LEFT <= 0 || --mine <= 0) return false;
    var key = i * (m + 1) + j; if (bad[key]) return false;
    var c = t.charAt(i), rs = PY[c];
    if (c === q.charAt(j) && f(i + 1, j + 1)) return true;
    if (rs) {
      for (var a = 0; a < rs.length; a++) {
        var r = rs[a];
        if (r.indexOf(q.substring(j)) === 0) return true;
        var cand = [r, pyIni(r), r.charAt(0)];
        for (var b = 0; b < cand.length; b++) { var s = cand[b]; if (q.substr(j, s.length) === s && f(i + 1, j + s.length)) return true; }
      }
    } else if (!/[a-z0-9]/.test(c) && f(i + 1, j)) return true;
    bad[key] = 1; return false;
  }
  for (var s0 = 0; s0 < n; s0++) if (f(s0, 0)) return true;
  return false;
}

/* 按时间片分批过滤：list 很多时用它代替一次 filter。每批最多 budgetMs 毫秒（默认 8），批与批之间让出一次脚本入口，
   所以不会触发“单次入口指令预算”。返回取消函数；再次搜索前先取消上一次。
   test(item) -> 是否保留；done(结果数组) 在全部处理完后调用一次。小列表（≤ 200）同步完成。 */
function kFilterSliced(list, test, done, budgetMs) {
  var out = [], i = 0, n = list.length, cancelled = false, ms = budgetMs || 8;
  function step() {
    if (cancelled) return;
    kSearchBegin(true);   /* 精确模式只在这一批里生效，批与批之间别的同步调用仍走快速模式 */
    var end = Date.now() + ms;
    while (i < n) {
      var e = list[i++];
      if (test(e)) out.push(e);
      if ((i & 7) === 0 && Date.now() > end) break;
    }
    kSearchBegin(false);
    if (i < n) { setTimeout(step, 0); return; }
    done(out);
  }
  if (n <= 200 || typeof setTimeout !== "function") { kSearchBegin(false); var all = []; for (var j = 0; j < n; j++) if (test(list[j])) all.push(list[j]); done(all); return function () {}; }
  step();
  return function () { cancelled = true; };
}
