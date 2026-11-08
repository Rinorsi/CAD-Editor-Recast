/* 中文标签字典：槽位、稀有度、属性操作、游戏模式、维度、生物变种与开关、方块状态……全部放在这一个文件里。
   只放「界面文字」；游戏里有的名字（物品、方块、实体、附魔……）仍然来自实时注册表，不在这里手写。
   各页面里保留原来的全局名（SLOT_ZH、OPS 等）作别名，指向这里的同一个对象。
   同一概念有两种措辞的（如槽位的「头部 / 头盔」、属性操作的「加值 / 加固定值」）是界面里不同位置用的，分开存放，不要合并措辞。 */
var Labels = {};
/* SLOT_ZH */
Labels.slot = { any: '任意', mainhand: '主手', offhand: '副手', hand: '双手', head: '头部', chest: '胸部', legs: '腿部', feet: '脚部', armor: '全部盔甲', body: '身体', saddle: '鞍' };
/* SLOT_HEAD */
Labels.slotHead = { mainhand: '在主手：', offhand: '在副手：', hand: '拿在手上时：', head: '穿在头部：', chest: '穿在身上：', legs: '穿在腿上：', feet: '穿在脚上：', armor: '穿着时：', body: '穿在身体：', saddle: '作为鞍时：', any: '生效时：' };
/* WP_EQ */
Labels.slotEquip = { head: '头盔', chest: '胸甲', legs: '护腿', feet: '靴子', offhand: '副手', body: '身体', saddle: '鞍', mainhand: '主手' };
/* ES_SLOT */
Labels.slotGear = { mainhand: ['主手', 'sword'], offhand: ['副手', 'shield'], head: ['头部', 'helmet'], chest: ['胸部', 'chestplate'], legs: ['腿部', 'leggings'], feet: ['脚部', 'boots'], body: ['身体', 'shield'], saddle: ['鞍', 'cart'] };
/* EQ_SLOTS */
Labels.slotChoices = [{ v: 'head', label: '头部', sub: '头盔', icon: function () { return uiIcon('helmet', 20); } }, { v: 'chest', label: '胸部', sub: '胸甲', icon: function () { return uiIcon('chestplate', 20); } }, { v: 'legs', label: '腿部', sub: '护腿', icon: function () { return uiIcon('leggings', 20); } }, { v: 'feet', label: '脚部', sub: '靴子', icon: function () { return uiIcon('boots', 20); } }, { v: 'offhand', label: '副手', sub: '', icon: function () { return uiIcon('shield', 20); } }, { v: 'body', label: '身体', sub: '马铠等', icon: function () { return uiIcon('paw', 20); } }, { v: 'saddle', label: '鞍', sub: '', icon: function () { return uiIcon('cart', 20); } }, { v: 'mainhand', label: '主手', sub: '', icon: function () { return uiIcon('sword', 20); } }];
/* ATTR_SLOT_ICON */
Labels.slotIcon = { mainhand: 'sword', offhand: 'shield', hand: 'sword', head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots', armor: 'chestplate', body: 'paw', saddle: 'cart', any: 'grid' };
/* PIECE_ID */
Labels.armorPiece = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
/* RARITY */
Labels.rarity = [{ v: 'common', label: '普通', title: '白色名称' }, { v: 'uncommon', label: '优秀', title: '黄色名称' }, { v: 'rare', label: '稀有', title: '青色名称' }, { v: 'epic', label: '史诗', title: '粉紫色名称' }];
/* OPS */
Labels.opShort = [{ v: 'add_value', label: '加值', title: 'add_value：直接加上数值' }, { v: 'add_multiplied_base', label: '基础乘', title: 'add_multiplied_base：按基础值的比例相加' }, { v: 'add_multiplied_total', label: '总乘', title: 'add_multiplied_total：在最终值上乘算' }];
/* OPMODES */
Labels.opLong = [{ v: 'add_value', label: '加固定值', title: '直接加上这个数' }, { v: 'add_multiplied_base', label: '加比例', title: '按基础值的比例增加，如 +10%' }, { v: 'add_multiplied_total', label: '总乘比例', title: '最后整体乘以 (1+比例)' }];
/* WP_MODE */
Labels.mode = { survival: '生存', creative: '创造', adventure: '冒险', spectator: '旁观' };
/* WE_DIM */
Labels.dim = { 'minecraft:overworld': '主世界', 'minecraft:the_nether': '下界', 'minecraft:the_end': '末地' };
/* ES_VARIANT */
Labels.entVariant = { variant: '品种', sound_variant: '叫声', collar: '项圈颜色', color: '羊毛颜色', markings: '斑纹', strength: '力量', size: '大小',
  profession: '职业', level: '等级', pattern: '图案', base_color: '主体颜色', pattern_color: '图案颜色' };
/* ES_FLAG */
Labels.entFlag = { CustomName: ['名字', '头顶显示的名字'], CustomNameVisible: ['总是显示名字', '不用准星对着也显示'], Health: ['生命值', ''],
  Age: ['幼年', '生成为幼年个体'], IsBaby: ['幼年', '生成为幼年个体'], NoAI: ['没有 AI', '不会自己移动和攻击'], Silent: ['静音', '不发出声音'],
  Invulnerable: ['无敌', '不受伤害（创造模式玩家除外）'], NoGravity: ['无重力', '不会下落'], Glowing: ['发光轮廓', '隔着方块也能看到轮廓'],
  PersistenceRequired: ['不会消失', '玩家走远也不会自然消失'], ShowArms: ['显示手臂', '手臂可以拿东西'], LeftHanded: ['左撇子', '主手和副手对调'], CanPickUpLoot: ['会捡东西', '会拾取地上的物品和装备'] };
/* WE_PROP */
Labels.blockProp = { facing: '朝向', half: '上下半', type: '类型', waterlogged: '含水', open: '打开', powered: '通电', lit: '点亮', rotation: '旋转', shape: '形状', axis: '轴向', hinge: '门轴', face: '附着面',
  age: '生长阶段', level: '等级', persistent: '不会消失', distance: '距离', bites: '被吃的口数', delay: '延迟', locked: '锁定', mode: '模式', power: '红石强度', snowy: '积雪', hanging: '悬挂', honey_level: '蜂蜜等级',
  conditional: '有条件', attached: '已连接', berries: '有浆果', bottom: '有底', candles: '蜡烛数', charges: '充能', disarmed: '已解除', east: '东侧', west: '西侧', north: '北侧', south: '南侧', up: '上侧', down: '下侧',
  drag: '拖拽', eye: '有末影之眼', enabled: '启用', extended: '伸出', falling: '下落', has_book: '有书', has_record: '有唱片', inverted: '反转', instrument: '乐器', note: '音高', occupied: '有人睡', orientation: '朝向',
  signal_fire: '信号火', stage: '阶段', tilt: '倾斜', triggered: '已触发', unstable: '不稳定', vertical_direction: '垂直方向', wet: '潮湿', layers: '层数', moisture: '湿度', slot_0_occupied: '格 1 有书', slot_1_occupied: '格 2 有书',
  slot_2_occupied: '格 3 有书', slot_3_occupied: '格 4 有书', slot_4_occupied: '格 5 有书', slot_5_occupied: '格 6 有书', flower_amount: '花瓣数', segment_amount: '花簇数', cracked: '裂开', crafting: '合成中', ominous: '不祥',
  trial_spawner_state: '试炼状态', sculk_sensor_phase: '感应状态', tip: '尖端', thickness: '粗细', has_bottle_0: '瓶位 1', has_bottle_1: '瓶位 2', has_bottle_2: '瓶位 3', in_wall: '嵌入墙', short: '短', natural: '自然生成',
  pickles: '海泡菜数', eggs: '蛋数', hatch: '孵化进度', dusted: '被刷过', respawn_anchor_charges: '重生锚充能', bloom: '绽放', can_summon: '可召唤', shrieking: '尖啸', lit_candle: '点燃', cauldron_level: '水位' };
/* WE_VAL */
Labels.blockVal = { true: '是', false: '否', north: '北', south: '南', east: '东', west: '西', up: '上', down: '下', left: '左', right: '右', top: '上', bottom: '下', single: '单', double: '双', lower: '下半', upper: '上半',
  floor: '地面', wall: '墙面', ceiling: '天花板', x: 'X 轴', y: 'Y 轴', z: 'Z 轴', none: '无', low: '低', tall: '高', straight: '直', inner_left: '内左', inner_right: '内右', outer_left: '外左', outer_right: '外右',
  north_south: '南北', east_west: '东西', ascending_east: '向东上坡', ascending_west: '向西上坡', ascending_north: '向北上坡', ascending_south: '向南上坡', side: '侧面', save: '保存', load: '加载', corner: '转角', data: '数据',
  compare: '比较', subtract: '减法', inactive: '未激活', active: '激活', cooldown: '冷却', head: '头', foot: '脚', normal: '正常', sticky: '黏性', wall_hanging: '墙挂' };
/* ENCH_TAG_ZH */
Labels.enchTag = { curse: '诅咒', treasure: '宝藏', tradeable: '村民交易', non_treasure: '非宝藏', in_enchanting_table: '附魔台', on_random_loot: '随机战利品', on_traded_equipment: '交易装备', on_mob_spawn_equipment: '生物装备', double_trade_price: '交易加价', smelts_loot: '熔炼战利品' };
/* 稀有度的短名：由 Labels.rarity 派生，不再单独手写一份（原 pages.js 的 RARITY_ZH） */
Labels.rarityZh = {}; (function () { for (var i = 0; i < Labels.rarity.length; i++) Labels.rarityZh[Labels.rarity[i].v] = Labels.rarity[i].label; })();
