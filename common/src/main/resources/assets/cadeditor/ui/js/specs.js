/* 组件专用表单说明书：字段怎么分段、叫什么、什么单位。数据（有哪些字段、类型、默认值）仍然来自组件的真实结构，这里只管排版与文案 */
var COND_SPEC = { compact: true, order: ["max_duration_ticks", "min_speed", "min_relative_speed"], over: {
  max_duration_ticks: { label: I18n.t("cadeditor.ui.specs.39c467a1ea"), unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), hint: I18n.t("cadeditor.ui.specs.518dae96c1") },
  min_speed: { label: I18n.t("cadeditor.ui.specs.51556c3a4e"), hint: I18n.t("cadeditor.ui.specs.7a096ee6f7") },
  min_relative_speed: { label: I18n.t("cadeditor.ui.specs.38f40128a4"), hint: I18n.t("cadeditor.ui.specs.6ed005d70b") } } };

SPEC_FORMS.blocks_attacks = { compact: true, order: [{ sec: I18n.t("cadeditor.ui.cards3.7ee0dbbb0d") }, "block_delay_seconds", "disable_cooldown_scale", { sec: I18n.t("cadeditor.ui.specs.74bc91c57e") }, "damage_reductions", { sec: I18n.t("cadeditor.ui.specs.1d13703770") }, "item_damage", { sec: I18n.t("cadeditor.ui.specs.34e6b3ad9e") }, "bypassed_by", "block_sound", "disabled_sound"], over: {
  block_delay_seconds: { label: I18n.t("cadeditor.ui.specs.82c57e0647"), unit: I18n.t("cadeditor.ui.cards2.9dcdc2b289"), step: 0.05, hint: I18n.t("cadeditor.ui.specs.41ccd54924"), dtxt: I18n.t("cadeditor.ui.specs.70f75146e8") },
  disable_cooldown_scale: { label: I18n.t("cadeditor.ui.specs.6002282f62"), unit: I18n.t("cadeditor.ui.cards2.16729fb40a"), step: 0.1, hint: I18n.t("cadeditor.ui.specs.7993e07d02") },
  damage_reductions: { flatList: true, label: I18n.t("cadeditor.ui.specs.0dfccca241"), hint: I18n.t("cadeditor.ui.specs.8fa5842eaf"),
    itemSummary: function (it) { var a = it.horizontal_blocking_angle === undefined ? 90 : it.horizontal_blocking_angle; var t = it.type === undefined ? I18n.t("cadeditor.ui.specs.304c5353c8") : (Array.isArray(it.type) ? I18n.t("cadeditor.ui.forms.fa4aa71989", (it.type.length)) : String(it.type)); return I18n.t("cadeditor.ui.specs.51b34ce32d", (a), (t), (it.base || 0), (Math.round((it.factor === undefined ? 1 : it.factor) * 100))); },
    itemSpec: { compact: true, order: ["horizontal_blocking_angle", "type", "base", "factor"], over: {
      horizontal_blocking_angle: { label: I18n.t("cadeditor.ui.specs.1853231397"), unit: I18n.t("cadeditor.ui.specs.e24a9725df"), min: 0, max: 180, step: 5, hint: I18n.t("cadeditor.ui.specs.223b53f29a") },
      type: { label: I18n.t("cadeditor.ui.specs.49b243aee8"), dtxt: I18n.t("cadeditor.ui.specs.304c5353c8"), hint: I18n.t("cadeditor.ui.specs.037b21bf84") },
      base: { label: I18n.t("cadeditor.ui.specs.c3aa95d538"), unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), hint: I18n.t("cadeditor.ui.specs.eaf98e651b") },
      factor: { label: I18n.t("cadeditor.ui.specs.d545b92896"), step: 0.05, hint: I18n.t("cadeditor.ui.specs.5ca39a1ead") } } } },
  item_damage: { flatten: true, label: I18n.t("cadeditor.ui.specs.1d13703770"), hint: I18n.t("cadeditor.ui.specs.20f780805c"), spec: { compact: true, order: ["threshold", "base", "factor"], over: {
    threshold: { label: I18n.t("cadeditor.ui.specs.1b14e1426c"), unit: I18n.t("cadeditor.ui.cards2.08dddeac13"), hint: I18n.t("cadeditor.ui.specs.e34b64fe1a") }, base: { label: I18n.t("cadeditor.ui.specs.3578b73608"), unit: I18n.t("cadeditor.ui.cards2.08dddeac13") }, factor: { label: I18n.t("cadeditor.ui.specs.96d826dc37"), unit: I18n.t("cadeditor.ui.cards2.16729fb40a"), step: 0.1, hint: I18n.t("cadeditor.ui.specs.c81731bfd5") } } } },
  bypassed_by: { label: I18n.t("cadeditor.ui.specs.dbce6844e6"), hint: I18n.t("cadeditor.ui.specs.3ec8bbc46e") },
  block_sound: { label: I18n.t("cadeditor.ui.specs.281fcebfdc") }, disabled_sound: { label: I18n.t("cadeditor.ui.specs.993dc0fc6e") } } };

SPEC_FORMS.kinetic_weapon = { compact: true, order: [{ sec: I18n.t("cadeditor.ui.detail.89e5e14c8d") }, "contact_cooldown_ticks", "delay_ticks", "forward_movement", "damage_multiplier", { sec: I18n.t("cadeditor.ui.specs.c386c341ca") }, "dismount_conditions", "knockback_conditions", "damage_conditions", { sec: I18n.t("cadeditor.ui.cards3.473400815c") }, "sound", "hit_sound"], over: {
  contact_cooldown_ticks: { label: I18n.t("cadeditor.ui.specs.5e190f7574"), unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), hint: I18n.t("cadeditor.ui.specs.6bacfb6439") },
  delay_ticks: { label: I18n.t("cadeditor.ui.specs.9cd442205f"), unit: I18n.t("cadeditor.ui.cards2.3ccf035260"), hint: I18n.t("cadeditor.ui.specs.dea7df85c0") },
  forward_movement: { label: I18n.t("cadeditor.ui.specs.9bcc0bfa89"), step: 0.1, hint: I18n.t("cadeditor.ui.specs.3bddcb5dc2") },
  damage_multiplier: { label: I18n.t("cadeditor.ui.specs.63ec4d8a1e"), step: 0.1, hint: I18n.t("cadeditor.ui.specs.b7dff491a1") },
  dismount_conditions: { label: I18n.t("cadeditor.ui.specs.08b178ceec"), hint: I18n.t("cadeditor.ui.specs.a7296ab466"), spec: COND_SPEC },
  knockback_conditions: { label: I18n.t("cadeditor.ui.specs.ffb1e5300a"), hint: I18n.t("cadeditor.ui.specs.5368316149"), spec: COND_SPEC },
  damage_conditions: { label: I18n.t("cadeditor.ui.specs.770efa8bbf"), hint: I18n.t("cadeditor.ui.specs.f014fd03ad"), spec: COND_SPEC },
  sound: { label: I18n.t("cadeditor.ui.specs.c70f2443bc") }, hit_sound: { label: I18n.t("cadeditor.ui.specs.b46fa8c8f8") } } };

SPEC_FORMS.piercing_weapon = { order: [{ sec: I18n.t("cadeditor.ui.picker.86a00cf742") }, "deals_knockback", "dismounts", { sec: I18n.t("cadeditor.ui.cards3.473400815c") }, "sound", "hit_sound"], over: {
  deals_knockback: { label: I18n.t("cadeditor.ui.specs.ffb1e5300a") }, dismounts: { label: I18n.t("cadeditor.ui.specs.08b178ceec") }, sound: { label: I18n.t("cadeditor.ui.specs.fcfe359a8e") }, hit_sound: { label: I18n.t("cadeditor.ui.specs.b46fa8c8f8") } } };
