/* Settings release notes. The installed JAR supplies the index and one version at a time. */
var ReleaseNotes = {
  index:null, releases:{}, errors:{}, pending:{}, sequence:0, listeners:[], attached:false,
  notify:function () {
    if (this.notifyTimer) return; var me = this;
    this.notifyTimer = setTimeout(function () { me.notifyTimer = null; me.listeners.slice().forEach(function (f) { try { f(); } catch (e) { EditorDiag.error('settings.changelog.paint', e); } }); }, 0);
  },
  subscribe:function (f) { var me = this; this.listeners.push(f); return function () { me.listeners = me.listeners.filter(function (v) { return v !== f; }); }; },
  receive:function (r) {
    if (!r || typeof r.requestId !== 'string') return;
    var me = this, key = Object.keys(this.pending).filter(function (k) { return me.pending[k].id === r.requestId; })[0];
    if (!key) return;
    clearTimeout(this.pending[key].timer); delete this.pending[key];
    if (r.status === 'ok' && key === 'index' && Array.isArray(r.releases)) this.index = r.releases;
    else if (r.status === 'ok' && r.release && r.release.version === key && Array.isArray(r.release.sections)) this.releases[key] = r.release;
    else this.errors[key] = r.reason || '更新日志读取失败，可重试';
    this.notify();
  },
  load:function (version) {
    var key = version || 'index', me = this;
    if (this.pending[key] || key === 'index' && this.index || key !== 'index' && this.releases[key]) return;
    delete this.errors[key];
    if (!this.attached) {
      oriel.on('patch', function (p) { if (p && p.key === 'editor_changelog') me.receive(p.value); });
      this.attached = true;
    }
    var id = 'notes-' + (++this.sequence) + '-' + Date.now();
    this.pending[key] = {id:id, timer:setTimeout(function () {
      if (!me.pending[key] || me.pending[key].id !== id) return;
      delete me.pending[key]; me.errors[key] = '读取超时，可重试';
      EditorDiag.error('settings.changelog.timeout', new Error('request=' + id + ' version=' + key)); me.notify();
    }, 8000)};
    try {
      var message = {requestId:id}; if (version) message.version = version;
      if (oriel.send('editor_changelog', message) === false) throw new Error('宿主未接受更新日志请求');
    } catch (e) {
      clearTimeout(this.pending[key].timer); delete this.pending[key]; this.errors[key] = '更新日志读取失败，可重试';
      EditorDiag.error('settings.changelog.request', e); this.notify();
    }
  }
};

function releaseNoteText(text) {
  text = String(text);
  var node = h('span', {class:'release-text'}), offset = 0, quote = String.fromCharCode(96);
  // Only inline emphasis/code is interpreted; notes never become HTML or executable markup.
  while (offset < text.length) {
    var bold = text.indexOf('**', offset), code = text.indexOf(quote, offset);
    var start = bold < 0 ? code : code < 0 ? bold : Math.min(bold, code), mark = start === bold ? '**' : quote;
    var end = start < 0 ? -1 : text.indexOf(mark, start + mark.length);
    if (end < 0) { node.appendChild(document.createTextNode(text.substring(offset))); break; }
    if (start > offset) node.appendChild(document.createTextNode(text.substring(offset, start)));
    node.appendChild(h(mark === '**' ? 'b' : 'span', {class:mark === '**' ? 'release-em' : 'release-code', text:text.substring(start + mark.length, end)}));
    offset = end + mark.length;
  }
  return node;
}

// uiSlide only animates height; the caller owns persistent visibility.
function releaseNoteFold(body, open) {
  body._releaseOpen = open;
  if (open) body.style.display = '';
  uiSlide(body, open, function () {
    if (!body._releaseOpen) body.style.display = 'none';
  });
}

function changelogSection(host, state) {
  state = state || {open:{}, groups:{}};
  var root = h('div', {class:'release-notes'}), alive = true;
  host.appendChild(root);
  var current = Prefs.about && Prefs.about.version;
  if (!(Prefs.about && Prefs.about.changelog) || typeof oriel === 'undefined' || !oriel.send || !oriel.on) {
    root.appendChild(h('div', {class:'release-state k-sub', text:'重启客户端后可查看更新日志'}));
    return {dispose:function () { alive = false; }};
  }
  function message(parent, key, version) {
    var error = ReleaseNotes.errors[key];
    var row = h('div', {class:'release-state' + (error ? ' bad' : '')}, [h('span', {text:error || '读取中…'})]);
    if (error) row.appendChild(kBtn('重试', function () { ReleaseNotes.load(version); render(); }, {icon:'refresh', cls:'sm'}));
    parent.appendChild(row);
  }
  function renderContent(parent, note) {
    (note.intro || []).forEach(function (text) { parent.appendChild(h('div', {class:'release-intro'}, [releaseNoteText(text)])); });
    note.sections.forEach(function (section, index) {
      if (!section.items || !section.items.length) return;
      var key = note.version + ':' + index, open = state.groups[key] !== false;
      var arrow = foldArrow(open, 9), head = h('div', {class:'release-section-head', role:'button', 'aria-expanded':String(open)}, [
        h('span', {class:'release-section-title', text:section.title}), h('span', {class:'release-count', text:String(section.items.length)}), h('div', {class:'grow'}), arrow
      ]);
      var list = h('div', {class:'release-items'});
      section.items.forEach(function (text) { list.appendChild(h('div', {class:'release-item'}, [h('span', {class:'release-dot', text:'·'}), releaseNoteText(text)])); });
      if (!open) list.style.display = 'none';
      activate(head, function () { open = !open; state.groups[key] = open; head.setAttribute('aria-expanded', String(open)); foldArrowSet(arrow, open); releaseNoteFold(list, open); });
      parent.appendChild(h('div', {class:'release-section'}, [head, list]));
    });
  }
  function render() {
    if (!alive) return;
    var scroll = host.parentNode, top = scroll ? scroll.scrollTop : 0;
    clear(root);
    if (!ReleaseNotes.index) { message(root, 'index'); return; }
    if (!ReleaseNotes.index.length) { root.appendChild(h('div', {class:'release-state k-sub', text:'暂无更新日志'})); return; }
    ReleaseNotes.index.forEach(function (entry, index) {
      var latest = entry.version === current, open = state.open[entry.version];
      if (open === undefined) open = state.open[entry.version] = latest || (!current && index === 0);
      var arrow = foldArrow(open, 10), labels = h('div', {class:'release-labels'}, [h('span', {class:'release-version', text:entry.version})]);
      if (latest) labels.appendChild(h('span', {class:'release-current', text:'当前版本'}));
      var head = h('div', {class:'release-head', role:'button', 'aria-expanded':String(open)}, [
        labels, h('span', {class:'release-date', text:entry.date || ''}), h('div', {class:'grow'}), h('span', {class:'release-count', text:entry.count + ' 项'}), arrow
      ]);
      var content = h('div', {class:'release-content'});
      function fill() {
        clear(content); var note = ReleaseNotes.releases[entry.version];
        if (note) renderContent(content, note); else { message(content, entry.version, entry.version); if (!ReleaseNotes.errors[entry.version]) ReleaseNotes.load(entry.version); }
      }
      if (open) fill(); else content.style.display = 'none';
      activate(head, function () {
        open = !open; state.open[entry.version] = open; head.setAttribute('aria-expanded', String(open)); foldArrowSet(arrow, open);
        if (open) fill(); releaseNoteFold(content, open);
      });
      root.appendChild(h('div', {class:'release-version-block' + (latest ? ' current' : '')}, [head, content]));
    });
    if (scroll) scroll.scrollTop = top;
  }
  var unsubscribe = ReleaseNotes.subscribe(render);
  render(); ReleaseNotes.load();
  return {dispose:function () { alive = false; unsubscribe(); }};
}
