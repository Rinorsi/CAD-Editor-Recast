/* Always-on failure reporting. No document/request snapshots; exception text may quote invalid input. */
var EditorDiag = (function () {
  var sites = {}, count = 0, booted = false;
  function send(channel, data) {
    try {
      if (typeof oriel !== 'undefined' && oriel.send) return oriel.send(channel, data) !== false;
      if (channel === 'log' && typeof console !== 'undefined' && console.warn) console.warn(data.msg);
    } catch (ignored) { /* A broken logger must not recursively report or stop editing. */ }
    return false;
  }
  function report(level, site, error) {
    site = String(site).substring(0, 100);
    var now = Date.now(), key = '$' + level + ':' + site, last = sites[key];
    if (last && now - last.at < 5000) { last.skipped++; return; }
    if (!last && count >= 64) return;
    var skipped = last ? last.skipped : 0;
    if (!last) count++;
    sites[key] = { at: now, skipped: 0 };
    var name = error && error.name ? String(error.name) : 'Error';
    var message = error && error.message ? String(error.message) : String(error);
    var stack = error && error.stack ? String(error.stack).substring(0, 650) : '';
    send('log', { level: level, msg: '[CAD-Editor-UI] site=' + site + ' ' + name + ': ' + message.substring(0, 550) +
      (skipped ? ' repeated=' + skipped : '') + (stack ? ' stack=' + stack : '') });
  }
  return {
    phase: function (site, fn) {
      var at = Date.now();
      send('editor_ready', {phase:'work',stage:site,state:'begin'});
      try { return fn(); }
      catch (e) { report('error', site, e); throw e; }
      finally { send('editor_ready', {phase:'work',stage:site,state:'end',elapsedMs:Date.now() - at}); }
    },
    error: function (site, error) { report('error', site, error); },
    warn: function (site, error) { report('warn', site, error); },
    ready: function () {
      if (booted) return; booted = true;
      send('editor_ready', { phase: 'boot' });
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () {
        send('editor_ready', { phase: 'first_frame_callback' });
      });
    }
  };
})();
