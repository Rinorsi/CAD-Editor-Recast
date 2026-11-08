import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { MCTest, clickPage, fillPage, typeText } from './lib.mjs';
import { plan, validateControls, patchWorld, Runner } from './effects.mjs';
import { parseSnbt, assertSubset } from './effects.nbt.mjs';

// A real loopback WebSocket server, with no npm install and no Minecraft process.
const requests = [], sockets = new Set();
let blockNbt = '{Items:[{Slot:0b,id:"minecraft:stick",count:1,components:{"minecraft:custom_model_data":{floats:[7.0f]}}}]}';
const server = createServer();
function send(socket, value) {
  const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  const head = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  socket.write(Buffer.concat([head, body]));
}
server.on('upgrade', (request, socket) => {
  sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
  const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  let buffer = Buffer.alloc(0);
  socket.on('data', data => {
    buffer = Buffer.concat([buffer, data]);
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 15, masked = !!(buffer[1] & 128); let length = buffer[1] & 127, start = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); start = 4; }
      if (length === 127) throw new Error('Unexpected huge test frame');
      const maskStart = start; if (masked) start += 4;
      if (buffer.length < start + length) return;
      const payload = Buffer.from(buffer.subarray(start, start + length));
      if (masked) for (let i = 0; i < length; i++) payload[i] ^= buffer[maskStart + i % 4];
      buffer = buffer.subarray(start + length);
      if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (opcode !== 1) continue;
      const m = JSON.parse(payload.toString()); requests.push(m);
      assert.deepEqual(Object.keys(m).sort(), ['id', 'method', 'params']);
      if (m.method === 'timeout') continue;
      if (m.method === 'disconnect') { socket.destroy(); return; }
      if (m.method === 'malformed') { send(socket, '{broken'); continue; }
      if (m.method === 'error') { send(socket, { id: m.id, error: { code: -1, message: 'fixture rejection' } }); continue; }
      const result = m.method === 'snapshot' ? { guiWidth: 640, guiHeight: 400 } : m.method === 'block' ? { blockEntity: { nbt: blockNbt } } : m.params;
      if (m.method === 'slow') setTimeout(() => send(socket, { id: m.id, result }), 25);
      else send(socket, { id: m.id, result });
    }
  });
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `ws://127.0.0.1:${server.address().port}/`, logs = [];
let client;
try {
  client = await new MCTest(url, row => logs.push(row)).connect();
  assert.deepEqual(await client.call('status', { marker: 1 }), { marker: 1 });
  const pair = await Promise.all([client.call('slow', { order: 1 }), client.call('fast', { order: 2 })]);
  assert.deepEqual(pair, [{ order: 1 }, { order: 2 }]);
  await assert.rejects(client.call('error'), /fixture rejection/);
  await assert.rejects(client.call('timeout', {}, 30), /timeout after 30ms/);
  assert.equal(client.pending.size, 0);
  const probe = { inspect: async () => ({ x: 640, y: 400, width: 1280, height: 800, w: 100, h: 20, hit: true }) };
  await clickPage(client, probe, { selector: '.real-control' });
  assert.deepEqual(requests.at(-1).params, { x: 320, y: 200 });
  const previous = requests.length;
  await assert.rejects(clickPage(client, { inspect: async () => ({ ...await probe.inspect(), hit: false }) }, { selector: '.occluded' }), /Unclickable control.*occluded/);
  assert.equal(requests.length, previous + 1, 'unclickable controls may move the pointer but must never click/fallback');
  assert.equal(requests.at(-1).method, 'hover');
  await typeText(client, 'a:7');
  assert.deepEqual(requests.slice(-6).map(r => [r.method, r.params]), [['key', { key: 'a' }], ['type', { text: 'a' }], ['key', { key: 'semicolon' }], ['type', { text: ':' }], ['key', { key: '7' }], ['type', { text: '7' }]]);
  await assert.rejects(fillPage(client, { inspect: async () => ({ ...await probe.inspect(), value: 'lost-first-character' }) }, { selector: '.input' }, 'abc'), /Input mismatch/);
  const runner = new Runner(client, probe, '.');
  await runner.effect(plan('quick', 'custom-model')[0]);
  blockNbt = '{Items:[]}';
  await assert.rejects(runner.effect(plan('quick', 'custom-model')[0]), /expected=\[7\]/);
  assert.equal(requests.at(-1).method, 'block');
  assertSubset(parseSnbt('{a:1b,b:[I;1,2],c:"hello"}'), { a: 1, b: [1, 2], c: 'hello' });
  assert.throws(() => parseSnbt('{a:9007199254740993L}'), /Unsupported SNBT/);
  assert.throws(() => parseSnbt('{a:1} trailing'), /Unsupported SNBT/);
  await assert.rejects(client.call('disconnect'), /connection (closed|error)/); client.close();
  client = await new MCTest(url).connect(); await assert.rejects(client.call('malformed'), /Malformed MCTest JSON/);
  const quick = plan('quick'), full = plan('full');
  assert.equal(quick.length, 32); assert.equal(new Set(quick.flatMap(c => c.components)).size, 25);
  assert.equal(new Set(full.flatMap(c => c.components)).size, 107);
  validateControls(full); assert.throws(() => plan('quick', 'missing-case'), /Unknown case/);
  assert.equal(patchWorld('{ Health: 10.0f, UUID:[I;1,2,3,4] }', { replace: { pattern: '(Health\\s*:\\s*)[0-9.fFdD]+', value: '$16.0f' } }), '{Health:6.0f,UUID:[I;1,2,3,4]}');
  assert.equal(patchWorld('{ NoAI:1b }', { insert: 'CustomName:"EffectsPig"' }), '{NoAI:1b,CustomName:"EffectsPig"}');
  assert.ok(logs.some(r => r.error?.includes('timeout')));
  console.log(`PASS fake MCTest WebSocket: ${requests.length} requests; framing, correlation, timeout, remote error, malformed JSON, disconnect, GUI scaling, click refusal, paired typing, input readback, plans and NBT preservation`);
} finally {
  client?.close(); for (const socket of sockets) socket.destroy(); server.close();
}
