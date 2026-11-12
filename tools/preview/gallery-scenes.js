/* Offline gallery fixtures. These open the actual editor forms with demo data;
   they never call apply or write to a game world. Entity scenes use the real 2D
   preview mode because the offline renderer cannot render Minecraft entities. */
function galleryScene(name) {
  if (name === 'book-editor') {
    UI.geom = UI.geom || {};
    UI.geom.detail = {x:40,y:25,w:760,h:510};
    openDetail({key:'writableBook',cid:'writable_book_content',title:I18n.t('cadeditor.ui.cards3.82ebdbb220')});
    return;
  }
  if (['sign-editor', 'mob-editor', 'villager-trades', 'spawner-editor'].indexOf(name) < 0) return;
  Reg.ingest('registry.meta', {version: 1});
  var blockSlot = {kind:'block',dim:'minecraft:overworld',x:12,y:64,z:-3,token:'gallery-demo'};
  var entitySlot = {kind:'entity',dim:'minecraft:overworld',uuid:'00000000-0000-0000-0000-000000000001',id:5,token:'gallery-demo'};
  function stack(id, count, comps) { return {id:'minecraft:'+id,count:count||1,comps:comps||{},removed:{}}; }
  var world;
  if (name === 'sign-editor') {
    world = {kind:'block',type:'minecraft:sign',block:'minecraft:oak_sign',slot:blockSlot,
      block_state:{rotation:'8',waterlogged:'false'},revision:'gallery-demo',canUndo:false,
      snbt:'{id:"minecraft:sign",x:12,y:64,z:-3,is_waxed:0b}',nbt:{},views:{sign:{
        value:{front_text:{messages:[
          {text:'Starlight Workshop',color:'gold',bold:true},
          {text:'Welcome, traveler!',color:'aqua'},
          {text:'Tools, potions & books',color:'light_purple'},
          {text:'Open for business',color:'green'}],color:'black',has_glowing_text:true},
          back_text:{messages:['','','',''],color:'black',has_glowing_text:false},is_waxed:false},
        snbt:'{}',schema:{fields:{front_text:{messages_length:4},back_text:{messages_length:4},is_waxed:{}}}}}};
    WE.tab='view';
  } else if (name === 'mob-editor') {
    UI.heroView='2d';
    world = {kind:'entity',type:'minecraft:donkey',slot:entitySlot,revision:'gallery-demo',canUndo:false,
      snbt:'{id:"minecraft:donkey",Tame:1b,Health:25.0f}',nbt:{Health:25},schema:{},views:{
        horse:{Tame:true,Temper:40,Owner:'00000000-0000-0000-0000-000000000002',
          players:[{uuid:'00000000-0000-0000-0000-000000000002',name:'Rinorsi'}],available:true},
        chested:{ChestedHorse:true,capacity:15,Items:[{slot:0,stack:stack('diamond',3)},
          {slot:4,stack:stack('bread',12)},{slot:8,stack:stack('golden_carrot',8)}]}}};
    WE.tab='ents';
  } else if (name === 'villager-trades') {
    UI.heroView='2d';
    function offer(buy, sell, used, xp) {return {buy:buy,sell:sell,uses:used,maxUses:12,xp:xp,
      rewardExp:true,priceMultiplier:0.05,demand:0,specialPrice:0};}
    world = {kind:'entity',type:'minecraft:villager',slot:entitySlot,revision:'gallery-demo',canUndo:false,
      snbt:'{id:"minecraft:villager"}',nbt:{},views:{trades:{available:true,offers:[
        offer(stack('emerald',12),stack('diamond_sword',1,{custom_name:{text:'Starlight',color:'aqua',italic:false},
          enchantments:{'minecraft:sharpness':5},rarity:'epic'}),0,10),
        offer(stack('emerald',3),stack('golden_apple',1),2,5),
        offer(stack('wheat',20),stack('emerald',1),4,2)]}}};
    WE.tab='trades';
  } else {
    world = {kind:'block',type:'minecraft:mob_spawner',block:'minecraft:spawner',block_state:{},slot:blockSlot,
      revision:'gallery-demo',canUndo:false,
      snbt:'{id:"minecraft:mob_spawner",x:12,y:64,z:-3,Delay:20s,MinSpawnDelay:200s,MaxSpawnDelay:800s,SpawnCount:4s,MaxNearbyEntities:6s,RequiredPlayerRange:16s,SpawnRange:4s,SpawnData:{entity:{id:"minecraft:zombie"}}}',
      nbt:{},views:{}};
    WE.tab='spawner';
  }
  weOpen(world);
}
