// 生物叫声试听：entity_info 里有 sounds 才出按钮；点按钮走 sound_preview 通道；entity_info 晚到时容器会被补上。
const assert = require('node:assert/strict');
const H = require('./lib/ui-harness.cjs');
const t = H.create({ data: { hostAudio: true } }), c = t.c, sent = t.sent;
c.snd = () => {}; c.Reg.meta = {};
const info = { 'minecraft:pig': { sounds: { ambient: 'minecraft:entity.pig.ambient', hurt: 'minecraft:entity.pig.hurt', death: 'minecraft:entity.pig.death' } },
  'minecraft:armor_stand': {}, 'minecraft:cat': { sounds: { ambient: 'minecraft:entity.cat.ambient', hurt: null, death: 'minecraft:entity.cat.death' } } };
c.Reg.live = () => true;
c.Reg.entityInfo = (id) => info[c.Reg.full(id)] === undefined ? null : info[c.Reg.full(id)];
const qa = (el, sel) => el.querySelectorAll(sel);

// ---- 三个按钮：叫声 / 受伤 / 死亡；点一下发 sound_preview toggle，带真实声音 ID
{
  const row = c.mobSoundRow('minecraft:pig');
  assert.equal(qa(row, '.k-snd').length, 3); assert.ok(/叫声/.test(row.textContent) && /受伤/.test(row.textContent) && /死亡/.test(row.textContent));
  qa(row, '.k-mini')[0].fire('click');
  const m = sent.filter(s => s[0] === 'sound_preview').pop()[1];
  assert.equal(m.action, 'toggle'); assert.equal(m.id, 'minecraft:entity.pig.ambient');
}
// ---- 没有的声音不画按钮；没有 sounds 的实体（盔甲架）容器是空的
{
  assert.equal(qa(c.mobSoundRow('minecraft:cat'), '.k-snd').length, 2, '猫没有受伤声就只画两个');
  assert.equal(qa(c.mobSoundRow('minecraft:armor_stand'), '.k-snd').length, 0);
  assert.equal(c.mobSoundRow(''), null, '没选生物不画');
}
// ---- entity_info 晚到：先是空容器，到了再补
{
  delete info['minecraft:wolf']; const row = c.mobSoundRow('minecraft:wolf'); t.root.appendChild(row);
  assert.equal(qa(row, '.k-snd').length, 0);
  info['minecraft:wolf'] = { sounds: { ambient: 'minecraft:entity.wolf.ambient' } }; c.Reg.fire('entity_info'); c.Reg.flush();
  assert.equal(qa(row, '.k-snd').length, 1, '到了之后补上');
}
console.log('PASS mob sounds: buttons from entity_info.sounds, toggle via sound_preview, late info fills the box.');
