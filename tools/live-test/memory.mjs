import { writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MCTest, PageProbe, delay } from './lib.mjs';
import { heapBytes, summarize } from './memory-summary.mjs';
const exec = promisify(execFile);
const out = resolve(process.env.EDITOR_LIVE_TEST_EVIDENCE);
const minutes = Number(process.env.EDITOR_MEMORY_MINUTES || 3);
const interval = Number(process.env.EDITOR_MEMORY_INTERVAL || 5);
const percent = Number(process.env.EDITOR_MEMORY_PERCENT || 30);
const mb = Number(process.env.EDITOR_MEMORY_MB || 200);
const samples = [];
let mc, owned = false, report = { status: 'ERROR', samples };
try {
  if (!(minutes > 0 && interval > 0 && percent >= 0 && mb >= 0)) throw new Error('Invalid memory settings');
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    try { mc = await new MCTest().connect(); break; }
    catch { mc?.close(); mc = null; await delay(2000); }
  }
  if (!mc) throw new Error('MCTest did not start');
  const status = await mc.call('status');
  if (resolve(status.gameDir).toLowerCase() !== resolve(out, 'mctest-run').toLowerCase()) throw new Error('Refusing foreign MCTest client');
  if (!Number.isSafeInteger(status.pid) || status.pid <= 0) throw new Error('Invalid owned JVM PID');
  owned = true;
  writeFileSync(resolve(out, 'owned-mctest-pid.txt'), String(status.pid));
  writeFileSync(resolve(out, 'mctest-ready.json'), JSON.stringify(status, null, 2));
  await mc.call('world.create', { name: 'Editor-memory-sample', flat: true, gamemode: 'creative', cheats: true }, 180000);
  await mc.call('command', { command: 'give @s minecraft:diamond_sword' });
  await mc.call('selectSlot', { slot: 0 });
  await mc.call('keybind', { name: 'key.cadeditor.edit', action: 'tap' });
  await mc.call('waitFor', { condition: 'ticks:40' });
  const snapshot = await mc.call('snapshot');
  if (snapshot.screen?.simpleName !== 'OrielScreen') throw new Error('Editor page did not open for memory sampling');
  await new PageProbe(resolve(out, 'mctest-run'), out).inspect({ selector: '#edbody' });
  const started = Date.now();
  do {
    const { stdout } = await exec(process.env.EDITOR_MEMORY_JCMD, [String(status.pid), 'GC.heap_info'], { windowsHide: true, timeout: 15000 });
    appendFileSync(resolve(out, 'heap-info.log'), stdout + '\n');
    const sample = { seconds: (Date.now() - started) / 1000, bytes: heapBytes(stdout) };
    samples.push(sample);
    appendFileSync(resolve(out, 'memory-samples.jsonl'), JSON.stringify(sample) + '\n');
    const remaining = minutes * 60000 - (Date.now() - started);
    if (remaining <= 0) break;
    await delay(Math.min(interval * 1000, remaining));
  } while (true);
  report = { ...summarize(samples, percent, mb), pid: status.pid, requestedMinutes: minutes, intervalSeconds: interval, samples };
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  const mib = n => Number.isFinite(n) ? (n / 1024 ** 2).toFixed(2) : '不可用';
  writeFileSync(resolve(out, 'memory-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(out, 'memory-report.md'), [
    '# 客户端堆内存采样', '', '状态：' + report.status,
    '首值 / 峰值 / 末值（MiB）：' + [report.initialBytes, report.peakBytes, report.finalBytes].map(mib).join(' / '),
    '绝对增长（MiB）：' + mib(report.growthBytes),
    '增长百分比：' + (report.growthPercent?.toFixed(2) ?? '不可用') + '%',
    '线性趋势（MiB/分钟）：' + (report.slopeMiBPerMinute?.toFixed(2) ?? '不可用'),
    '样本数：' + samples.length, '警告阈值：增长 >' + percent + '% 且 >' + mb + ' MiB。',
    report.error || '', '未强制 GC；短时增长警告不能代替长期泄漏分析。',
  ].join('\n'));
  if (owned) { try { await mc.call('quit', {}, 10000); } catch {} }
  mc?.close();
}
