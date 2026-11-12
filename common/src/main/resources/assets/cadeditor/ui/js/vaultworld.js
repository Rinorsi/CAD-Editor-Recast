/* 保险库 × 世界编辑：把对准的方块 / 在线玩家存进保险库，或把保险库里的方块 / 玩家预设套用回去。
   协议见 docs/vault-contract.md 的「P4-6」：保存带当前服务端 world 快照（走分段上传），套用先 preview 看会覆盖什么，
   用户确认后才发页面的 apply（带 vault_template），写入仍由服务端按权限和 revision 校验。 */
var VW_SECTIONS = ['inventory', 'equipment', 'ender', 'attributes', 'effects', 'game_mode'];
var VW_COPY_PENDING = false;
function vwPlayerBackpackToSelf() {
  var source = WE.w;
  if (!source || !source.player || source.player.self || source.player.preset || WE.tab !== 'pinv' || VW_COPY_PENDING || vwBusy()) return;
  if (weDirty()) { toast(I18n.t("cadeditor.ui.vaultworld.11e2fc1970"), 'warn'); return; }
  VW_COPY_PENDING = true; drawWorldTop();
  function finish() { VW_COPY_PENDING = false; if (weActive()) drawWorldTop(); }
  Vault.upload(JSON.stringify({ world: source, sections: ['inventory'] }), function (u) {
    if (!u.ok) { finish(); vaultErr(u); return; }
    Vault.call('save', { kind: 'player_preset', uploadToken: u.token, name: I18n.t("cadeditor.ui.vaultworld.398d5d3e8d", (source.player.name || I18n.t("cadeditor.ui.vaultworld.991e63fe29"))), tags: [] }, function (r) {
      finish();
      if (!r.ok) { vaultErr(r); return; }
      if (WE.w !== source || weDirty()) { toast(I18n.t("cadeditor.ui.vaultworld.57993db835"), 'info'); return; }
      vwApplyToSelf(r.entry || { id: r.id });
    });
  });
}
function vwKind() { var w = WE.w; return !w ? null : w.kind === 'block' ? 'block' : (w.kind === 'entity' && w.player && !w.player.preset) ? 'player_preset' : null; }
function vwSecName(s) { return Labels.vaultSection[s] || s; }
/* 左栏里的两个按钮；不适用的页面返回 null */
function vwActions() {
  var kind = vwKind(); if (!kind) return null;
  return h('div', { class: 'ed-vault' }, [
    kBtn(I18n.t("cadeditor.ui.eschema.248306082a"), function () { vwSaveDialog(kind); }, { icon: 'plus', title: kind === 'block' ? I18n.t("cadeditor.ui.vaultworld.2248575d63") : I18n.t("cadeditor.ui.vaultworld.7eb1afdf12") }),
    kBtn(I18n.t("cadeditor.ui.vaultworld.82e8b94594"), function () { vwPick(kind); }, { icon: 'download', title: I18n.t("cadeditor.ui.vaultworld.2a05e922e1") })]);
}
function vwBusy() {
  if (WE.pending) { toast(I18n.t("cadeditor.ui.vaultworld.53871cb811"), 'info', 'we-wait'); return true; }
  return false;
}
function vwDefaultName(kind) {
  var w = WE.w;
  if (kind === 'block') return nameOf('block', shortId(w.block || w.type)) || humanId(w.block || w.type);
  return I18n.t("cadeditor.ui.vaultworld.9babebf7e9", (w.player && w.player.name ? w.player.name : I18n.t("cadeditor.ui.vaultworld.991e63fe29")));
}
/* ---------- 存入 ---------- */
function vwSaveDialog(kind) {
  if (vwBusy()) return;
  var nm = kInput(vwDefaultName(kind), function () {}, { placeholder: I18n.t("cadeditor.ui.cards1.d44e9b3d3b") }), tg = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.f8735b187b") }), nt = kInput('', function () {}, { placeholder: I18n.t("cadeditor.ui.vault.88a5087375") });
  var rows = [fieldRow(I18n.t("cadeditor.ui.cards1.d44e9b3d3b"), nm), fieldRow(I18n.t("cadeditor.ui.eschema.1d0fd5f933"), tg), fieldRow(I18n.t("cadeditor.ui.vault.daede98817"), nt)], picked = {};
  if (kind === 'player_preset') {
    VW_SECTIONS.forEach(function (s) { picked[s] = true; });
    rows.push(xSec('check', I18n.t("cadeditor.ui.vaultworld.e8cc891caa"), I18n.t("cadeditor.ui.vaultworld.28d59e4710")));
    VW_SECTIONS.forEach(function (s) { rows.push(xToggle({ title: vwSecName(s), value: true, onChange: function (on) { picked[s] = on; } })); });
  }
  if (typeof weChangeCount === 'function' && weChangeCount() > 0) rows.unshift(kHint(I18n.t("cadeditor.ui.vaultworld.488e0579eb"), 'note'));
  var go = kBtn(I18n.t("cadeditor.ui.vault.c77eea6fd1"), function () {
    var secs = kind === 'player_preset' ? VW_SECTIONS.filter(function (s) { return picked[s]; }) : null;
    if (secs && !secs.length) { toast(I18n.t("cadeditor.ui.vaultworld.d969ec7e97"), 'warn'); return; }
    var pack = { world: WE.w }; if (secs) pack.sections = secs;
    var meta = { kind: kind, name: (nm.value || '').trim(), tags: splitTags(tg.value).slice(0, 8), note: nt.value || '' };
    go.classList.add('dis');
    Vault.upload(JSON.stringify(pack), function (u) {
      if (!u.ok) { go.classList.remove('dis'); vaultErr(u); return; }
      meta.uploadToken = u.token;
      Vault.call('save', meta, function (r) {
        go.classList.remove('dis');
        if (!r.ok) { vaultErr(r); return; }
        closeModal(); toast(I18n.t("cadeditor.ui.vault.d5cdd79d2a", (r.entry ? r.entry.name : meta.name)), 'ok');
      });
    });
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.eschema.248306082a"), kind === 'block' ? I18n.t("cadeditor.ui.picker.2753766d18") : I18n.t("cadeditor.ui.vault.d4f6dca6d8"), rows, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}
/* ---------- 套用 ---------- */
function vwPick(kind) {
  if (vwBusy()) return;
  if (typeof weChangeCount === 'function' && weChangeCount() > 0) { toast(I18n.t("cadeditor.ui.vaultworld.0e14bf18d1"), 'warn', 'vw-dirty'); return; }
  openVault({ kind: kind, pickEntry: function (e) { closeModal(); if (kind === 'player_preset') vwSections(e); else vwPreview(e, null); } });
}
/* 预设可以只套用其中几部分；条目里记着存了哪些 */
function vwApplyToSelf(e) {
  if (vwBusy() || (typeof EditorBridge !== 'undefined' && EditorBridge.pending)) return;
  if ((weActive() && weDirty()) || (!weActive() && Store.docs.some(function (d) { return diffDoc(d).length > 0; }))) {
    toast(I18n.t("cadeditor.ui.vaultworld.0e14bf18d1"), 'warn', 'vw-dirty'); return;
  }
  if (typeof oriel === 'undefined' || !oriel.send) { toast(I18n.t("cadeditor.ui.vaultworld.0b41f07af8"), 'warn'); return; }
  oriel.send('open_world', { apply_preset: e.id });
  closeModal();
}
function vwSections(e) {
  var have = (e.sections || (e.summary && e.summary.sections) || VW_SECTIONS).map(function (s) { return s.section || s; }), picked = {};
  have.forEach(function (s) { picked[s] = true; });
  var rows = [xSec('check', I18n.t("cadeditor.ui.vaultworld.4d141cde05"), I18n.t("cadeditor.ui.vaultworld.326ad9136c"))];
  have.forEach(function (s) { rows.push(xToggle({ title: vwSecName(s), value: true, onChange: function (on) { picked[s] = on; } })); });
  var go = kBtn(I18n.t("cadeditor.ui.vaultworld.7fdc2996a5"), function () {
    var secs = have.filter(function (s) { return picked[s]; });
    if (!secs.length) { toast(I18n.t("cadeditor.ui.vaultworld.d969ec7e97"), 'warn'); return; }
    closeModal(); vwPreview(e, secs);
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.vaultworld.73353b4674"), e.name || '', rows, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}
function vwPreview(e, secs) {
  var pack = { world: WE.w }; if (secs) pack.sections = secs;
  toast(I18n.t("cadeditor.ui.vaultworld.9f7698381e"), 'info', 'vw-pre');
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
var VW_ERR = { block_type_mismatch: I18n.t("cadeditor.ui.vaultworld.6ca30f0298"), wrong_kind: I18n.t("cadeditor.ui.vaultworld.64f9c3ccaf"), RESPONSE_LIMIT: I18n.t("cadeditor.ui.vaultworld.374083eb4a") };
function vwPreviewErr(r) { toast(VW_ERR[r.error] || VW_ERR[r.code] || r.reason || r.error || I18n.t("cadeditor.ui.vaultworld.39c3c2517f"), 'error'); }
function vwConfirm(e, r) {
  var ov = (r.summary && r.summary.overwrites) || [], rows = [];
  rows.push(kHint(ov.length ? I18n.t("cadeditor.ui.vaultworld.5e2ef90ea4") : I18n.t("cadeditor.ui.vaultworld.9da4a0c7c7"), ov.length ? 'note' : 'sub'));
  ov.forEach(function (o) { rows.push(xRow({ icon: false, title: vwSecName(o.section), sub: String(o.before === undefined ? '' : o.before) + ' → ' + String(o.after === undefined ? '' : o.after) })); });
  var go = kBtn(I18n.t("cadeditor.ui.vaultworld.afde9407b6"), function () {
    if (vwBusy()) return;
    var msg = clone(r.apply); msg.requestId = 'w-' + Date.now() + '-' + (++WE.seq);
    closeModal(); weSend('apply', msg, I18n.t("cadeditor.ui.vaultworld.2ccbee6a40", (e.name || '')));
  }, { cls: 'pri', icon: 'check' });
  openModal(modalShell(I18n.t("cadeditor.ui.vaultworld.afde9407b6"), e.name || '', rows, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), go]), true);
}

/* 覆盖玩家数据之前：保险库里有没有现在这份数据的备份？没有就问一句要不要先存。是 = 存进去再继续，否 = 直接继续，取消 = 不套用 */
function vwBackupGate(secs, next) {
  var pack = { world: WE.w }; if (secs) pack.sections = secs;
  Vault.upload(JSON.stringify(pack), function (u) {
    if (!u.ok) { next(); return; }   // 查不了就不拦着，照常往下走
    var f = { kind: 'player_preset', uploadToken: u.token }; if (secs) f.sections = secs;
    Vault.call('has_backup', f, function (r) {
      if (!r.ok || r.backed_up) { next(); return; }
      var rows = [h('div', { class: 'k-sub', text: I18n.t("cadeditor.ui.vaultworld.fea7880ef0") })];
      var yes = kBtn(I18n.t("cadeditor.ui.vaultworld.7e9e590e0e"), function () {
        Vault.call('save', { kind: 'player_preset', uploadToken: u.token, name: I18n.t("cadeditor.ui.vaultworld.256e218153", (vwDefaultName('player_preset'))), tags: [I18n.t("cadeditor.ui.vaultworld.70e372abba")] }, function (sv) {
          if (!sv.ok) { vaultErr(sv); return; }
          closeModal(); toast(I18n.t("cadeditor.ui.vaultworld.84ee4ef9a9"), 'ok'); next();
        });
      }, { cls: 'pri', icon: 'check' });
      openModal(modalShell(I18n.t("cadeditor.ui.vaultworld.d79ea14da5"), '', rows, [h('div', { class: 'grow' }), kBtn(I18n.t("cadeditor.ui.common.cancel"), closeModal), kBtn(I18n.t("cadeditor.ui.vaultworld.ee4e02b0b5"), function () { closeModal(); next(); }), yes]), true);
    });
  });
}
