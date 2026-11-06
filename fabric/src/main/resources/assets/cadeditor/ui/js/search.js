/* 搜索匹配：子串命中，或拼音命中（规则参考 JustEnoughCharacters / PinIn）。
   「钻石剑」可以用 zuanshijian、zsj、zuanshij、zuansj、钻shi剑 等全拼 / 首字母 / 汉字混合输入命中；声调不需要，ü 写 v。
   拼音数据来自 pinyin-data.js（见 docs/THIRD-PARTY.md）；没有这个文件时只做子串匹配。
   性能：受限脚本引擎对单次入口有指令预算，所以——①每个文本只算一次“全拼串 / 首字母串”并缓存，常见输入直接 indexOf；
   ②只有两者都没中的“全拼和首字母混写”才走回溯，并且有总步数预算，用完就不再回溯（宁可漏掉少数混写，也不能让页面停掉）。 */
var PY = null, PY_INI = ["zh", "ch", "sh"], PYK = {}, PYK_N = 0, DFS_LEFT = 0, DFS_T = 0;
function pyInit() {
  PY = {};
  if (typeof PINYIN_BY === "undefined") return;
  for (var r in PINYIN_BY) {
    var chars = PINYIN_BY[r];
    for (var i = 0; i < chars.length; i++) { var c = chars.charAt(i); (PY[c] || (PY[c] = [])).push(r); }
  }
}
function pyIni(r) { var two = r.substring(0, 2); return PY_INI.indexOf(two) >= 0 ? two : r.charAt(0); }
/* 文本的“全拼串”和“首字母串”（多音字取第一个读音，其余读音走回溯），缓存起来，最多 6000 条 */
function pyKey(t) {
  var k = PYK[t]; if (k) return k;
  if (PYK_N > 6000) { PYK = {}; PYK_N = 0; }
  var full = "", ini = "", any = false;
  for (var i = 0; i < t.length; i++) {
    var c = t.charAt(i), rs = PY[c];
    if (rs) { full += rs[0]; ini += rs[0].charAt(0); any = true; }
    else if (/[a-z0-9]/.test(c)) { full += c; ini += c; }
  }
  PYK_N++;
  return (PYK[t] = { full: full, ini: ini, cjk: any });
}
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
  /* 混写（zhongg、钻shi剑）和多音字：有限步数的回溯。每轮搜索（30ms 内的连续调用算一轮）共享步数预算 */
  var now = Date.now(); if (now - DFS_T > 30) { DFS_LEFT = 40000; } DFS_T = now;
  if (DFS_LEFT <= 0 || t.length > 60) return false;
  var n = t.length, m = q.length, bad = {};
  function f(i, j) {
    if (j >= m) return true;
    if (i >= n || --DFS_LEFT <= 0) return false;
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
