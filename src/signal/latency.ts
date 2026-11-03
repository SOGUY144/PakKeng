/**
 * Rolling record of "sample received → frame rendered" delay for the MOCK source only.
 * This is not end-to-end device latency (no hardware evidence exists yet).
 */
const SIZE = 120;
const buf: number[] = [];

export function recordRenderDelay(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  buf.push(ms);
  if (buf.length > SIZE) buf.shift();
}

export function renderDelayStats(): { p50: number; p95: number; n: number } | null {
  if (buf.length < 10) return null;
  const s = [...buf].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: at(0.5), p95: at(0.95), n: s.length };
}
