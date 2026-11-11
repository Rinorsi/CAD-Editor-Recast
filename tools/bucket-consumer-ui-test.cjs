// Explicit native-data gate; pass BucketItemConsumerTest JSON, not handwritten game facts.
const assert = require('node:assert/strict'), fs = require('node:fs'), H = require('./lib/ui-harness.cjs');
const paths = process.argv.slice(2); assert(paths.length, 'Supply real per-version native consumer JSON, not a handwritten game directory');
let count = 0;
for (const file of paths) {
  const facts = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = H.create(), c = t.c; c.snd = () => {}; c.toast = () => {}; c.window.EDITOR_PREVIEW = false;
  c.Reg.meta = {generation:'bucket-consumer-test'};
  for (const fact of facts) {
    const meta = fact.metadata, id = meta.id, type = meta.bucket_entity;
    assert(id && type); c.Reg.imeta[id] = meta; c.Reg.defs[id] = {id, comps:{}};
    c.Reg.eschema[type] = {id:type, available:true, flags:[fact.schemaHealth], variants:[]};
    c.Store.open({id, count:1, comps:{}, removed:{}}, true); c.UI.tab=null; c.rebuild(); const doc = c.Store.doc();
    const absent = c.snapOf(doc), fields = c.CARDS.bucketFields(); assert(fields);
    c.bucketPreview(doc); assert.equal(c.snapOf(doc), absent, 'browsing does not manufacture defaults');
    assert.equal(c.bucketData().Health, undefined);
    function row(key) { const r = c.CARDS.bucketFields().body.querySelectorAll('.k-fld').find(x => x.getAttribute('data-tip') === key); assert(r, key); return r; }
    if (meta.bucket_age_key) {
      const ageKey = meta.bucket_age_key, lock = meta.bucket_fields.find(x => /^(AgeLocked|age_locked)$/.test(x.key)); assert(lock);
      for (const [label,value] of [['是',true],['否',false],['未设置',undefined]]) {
        row(lock.key).querySelectorAll('.k-segi').find(x => x.textContent === label).fire('click');
        assert.equal(c.bucketData()[lock.key], value, 'production age lock handler including explicit false/absence');
      }
      const age = row(ageKey).querySelector('input'); age.value = '100'; age.fire('input'); age.fire('change');
      assert.equal(c.nbtNumberValue(c.bucketData()[ageKey]), 100);
      const before = c.snapOf(doc); c.Store.undo(); c.Store.redo(); assert.equal(c.snapOf(doc), before);
      let previewData; const originalHero = c.heroEntity;
      c.heroEntity = (type,data) => { previewData = data; return c.h('entity'); };
      const data = c.bucketData(); c.nbtSetTyped(data, ageKey, -100, 'i'); c.Ctx.setSmart('bucket_entity_data', data);
      const previewSnap = c.snapOf(doc); c.bucketPreview(doc); assert.equal(previewData.Age,-100, 'verified case-sensitive age drives preview only');
      assert.equal(c.snapOf(doc), previewSnap); c.heroEntity = originalHero;
    }
    c.Ctx.setSmart('bucket_entity_data', c.parseSnbtUser('{Health:-5.0f,unknown:9007199254740993L}'));
    const negativeSnap = c.snapOf(doc), negative = row('Health').querySelector('input');
    assert.equal(negative.value,'-5'); negative.fire('change'); assert.equal(c.snapOf(doc),negativeSnap,'negative imported raw survives blur');
    c.Ctx.setSmart('bucket_entity_data', c.parseSnbtUser('{Health:999.0f,unknown:9007199254740993L,bytes:[B;1b],ints:[I;2],longs:[L;3L],other:2s}'));
    const imported = c.snapOf(doc), importedInput = row('Health').querySelector('input');
    assert.equal(importedInput.value, '999'); importedInput.fire('change');
    assert.equal(c.snapOf(doc), imported, 'out-of-range raw survives rendering and blur byte-for-byte');
    for (const value of ['-5','999']) {
      const input = row('Health').querySelector('input'); input.value=value; input.fire('input'); input.fire('change');
      assert.equal(c.nbtNumberValue(c.bucketData().Health),Number(value),'finite custom Float is stored independently of the release cap');
    }
    for (const value of ['invalid','NaN','Infinity','-Infinity','1e99']) {
      const r = row('Health'), input = r.querySelector('input'), previous = c.snapOf(doc);
      input.value=value; input.fire('input'); input.fire('change');
      assert.equal(input.value,value,'invalid input remains visible'); assert.equal(c.snapOf(doc),previous,'rejected control input never clamps or mutates raw');
      assert(r.querySelector('.ed-num').classList.contains('bad'));
    }
    const range = c.bucketHealthRange(meta); assert(range && range.max > 0);
    assert.equal(range.max, fact.schemaHealth.max * (meta.bucket_health_dynamic ? meta.bucket_health_size_ratio : 1));
    const good = range.max / 2, r = row('Health'), input = r.querySelector('input');
    input.value=String(good); input.fire('input'); input.fire('change');
    assert.equal(c.nbtNumberValue(c.bucketData().Health),good); assert(!r.querySelector('.ed-num').classList.contains('bad'));
    const text = c.nbtComponentText(doc,'bucket_entity_data');
    for (const token of ['9007199254740993L','[B;1b]','[I;2]','[L;3L]','2s']) assert(text.includes(token),token);
    const goodSnap = c.snapOf(doc); c.Store.undo(); c.Store.redo(); assert.equal(c.snapOf(doc),goodSnap);
    c.UI.tab='look'; c.drawTabBody(); c.UI.tab='bucket'; c.drawTabBody(); assert.equal(c.snapOf(doc),goodSnap);
    const clear = row('Health').querySelector('input'); clear.value=''; clear.fire('change');
    assert.equal(c.bucketData().Health,undefined,'absence stays absence');
    const pendingSnap=c.snapOf(doc); c.Reg.eschema[type]=false;
    const unavailable=row('Health'); assert(unavailable.textContent.includes('未提供放出上限'));
    assert(!unavailable.textContent.includes('正在读取'));
    assert.equal(c.snapOf(doc),pendingSnap,'terminal unavailable response does not alter raw');
    delete c.Reg.eschema[type];
    const pending=row('Health'), waiting=pending.querySelector('input'); waiting.value='1'; waiting.fire('input'); waiting.fire('change');
    assert.equal(c.nbtNumberValue(c.bucketData().Health),1,'custom Float remains editable before the range arrives'); assert(pending.textContent.includes('放出上限读取中'));
    c.Reg.eschema[type]={id:type,available:true,flags:[fact.schemaHealth],variants:[]};
    waiting.fire('input'); assert.equal(c.nbtNumberValue(c.bucketData().Health),1,'new host schema enables existing handler');
    if (meta.bucket_health_dynamic) {
      assert(row('Health').textContent.includes('放出上限'));
      for (const sample of fact.speciesSpawnHealth) assert(sample.max <= range.max,'UI upper bound encloses actual native species-spawn consumers');
    }
    count++;
  }
  assert(!t.sent.some(([key])=>key==='apply'||key==='apply_world'));
}
console.log('PASS production bucket controls: '+count+' real version/species facts; age-lock true/false/absent, exact lowercase preview, live Health bounds, no raw clamp on blur, unknown typed data, history/tab continuity, schema arrival; no game');
