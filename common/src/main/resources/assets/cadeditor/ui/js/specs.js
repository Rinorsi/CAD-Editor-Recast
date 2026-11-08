/* 组件专用表单说明书：字段怎么分段、叫什么、什么单位。数据（有哪些字段、类型、默认值）仍然来自组件的真实结构，这里只管排版与文案 */
var COND_SPEC = { compact: true, order: ["max_duration_ticks", "min_speed", "min_relative_speed"], over: {
  max_duration_ticks: { label: "有效时长", unit: "刻", hint: "从开始使用算起，这么多刻之内条件才可能触发（20 刻 = 1 秒）" },
  min_speed: { label: "自身最低速度", hint: "冲刺时你自己的速度至少要这么快" },
  min_relative_speed: { label: "相对目标最低速度", hint: "朝向目标的相对速度至少要这么快" } } };

SPEC_FORMS.blocks_attacks = { compact: true, order: [{ sec: "举盾" }, "block_delay_seconds", "disable_cooldown_scale", { sec: "减伤" }, "damage_reductions", { sec: "盾牌磨损" }, "item_damage", { sec: "例外与声音" }, "bypassed_by", "block_sound", "disabled_sound"], over: {
  block_delay_seconds: { label: "举盾延迟", unit: "秒", step: 0.05, hint: "按下使用键后，要等多少秒才开始格挡", dtxt: "默认 0 秒（立即生效）" },
  disable_cooldown_scale: { label: "破防冷却倍率", unit: "倍", step: 0.1, hint: "被斧头等破防后，盾牌冷却时间的倍数；1 与原版一致" },
  damage_reductions: { flatList: true, label: "减伤规则", hint: "可以有多条：每条规定对哪类伤害、哪个方向、减免多少；没有任何规则就等于不减伤",
    itemSummary: function (it) { var a = it.horizontal_blocking_angle === undefined ? 90 : it.horizontal_blocking_angle; var t = it.type === undefined ? "所有伤害" : (Array.isArray(it.type) ? it.type.length + " 种伤害" : String(it.type)); return "±" + a + "° · " + t + " · 减 " + (it.base || 0) + " 点 + " + Math.round((it.factor === undefined ? 1 : it.factor) * 100) + "%"; },
    itemSpec: { compact: true, order: ["horizontal_blocking_angle", "type", "base", "factor"], over: {
      horizontal_blocking_angle: { label: "阻挡范围", unit: "度", min: 0, max: 180, step: 5, hint: "正前方左右各多少度之内的攻击会被挡住" },
      type: { label: "适用伤害", dtxt: "所有伤害", hint: "不设置就是对所有伤害生效" },
      base: { label: "固定减免", unit: "点", hint: "每次先减去的固定伤害" },
      factor: { label: "按比例减免", step: 0.05, hint: "再减去被挡住伤害的这个比例；1 = 全挡" } } } },
  item_damage: { flatten: true, label: "盾牌磨损", hint: "格挡时盾牌损失多少耐久：磨损 = 基础 + 被挡伤害 × 折算", spec: { compact: true, order: ["threshold", "base", "factor"], over: {
    threshold: { label: "磨损门槛", unit: "点", hint: "低于此伤害时不损耗盾牌耐久" }, base: { label: "基础磨损", unit: "点" }, factor: { label: "伤害折算", unit: "倍", step: 0.1, hint: "磨损 = 基础磨损 + 被挡伤害 × 此倍率" } } } },
  bypassed_by: { label: "无视盾牌的伤害", hint: "这些伤害不会被格挡（例如魔法、穿透）" },
  block_sound: { label: "格挡声音" }, disabled_sound: { label: "被破防声音" } } };

SPEC_FORMS.kinetic_weapon = { compact: true, order: [{ sec: "基础" }, "contact_cooldown_ticks", "delay_ticks", "forward_movement", "damage_multiplier", { sec: "触发条件" }, "dismount_conditions", "knockback_conditions", "damage_conditions", { sec: "声音" }, "sound", "hit_sound"], over: {
  contact_cooldown_ticks: { label: "同目标命中间隔", unit: "刻", hint: "对同一个目标，两次命中之间至少隔多少刻（20 刻 = 1 秒）" },
  delay_ticks: { label: "蓄力延迟", unit: "刻", hint: "开始使用后多久才开始生效" },
  forward_movement: { label: "前冲修正", step: 0.1, hint: "冲刺时向前额外位移" },
  damage_multiplier: { label: "速度伤害倍率", step: 0.1, hint: "伤害 = 基础伤害 × 速度 × 这个倍率" },
  dismount_conditions: { label: "使目标下骑", hint: "满足条件时，把目标从坐骑上撞下来", spec: COND_SPEC },
  knockback_conditions: { label: "击退目标", hint: "满足条件时，把目标击退", spec: COND_SPEC },
  damage_conditions: { label: "造成伤害", hint: "满足条件时，才会造成伤害", spec: COND_SPEC },
  sound: { label: "冲刺声音" }, hit_sound: { label: "命中声音" } } };

SPEC_FORMS.piercing_weapon = { order: [{ sec: "效果" }, "deals_knockback", "dismounts", { sec: "声音" }, "sound", "hit_sound"], over: {
  deals_knockback: { label: "击退目标" }, dismounts: { label: "使目标下骑" }, sound: { label: "攻击声音" }, hit_sound: { label: "命中声音" } } };
