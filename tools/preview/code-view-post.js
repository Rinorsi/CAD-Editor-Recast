var src = '{id:"minecraft:diamond_sword",count:1,components:{"minecraft:enchantments":{"minecraft:sharpness":5,"minecraft:unbreaking":3},"minecraft:custom_name":\'{"text":"锋芒","color":"gold","italic":false}\',"minecraft:attribute_modifiers":[{type:"minecraft:attack_damage",id:"minecraft:test",amount:2.5d,operation:"add_value",slot:"mainhand"}],"minecraft:custom_data":{flag:1b,ids:[I;1,2,3],big:9007199254740993L,tags:["a","b"],ratio:0.5f},"minecraft:damage":12}}';
var pretty = nbtPrint(nbtParse(src), true);
var a = kCode({ value: pretty, height: 250 });
var b = kCode({ value: '{\n  a: 1,\n  b: ]\n}', mode: 'view', height: 90 });
var host = h('div', { style: 'display:flex;flex-direction:column;gap:8px;padding:6px;' }, [a.el, b.el]);
openModal(modalShell('SNBT 代码视图', '预览', [host], [kBtn('关闭', closeModal)], 'wide'));
setTimeout(function () { var hs = document.querySelectorAll('.kc-fd.on'); if (hs[2]) hs[2].dispatchEvent(new Event('click')); }, 600);
