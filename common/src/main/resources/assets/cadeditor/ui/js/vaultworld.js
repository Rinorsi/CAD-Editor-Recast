/* 保险库 × 世界编辑：把对准的方块 / 在线玩家存进保险库，或把保险库里的方块 / 玩家预设套用回去。
   协议见 docs/vault-contract.md 的「P4-6」：保存带当前服务端 world 快照（走分段上传），套用先 preview 看会覆盖什么，
   用户确认后才发页面的 apply（带 vault_template），写入仍由服务端按权限和 revision 校验。 */
var VW_SECTIONS = ['inventory', 'equipment', 'ender', 'attributes', 'effects', 'game_mode'];
function vwKind() { var w = WE.w; return !w ? null : w.kind === 'block' ? 'block' : (w.kind === 'entity' && w.player) ? 'player_preset' : null; }
function vwSecName(s) { return Labels.vaultSection[s] || s; }
/* 左栏里的两个按钮；不适用的页面返回 null */
function vwActions() {
  var kind = vwKind(); if (!kind) return null;
  return h('div', { class: 'ed-vault' }, [
    kBtn('存入保险库', function () { vwSaveDialog(kind); }, { icon: 'plus', title: kind === 'block' ? '把这个方块的状态和数据存起来，之后可以套用到同类方块' : '把这位玩家的背包、装备等存成预设' }),
    kBtn('从保险库套用…', function () { vwPick(kind); }, { icon: 'download', title: '选一份已存的内容套用到这里；套用前会先显示将被覆盖的内容' })]);
}
function vwBusy() {
  if (WE.pending) { toast('上一笔修改还没有回执', 'info', 'we-wait'); return true; }
  return false;
}
function vwDefaultName(kind) {
  var w = WE.w;
  if (kind === 'block') return nameOf('block', shortId(w.block || w.type)) || humanId(w.block || w.type);
  return (w.player && w.player.name ? w.player.name : '玩家') + ' 的预设';
}
/* ---------- 存入 ---------- */
function vwSaveDialog(kind) {
  if (vwBusy()) return;
  var nm = kInput(vwDefaultName(kind), function () {}, { placeholder: '名称' }), tg = kInput('', function () {}, { placeholder: '标签，用逗号隔开（可不填）' }), nt = kInput('', function () {}, { placeholder: '备注（可不填）' });
  var rows = [fieldRow('名称', nm), fieldRow('标签', tg), fieldRow('备注', nt)], picked = {};
  if (kind === 'player_preset') {
    VW_SECTIONS.forEach(function (s) { picked[s] = true; });
    rows.push(xSec('check', '存哪些部分', '没勾选的部分套用时保持原样'));
    VW_SECTIONS.forEach(function (s) { rows.push(xToggle({ title: vwSecName(s), value: true, onChange: function (on) { picked[s] = on; } })); });
  }
  if (typeof weChangeCount === 'function' && weChangeCount() > 0) rows.unshift(kHint('存入的是游戏里现在的数据，页面上还没应用的修改不会被存进去。', 'note'));
  var go = kBtn('存入', function () {
    var secs = kind === 'player_preset' ? VW_SECTIONS.filter(function (s) { return picked[s]; }) : null;
    if (secs && !secs.length) { toast('至少选一部分', 'warn'); return; }
    var pack = { world: WE.w }; if (secs) pack.sections = secs;
    var meta = { kind: kind, name: (nm.value || '').trim(), tags: splitTags(tg.value).slice(0, 8), note: nt.value || '' };
    go.classList.add('dis');
    Vault.upload(JSON.stringify(pack), function (u) {
      if (!u.ok) { go.classList.remove('dis'); vaultErr(u); return; }
      meta.uploadToken = u.token;
      Vault.call('save', meta, function (r) {
        go.classList.remove('dis');
        if (!r.ok) { vaultErr(r); return; }
        closeModal(); toast('已存入保险库：' + (r.entry ? r.entry.name : meta.name), 'ok');
      });
    });
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('存入保险库', kind === 'block' ? '方块' : '玩家预设', rows, [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
/* ---------- 套用 ---------- */
function vwPick(kind) {
  if (vwBusy()) return;
  if (typeof weChangeCount === 'function' && weChangeCount() > 0) { toast('先应用或放弃页面上的修改，再套用保险库的内容。', 'warn', 'vw-dirty'); return; }
  openVault({ kind: kind, pickEntry: function (e) { closeModal(); if (kind === 'player_preset') vwSections(e); else vwPreview(e, null); } });
}
/* 预设可以只套用其中几部分；条目里记着存了哪些 */
function vwSections(e) {
  var have = (e.sections || (e.summary && e.summary.sections) || VW_SECTIONS).map(function (s) { return s.section || s; }), picked = {};
  have.forEach(function (s) { picked[s] = true; });
  var rows = [xSec('check', '套用哪些部分', '没勾选的部分保持原样')];
  have.forEach(function (s) { rows.push(xToggle({ title: vwSecName(s), value: true, onChange: function (on) { picked[s] = on; } })); });
  var go = kBtn('下一步：看会覆盖什么', function () {
    var secs = have.filter(function (s) { return picked[s]; });
    if (!secs.length) { toast('至少选一部分', 'warn'); return; }
    closeModal(); vwPreview(e, secs);
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('套用预设', e.name || '', rows, [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}
function vwPreview(e, secs) {
  var pack = { world: WE.w }; if (secs) pack.sections = secs;
  toast('正在核对…', 'info', 'vw-pre');
  Vault.upload(JSON.stringify(pack), function (u) {
    if (!u.ok) { toastDismiss('vw-pre'); vaultErr(u); return; }
    var f = { id: e.id, uploadToken: u.token }; if (secs) f.sections = secs;
    Vault.call('preview', f, function (r) {
      toastDismiss('vw-pre');
      if (!r.ok) { vwPreviewErr(r); return; }
      if (vwKind() === 'player_preset') vwBackupGate(secs, function () { vwConfirm(e, r); }); else vwConfirm(e, r);
    });
  });
}
var VW_ERR = { block_type_mismatch: '方块种类不一样：这份数据存的是别的方块，不能套用到这里（不会静默改方块种类）。', wrong_kind: '这一条不是能套用到这里的类型。', RESPONSE_LIMIT: '内容太大，无法预览。' };
function vwPreviewErr(r) { toast(VW_ERR[r.error] || VW_ERR[r.code] || r.reason || r.error || '核对失败', 'error'); }
function vwConfirm(e, r) {
  var ov = (r.summary && r.summary.overwrites) || [], rows = [];
  rows.push(kHint(ov.length ? '套用后，下面这些会被覆盖：' : '套用后没有会被覆盖的内容。', ov.length ? 'note' : 'sub'));
  ov.forEach(function (o) { rows.push(xRow({ icon: false, title: vwSecName(o.section), sub: String(o.before === undefined ? '' : o.before) + ' → ' + String(o.after === undefined ? '' : o.after) })); });
  var go = kBtn('确认套用', function () {
    if (vwBusy()) return;
    var msg = clone(r.apply); msg.requestId = 'w-' + Date.now() + '-' + (++WE.seq);
    closeModal(); weSend('apply', msg, '正在套用「' + (e.name || '') + '」…');
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell('确认套用', e.name || '', rows, [h('div', { class: 'grow' }), kBtn('取消', closeModal), go]), true);
}

/* 覆盖玩家数据之前：保险库里有没有现在这份数据的备份？没有就问一句要不要先存。是 = 存进去再继续，否 = 直接继续，取消 = 不套用 */
function vwBackupGate(secs, next) {
  var pack = { world: WE.w }; if (secs) pack.sections = secs;
  Vault.upload(JSON.stringify(pack), function (u) {
    if (!u.ok) { next(); return; }   // 查不了就不拦着，照常往下走
    var f = { kind: 'player_preset', uploadToken: u.token }; if (secs) f.sections = secs;
    Vault.call('has_backup', f, function (r) {
      if (!r.ok || r.backed_up) { next(); return; }
      var rows = [h('div', { class: 'k-sub', text: '保险库里还没有现在这份数据。要先存入保险库吗？' })];
      var yes = kBtn('是，先存入', function () {
        Vault.call('save', { kind: 'player_preset', uploadToken: u.token, name: vwDefaultName('player_preset') + ' · 套用前备份', tags: ['备份'] }, function (sv) {
          if (!sv.ok) { vaultErr(sv); return; }
          closeModal(); toast('已存入保险库', 'ok'); next();
        });
      }, { cls: 'pri', icon: 'check' });
      openModal(modalShell('当前数据没有备份', '', rows, [h('div', { class: 'grow' }), kBtn('取消', closeModal), kBtn('否，直接套用', function () { closeModal(); next(); }), yes]), true);
    });
  });
}
