var src = nbtPrint(nbtParse('{id:"minecraft:diamond_sword",count:1,components:{"minecraft:enchantments":{"minecraft:sharpness":5,"minecraft:unbreaking":3},"minecraft:damage":12,flag:1b,ids:[I;1,2,3]}}'), true);
var a = kCode({ value: src, height: 200 });
openModal(modalShell('SNBT 代码视图', '', [h('div', { style: 'padding:6px;' }, [a.el])], [kBtn('关闭', closeModal)], 'wide'));
setTimeout(function () { var r = document.querySelectorAll('.kc-r'); if (r[4]) r[4].dispatchEvent(new Event('click')); }, 500);
