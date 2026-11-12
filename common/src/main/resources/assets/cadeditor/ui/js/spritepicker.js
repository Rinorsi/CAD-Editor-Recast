/* One small window of the loaded atlas catalog. No guessed item -> sprite mapping. */
function pickSprite(anchor, onPick) {
  var active = true, revision = 0, mode = 'sprite', nextOffset = 0, hasNext = false, pageStarts = [];
  var view = 'sprite-picker', epoch = Reg.meta && Reg.meta.generation;
  var atlas = h('input', { class: 'k-input', type: 'text', placeholder: I18n.t("cadeditor.ui.spritepicker.bb018489f8"), title: I18n.t("cadeditor.ui.spritepicker.476f87ddd1"), spellcheck: 'false' });
  var sprite = h('input', { class: 'k-input', type: 'text', placeholder: 'Sprite ID', title: I18n.t("cadeditor.ui.spritepicker.271dbabc26"), spellcheck: 'false' });
  var q = h('input', { class: 'k-input', type: 'text', placeholder: I18n.t("cadeditor.ui.spritepicker.259c3916f5"), spellcheck: 'false' });
  var grid = h('div', { class: 'k-sprite-grid' }), status = h('div', { class: 'k-phint k-desc' });
  function current() { return active && KPop.el === pop && document.body.contains(anchor) && epoch === (Reg.meta && Reg.meta.generation); }
  function resourceId(value) {
    value = String(value || '').trim();
    return /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/.test(value) ? Reg.full(value) : null;
  }
  function hint(text) { status.textContent = text; setTip(status, text); }
  function failure(error) {
    if (typeof EditorDiag !== 'undefined') EditorDiag.warn('sprite.catalog', error);
    hint(I18n.t("cadeditor.ui.spritepicker.119c935308")); toast(I18n.t("cadeditor.ui.spritepicker.62e411bcda"), 'error');
  }
  function insert(spriteId, atlasId) {
    if (!current()) { kPopClose(); return; }
    var a = resourceId(atlasId || atlas.value), s = resourceId(spriteId);
    if (!a || !s) { toast(!a ? I18n.t("cadeditor.ui.spritepicker.91e3a11b3a") : I18n.t("cadeditor.ui.spritepicker.503407c2cc"), 'error'); return; }
    kPopClose(); onPick({ object: 'atlas', atlas: a, sprite: s });
  }
  function atlasMode(on) {
    mode = on ? 'atlas' : 'sprite';
    q.value = ''; q.setAttribute('placeholder', on ? I18n.t("cadeditor.ui.spritepicker.f64bd24984") : I18n.t("cadeditor.ui.spritepicker.259c3916f5"));
    atlasButton.classList.toggle('on', on); manual.style.display = on ? 'none' : 'flex';
    load(0); kPopPin(pop, grid); q.focus();
  }
  function atlasChoice(row) {
    atlas.value = row.id; sprite.value = ''; atlasMode(false);
  }
  function paint(rows) {
    clear(grid); grid.classList.toggle('atlases', mode === 'atlas');
    rows.forEach(function (row) {
      if (mode === 'atlas') {
        var label = row.items ? I18n.t("cadeditor.ui.spritepicker.d176e09e50", (row.id)) : row.id;
        var item = h('div', { class: 'k-btn k-sprite-atlas', title: label + ' · ' + row.count, text: label });
        activate(item, function () { if (current()) atlasChoice(row); }); grid.appendChild(item);
      } else if (row.atlas && row.sprite) {
        var preview = h('div', { class: 'k-sprite-glyph' });
        renderRuns(preview, {}, [{ text: '￼', _object: { object: 'atlas', atlas: row.atlas, sprite: row.sprite } }]);
        var cell = h('div', { class: 'k-pcell k-sprite-cell', title: row.sprite + '\n' + row.atlas }, [preview]);
        activate(cell, function () { insert(row.sprite, row.atlas); }); grid.appendChild(cell);
      }
    });
  }
  function load(offset, initial) {
    if (!current()) return;
    if (!offset) pageStarts = [];
    var rev = ++revision, requestMode = initial ? 'atlas' : mode, a = resourceId(atlas.value);
    HostSearch.cancel(view); clear(grid); hasNext = false; next.style.display = 'none';
    back.style.display = offset > 0 ? '' : 'none'; hint(I18n.t("cadeditor.ui.common.loading_ellipsis"));
    if (requestMode === 'sprite' && !a) { hint(I18n.t("cadeditor.ui.spritepicker.4bc9018410")); return; }
    var ok = HostSearch.query({ view: view, kind: requestMode === 'atlas' ? 'sprite_atlas' : 'sprite', query: initial ? '' : q.value.trim(), offset: offset, limit: 64, filters: requestMode === 'sprite' ? { tags: [a] } : {} }, function (result) {
      if (!current() || rev !== revision) return;
      if (result.fallback) { failure(result.error || 'NO_CATALOG_RESPONSE'); return; }
      var rows = result.entries || [];
      if (initial) {
        var first = null; rows.forEach(function (row) { if (!first || row.items) first = row; });
        if (first) { atlas.value = first.id; load(0); } else hint(I18n.t("cadeditor.ui.spritepicker.52c2b87c21"));
        return;
      }
      paint(rows); nextOffset = result.nextOffset; hasNext = !result.done && nextOffset > offset;
      pageOffset = offset; next.style.display = hasNext ? '' : 'none';
      hint(rows.length ? (offset + 1) + '–' + (offset + rows.length) + ' / ' + result.total : I18n.t("cadeditor.ui.spritepicker.ef1f7974ca"));
      grid.scrollTop = 0; kPopPin(pop, grid);
    });
    if (!ok) failure('CATALOG_UNAVAILABLE');
  }
  var pageOffset = 0;
  var atlasButton = kBtn('', function () { atlasMode(mode !== 'atlas'); }, { icon: 'down', title: I18n.t("cadeditor.ui.spritepicker.90b13ddd1c") });
  var back = kBtn(I18n.t("cadeditor.ui.kit.c9b9ae7a61"), function () { load(pageStarts.length ? pageStarts.pop() : 0); });
  var next = kBtn(I18n.t("cadeditor.ui.kit.8a8542f696"), function () { if (hasNext) { pageStarts.push(pageOffset); load(nextOffset); } });
  var manual = h('div', { class: 'k-row k-sprite-manual' }, [sprite, kBtn(I18n.t("cadeditor.ui.spritepicker.4268493cd3"), function () { insert(sprite.value); }, { cls: 'pri' })]);
  var search = kSearchBox(q, function () { load(0); });
  var box = h('div', { class: 'k-pickbox k-sprite-picker' }, [h('div', { class: 'k-row k-sprite-atlasbar' }, [atlas, atlasButton]), search.el, grid, h('div', { class: 'k-row k-sprite-pages' }, [status, back, next]), manual]);
  var pop = kPopover(anchor, box, { width: 420, maxHeight: 360, onClose: function () { active = false; revision++; HostSearch.cancel(view); } });
  kPopPin(pop, grid);
  atlas.addEventListener('input', function () { revision++; HostSearch.cancel(view); clear(grid); sprite.value = ''; hasNext = false; back.style.display = next.style.display = 'none'; hint(I18n.t("cadeditor.ui.spritepicker.02eb88c0f8")); });
  atlas.addEventListener('change', function () { sprite.value = ''; if (mode === 'sprite') load(0); });
  atlas.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); atlasMode(false); } });
  sprite.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); insert(sprite.value); } });
  box.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); kPopClose(); } });
  load(0, true);
  q.focus();
}
