/**
 * เสียงประกอบสั้น ๆ ที่สังเคราะห์ด้วย Web Audio (ไม่มีไฟล์เสียงจากภายนอก จึงไม่มีเรื่อง license)
 *
 * - เบราว์เซอร์ (โดยเฉพาะ iOS/Safari) ไม่ให้เล่นเสียงจนกว่าผู้ใช้จะแตะหน้าจอ: `initSfx()` เปิด AudioContext
 *   ตอนแตะ/กดปุ่มครั้งแรก แล้วเสียงที่เกิดจากเกมทีหลัง (เช่น บอลลูนถึงที่) จึงเล่นได้
 * - เสียงจากลำโพงอาจเข้าไมค์ของอุปกรณ์: เล่นเฉพาะช่วงที่เกมไม่ฟังไมค์ และหน้าจอต้องเรียก `stopSfx()`
 *   ก่อนกลับไปฟังไมค์ (กดส่งลูกถัดไป ฟังคำ พัก ออกจากหน้า) — ช่วง settle ของเกมกันหางเสียงที่เหลือ
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let bus: GainNode | null = null;

function audioContextClass(): (new () => Ctx) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: new () => Ctx };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Create or wake the audio context. Must run inside a user gesture the first time (iOS/Safari rule). */
export function unlockSfx(): void {
  const AC = audioContextClass();
  if (!AC) return;
  try {
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null; // no audio on this device: every sound below becomes a no-op
  }
}

/** Call once at startup: every tap or key press keeps the audio context awake (iOS suspends it after interruptions). */
export function initSfx(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("pointerdown", unlockSfx, { capture: true, passive: true });
  window.addEventListener("keydown", unlockSfx, { capture: true });
}

/** C6 · E6 · G6 · C7 — a rising major arpeggio, the last note held longer. */
export const SUCCESS_NOTES = [1046.5, 1318.51, 1567.98, 2093.0] as const;
const STEP_S = 0.1;
const MASTER = 0.3;

/**
 * Schedules the soft marimba-like success chime on `out` starting at `at` (seconds, context time).
 * Returns how many oscillators were started. Pure scheduling: no global state (tested with a fake context).
 */
export function scheduleSuccessChime(c: BaseAudioContext, out: AudioNode, at: number): number {
  let started = 0;
  SUCCESS_NOTES.forEach((f, i) => {
    const t = at + i * STEP_S;
    const last = i === SUCCESS_NOTES.length - 1;
    const len = last ? 0.95 : 0.42;
    const amp = last ? 0.9 : 0.7;
    // body: sine with a fast attack and a natural decay
    started += tone(c, out, f, t, len, amp);
    // mallet "tick": the 4th partial, short (gives the marimba colour)
    started += tone(c, out, f * 3.98, t, 0.09, amp * 0.18);
  });
  // a little sparkle after the last note
  started += tone(c, out, 3135.96, at + SUCCESS_NOTES.length * STEP_S + 0.08, 0.35, 0.12);
  started += tone(c, out, 4186.01, at + SUCCESS_NOTES.length * STEP_S + 0.16, 0.3, 0.08);
  return started;
}

function tone(c: BaseAudioContext, out: AudioNode, freq: number, at: number, len: number, amp: number): number {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(amp, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  g.connect(out);
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, at);
  o.connect(g);
  o.start(at);
  o.stop(at + len + 0.02);
  return 1;
}

/** Plays the success chime (≈1.1 s) if audio is unlocked. Returns false when nothing could play. */
export function playSuccessChime(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  try {
    stopSfx();
    const b = ctx.createGain();
    b.gain.value = MASTER;
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 6500;
    b.connect(soften).connect(ctx.destination);
    bus = b;
    scheduleSuccessChime(ctx, b, ctx.currentTime + 0.02);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedules a soft "thump" of a foot on a ball: a quick downward pitch sweep (≈0.18 s). Returns oscillators started.
 * Pure scheduling (tested with a fake context).
 */
export function scheduleKickThump(c: BaseAudioContext, out: AudioNode, at: number): number {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.9, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  g.connect(out);
  const o = c.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(190, at);
  o.frequency.exponentialRampToValueAtTime(70, at + 0.16);
  o.connect(g);
  o.start(at);
  o.stop(at + 0.2);
  // a short leather "tick" on top
  return 1 + tone(c, out, 900, at, 0.04, 0.15);
}

/** Plays the kick thump (the game is not listening while the ball flies). Returns false when nothing could play. */
export function playKickThump(): boolean {
  if (!ctx || ctx.state !== "running") return false;
  try {
    stopSfx();
    const b = ctx.createGain();
    b.gain.value = MASTER;
    b.connect(ctx.destination);
    bus = b;
    scheduleKickThump(ctx, b, ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}

/** Fades out whatever sound effect is still ringing (call before the game listens to the mics again). */
export function stopSfx(): void {
  const b = bus;
  bus = null;
  if (!ctx || !b) return;
  try {
    const now = ctx.currentTime;
    b.gain.cancelScheduledValues(now);
    b.gain.setValueAtTime(b.gain.value, now);
    b.gain.linearRampToValueAtTime(0, now + 0.06);
    setTimeout(() => b.disconnect(), 120);
  } catch {
    // already gone
  }
}
