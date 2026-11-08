/* 提示的共用零件：页面里的 toast()（screens.js）和独立提示页 toast.html 都用它，等级对应的图标和声音只在这里定义。
   level：info / ok / warn / error */
function tkIcon(level) { return level === 'error' || level === 'warn' ? 'warning' : level === 'ok' ? 'check' : 'info'; }
/* 声音：[事件 ID, 音量, 音调]；info / warn 没有声音 */
function tkSound(level) { return level === 'error' ? ['minecraft:block.note_block.bass', 0.6, 0.7] : level === 'ok' ? ['minecraft:entity.experience_orb.pickup', 0.35, 1.3] : null; }
