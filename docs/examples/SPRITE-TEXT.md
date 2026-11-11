# Sprite 文字体验

名称、说明文字等文本编辑区点「Sprite」，默认打开物品图标。右侧下拉可换图集，搜索图标 ID 后点图标即可插入；底部也能手输 Sprite ID。先点文字确定光标，选中文字时会替换选区。

下面命令供手动粘贴；本轮没有执行。适用 26.1.2 / 26.2 / 26.3，需要允许命令。

物品名显示「剑图标 PVP 练习」，描述第一行混排钻石图标和英文，第二行用原版 uniform 字体。打开物品编辑器看名称、描述和提示框；改几个字后再看图标是否保留。

~~~mcfunction
/give @s minecraft:diamond_sword[minecraft:custom_name={text:"",italic:false,extra:[{object:"atlas",atlas:"minecraft:items",sprite:"minecraft:item/diamond_sword"},{text:" PVP 练习",color:"gold",bold:true}]},minecraft:lore=[{text:"",italic:false,extra:[{object:"atlas",atlas:"minecraft:items",sprite:"minecraft:item/diamond"},{text:" Sprite + ABC 123",color:"aqua"}]},{text:"FONT ABC 123",font:"minecraft:uniform",color:"white",italic:false}]] 1
~~~

可再把名称里的 minecraft:item/diamond_sword 换成 minecraft:item/apple 看苹果图标；文本大小写原样显示。

原生精灵字形接线需要本地重新编译启动；只热刷新 JS/CSS 无法加载新增的 Java 接线。当前包未更新。
