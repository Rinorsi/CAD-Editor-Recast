/* 生物叫声试听：叫声 / 受伤 / 死亡。声音 ID 来自游戏里这个生物默认实例的真实声音方法（entity_info.sounds），
   试听走和物品声音组件同一条宿主通道（SoundPreview）。entity_info 还没到时先放一个空容器，到了再统一填。 */
var MOB_SOUND_KINDS = [['ambient', '叫声'], ['hurt', '受伤'], ['death', '死亡']];
function mobSoundFill(box) {
  var id = box.getAttribute('data-ent'), info = id ? Reg.entityInfo(id) : false, s = info && info.sounds;
  clear(box);
  if (!s) return;
  MOB_SOUND_KINDS.forEach(function (k) {
    var sid = s[k[0]]; if (!sid) return;
    box.appendChild(h('div', { class: 'k-snd', title: sid }, [SoundPreview.button(sid, function () { SoundPreview.toggle(sid); }), h('span', { class: 'k-sub', text: k[1] })]));
  });
}
/* 返回一个容器（可能暂时是空的）；没有实体类型时返回 null */
function mobSoundRow(typeId) {
  if (!typeId) return null;
  var box = h('div', { class: 'ed-sounds', 'data-ent': Reg.full(typeId) });
  mobSoundFill(box);
  return box;
}
Reg.on(function (kind, kinds) {
  if ((kinds || [kind]).indexOf('entity_info') < 0) return;
  Array.prototype.forEach.call(document.querySelectorAll('.ed-sounds'), mobSoundFill);
});
