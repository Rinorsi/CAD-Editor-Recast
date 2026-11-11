import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

// Packaged-page acceptance for the native Oriel TextField used by Advanced -> Item data.
// All pointer/key events stay inside the hidden, unfocused owned backend-single client.
export async function runTextFieldDebug({out, config, request, delay}) {
 const results = []; let clipboardSaved = false;
 const save = () => writeFileSync(join(out, 'textfield-scenarios.json'), JSON.stringify(results, null, 2));
 const js = async code => {
  const r = (await request('host', 'eval', {js: '(function(){try{var v=eval(' + JSON.stringify(code) + ');return {ok:true,value:v===undefined?null:v};}catch(e){return {ok:false,error:String(e),stack:String(e.stack||"")};}})()'})).value;
  if (!r.ok) throw Error(r.error + ' ' + r.stack);
  return r.value;
 };
 async function until(check, label) {
  for (let n = 0; n < 100; n++) { if (await check()) return; await delay(150); }
  throw Error('Timed out: ' + label);
 }
 async function test(name, fn) {
  try { results.push({name, status: 'PASS', evidence: await fn()}); }
  catch (e) { results.push({name, status: 'FAIL', error: e.stack}); throw e; }
  finally { save(); }
 }
 const setValue = value => js('(function(){var t=window.__nativeTextField;if(!t||t!==document.querySelector(".kc-ta"))throw Error("textarea identity changed");t.value=' + JSON.stringify(value) + ';t.dispatchEvent(new Event("input",{bubbles:true}));t.scrollTop=0;return {value:t.value,nodeStable:t===document.querySelector(".kc-ta"),display:t.style.display,rect:t.getBoundingClientRect()};})()');
 const value = () => js('window.__nativeTextField&&window.__nativeTextField.value');
 const pointer = params => request('host', 'pagePointer', {selector: '.kc-ta', pageUnits: true, ...params});
 const key = (name, mods = {}) => request('host', 'pageKey', {key: name, ...mods});
 const type = text => request('host', 'pageType', {text});

 const before = await request('host', 'state');
 await request('host', 'operator', {name: 'LanHost', grant: true});
 await request('host', 'serverCommand', {command: 'gamemode creative LanHost'});
 await request('host', 'serverCommand', {command: 'item replace entity LanHost hotbar.0 with minecraft:paper 1'});
 await request('host', 'select', {slot: 0});
 await request('host', 'close'); await delay(250);
 await request('host', 'open');
 await until(async () => {
  const state = await request('host', 'state');
  if (!/OrielScreen|EditorScreen/.test(state.screen)) return false;
  return js('typeof Store!=="undefined"&&Store.docs.length>0');
 }, 'item editor page');
 await js('openAdvanced("snbt");true');
 await until(() => js('!!document.querySelector(".kc-ta")&&document.querySelector(".kc-ta").style.display!=="none"'), 'native SNBT textarea');
 const setup = await js('(function(){var t=document.querySelector(".kc-ta");window.__nativeTextField=t;t.style.height="150px";t.style.minHeight="150px";return {nodeStable:true,tag:t.tagName,display:t.style.display,rect:t.getBoundingClientRect(),readonly:t.readOnly===true};})()');
 assert.equal(setup.tag, 'TEXTAREA'); assert.equal(setup.readonly, false);
 await delay(250); // Allow the native textarea layout/paint before the first input or screenshot.

 try {
  await test('mouse-caret-position', async () => {
   const base = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
   await setValue(base); const leftPointer = await pointer({fromX: 18, fromY: 10});
   await delay(150); await request('host', 'screenshot', {name: 'textfield-click-caret.png'}); await type('x');
   const leftValue = await value(), left = leftValue.indexOf('x');
   await setValue(base); const rightPointer = await pointer({fromX: 90, fromY: 10}); await type('y');
   const rightValue = await value(), right = rightValue.indexOf('y');
   assert(left > 0 && left < base.length, 'left click must place an interior caret');
   assert(right > left + 4 && right < base.length, 'farther click must place a farther interior caret');
   assert(leftPointer.pressed && rightPointer.pressed, 'screen must consume both native pointer presses');
   return {base, left, right, leftValue, rightValue, leftPointer, rightPointer};
  });

  await test('cross-line-drag-selection', async () => {
   const base = 'AAAAAA\nBBBBBB\nCCCCCC\nDDDDDD'; await setValue(base);
   const drag = await pointer({fromX: 18, fromY: 10, toX: 40, toY: 38});
   await delay(150); await request('host', 'screenshot', {name: 'textfield-drag-selection.png'});
   await type('x'); const after = await value();
   assert(drag.pressed && drag.released && drag.drag, 'native drag must be consumed and released');
   assert.equal((after.match(/x/g) || []).length, 1);
   assert(after.length < base.length - 5, 'typing must replace a real cross-line selection');
   assert(after.split('\n').length < base.split('\n').length, 'selection must cross hard line breaks');
   return {before: base, after, drag};
  });

  await test('home-end-shift-selection', async () => {
   const base = 'first\nsecond-line\nthird'; await setValue(base);
   await pointer({fromX: 45, fromY: 24});
   await key('Home'); await key('End', {shift: true}); await type('X');
   const after = await value(); assert.equal(after, 'first\nX\nthird');
   return {before: base, after};
  });

  await test('arrow-shift-selection', async () => {
   await setValue('first\nsecond\nthird'); await pointer({fromX: 35, fromY: 10});
   await key('Home', {ctrl: true}); await key('ArrowDown'); await key('ArrowRight', {shift: true}); await type('X');
   assert.equal(await value(), 'first\nXecond\nthird');
   await key('z', {ctrl: true}); assert.equal(await value(), 'first\nsecond\nthird');
   return {selected: 's', replacement: 'X', undoRestored: true};
  });

  await test('native-tab-indent-history', async () => {
   const base = 'first\nsecond\nthird'; await setValue(base); await pointer({fromX: 35, fromY: 10});
   await key('a', {ctrl: true}); await key('Tab'); const indented = await value();
   assert.equal(indented, '  first\n  second\n  third');
   await key('Tab', {shift: true}); assert.equal(await value(), base);
   await key('z', {ctrl: true}); assert.equal(await value(), indented);
   await key('z', {ctrl: true}); assert.equal(await value(), base);
   await key('y', {ctrl: true}); assert.equal(await value(), indented);
   return {base, indented, shiftTabRestored: true, undoRedoRestored: true};
  });

  await test('clipboard-and-native-history', async () => {
   const beforePaste = '{id:"minecraft:paper",count:1,components:{}}';
   const pasted = '{\n  id: "minecraft:diamond",\n  count: 1,\n  components: {}\n}';
   await setValue(beforePaste); await pointer({fromX: 30, fromY: 10});
   await request('host', 'clipboardPush', {text: pasted}); clipboardSaved = true;
   await key('a', {ctrl: true}); await key('v', {ctrl: true}); await delay(500);
   const afterPaste = await value(); assert.equal(afterPaste, pasted, 'multiline paste must remain byte-for-byte and not auto-format');
   assert(await js('window.__nativeTextField===document.querySelector(".kc-ta")'), 'paste must not rebuild textarea');
   await key('z', {ctrl: true}); const undone = await value(); assert.equal(undone, beforePaste);
   await key('y', {ctrl: true}); const redone = await value(); assert.equal(redone, pasted);
   await key('a', {ctrl: true}); await key('c', {ctrl: true});
   const copied = (await request('host', 'clipboardRead')).clipboard; assert.equal(copied, pasted);
   await key('x', {ctrl: true}); assert.equal(await value(), '');
   await key('z', {ctrl: true}); assert.equal(await value(), pasted);
   await request('host', 'screenshot', {name: 'textfield-paste-redo.png'});
   return {beforePaste, pasted, afterPaste, undone, redone, copiedMatches: copied === pasted};
  });

  await test('format-only-on-explicit-click', async () => {
   const compact = '{id:"minecraft:paper",count:1,components:{"minecraft:custom_data":{a:1b,b:[I;1,2]}}}';
   await setValue(compact); await delay(500); assert.equal(await value(), compact, 'idle/input validation must not format');
   const expected = await js('kcFormat(' + JSON.stringify(compact) + ',false)');
   const marked = await js('(function(){var b=Array.prototype.slice.call(document.querySelectorAll(".kc-bar .k-btn")).filter(function(x){return x.textContent.indexOf("格式化")>=0;})[0];if(!b)throw Error("format button missing");b.id="textfield-format";return b.textContent;})()');
   const click = await request('host', 'pagePointer', {selector: '#textfield-format'}); await delay(250);
   const formatted = await value(); assert.equal(formatted, expected); assert(formatted.includes('\n'));
   return {compact, formatted, marked, click};
  });

  const after = await request('host', 'state');
  const noWrite = await js('({pending:EditorBridge.pending===null,diff:diffDoc(Store.doc()).length,nodeStable:window.__nativeTextField===document.querySelector(".kc-ta")})');
  assert(noWrite.pending && noWrite.nodeStable); assert.equal(noWrite.diff, 0); assert.equal(after.commandAttempts, before.commandAttempts);
  writeFileSync(join(out, 'textfield-result.json'), JSON.stringify({status: 'PASS', sha256: config.sha256, setup, results, noWrite, scope: 'Fabric 26.1.2 packaged backend-single; hidden/unfocused; actual Oriel screen pointer/key/type path; native textarea click placement, cross-line drag replacement, Home/End/Shift, Ctrl+A/C/X/V, undo/redo, and explicit-only formatting; no Apply or command write.'}, null, 2));
  if (config.uiInteractionDebug) {
   const {runNestedItemDebug} = await import('./nested-item-debug.mjs');
   await runNestedItemDebug({out, config, request, delay});
  }
 } finally {
  if (clipboardSaved) {
   try { await request('host', 'clipboardPop'); clipboardSaved = false; }
   catch (e) { writeFileSync(join(out, 'textfield-clipboard-restore-error.txt'), e.stack); throw e; }
  }
 }
}
