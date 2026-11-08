// Heap usage, not process working set; do not force a collection during sampling.
export function heapBytes(text) {
  const line = text.split(/\r?\n/).find(line => /heap/i.test(line) && /\bused\s+[\d.]+\s*[KMG]/i.test(line));
  const match = line?.match(/\bused\s+([\d.]+)\s*([KMG])/i);
  if (!match) throw new Error('Unsupported GC.heap_info response; raw output retained');
  return Number(match[1]) * ({ K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2].toUpperCase()]);
}
export function summarize(samples, percent, mb) {
  if (samples.length < 2) throw new Error('Need at least two heap samples');
  const initialBytes = samples[0].bytes, finalBytes = samples.at(-1).bytes;
  const growthBytes = finalBytes - initialBytes;
  const growthPercent = initialBytes > 0 ? growthBytes / initialBytes * 100 : null;
  const meanX = samples.reduce((sum, s) => sum + s.seconds, 0) / samples.length;
  const meanY = samples.reduce((sum, s) => sum + s.bytes, 0) / samples.length;
  const denominator = samples.reduce((sum, s) => sum + (s.seconds - meanX) ** 2, 0);
  if (!denominator) throw new Error('Need distinct sample times');
  const slope = samples.reduce((sum, s) => sum + (s.seconds - meanX) * (s.bytes - meanY), 0) / denominator;
  return { status: growthPercent > percent && growthBytes > mb * 1024 ** 2 ? 'WARNING' : 'PASS',
    initialBytes, peakBytes: Math.max(...samples.map(s => s.bytes)), finalBytes,
    growthBytes, growthPercent, slopeMiBPerMinute: slope * 60 / 1024 ** 2,
    elapsedSeconds: samples.at(-1).seconds, sampleCount: samples.length,
    thresholds: { growthPercent: percent, growthMiB: mb, bothRequired: true } };
}
