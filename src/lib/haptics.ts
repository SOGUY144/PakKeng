/**
 * แรงสั่น (เสริมเท่านั้น · progressive enhancement)
 *
 * - ใช้ `navigator.vibrate` เมื่อเบราว์เซอร์มีให้ใช้ — การมีคำสั่งนี้ไม่ได้แปลว่าเครื่องมีมอเตอร์สั่นจริง
 *   (iPhone/iPad และคอมส่วนใหญ่ไม่สั่น) จึงไม่มีอะไรในเกมที่อาศัยแรงสั่นอย่างเดียว ภาพและข้อความยังบอกครบเหมือนเดิม
 * - รูปแบบสั้นและตายตัว: แตะเลือก 10 ms · ลองพูดสำเร็จ 18 ms · ประตู/รางวัล [20, 35, 35] —
 *   ไม่ขึ้นกับความดัง ค่าเสียงจมูก/ปาก หรือคะแนนใด ๆ
 * - ไม่สั่นเมื่อ: ปิดในมุมผู้ใหญ่ · ไม่รองรับ · ยังไม่มีการแตะหน้าจอ · หน้าซ่อนอยู่ · พัก · เกมกำลังฟังไมค์ ·
 *   กำลังเล่นเสียงตัวอย่าง · สัญญาณใช้ไม่ได้ (หลุด/ค้าง/ช่องหาย/ล้น) · เหตุการณ์เดิมซ้ำ (key เดิม) · ยังสั่นอันก่อนอยู่ (ไม่มีคิว)
 *   ไม่มีแรงสั่นสำหรับความเงียบ เสียงที่ใช้ไม่ได้ หรือการข้าม — ไม่ใช่บทลงโทษ
 * - หลังสั่น เกมต้องปิดไมค์ต่ออีก `HAPTIC_GUARD_MS` แล้วรอเฟรมเงียบก่อนฟังใหม่ (`holdUntil` ของตรรกะเกม)
 *   เพื่อไม่ให้แรงสั่น/เสียงมอเตอร์รั่วเข้าเป็นการลองพูด — ยังต้องลองกับฮาร์ดแวร์จริง
 * - ยกเลิกทันที (`vibrate(0)`) เมื่อปิดค่า พัก หน้าซ่อน ออกจากหน้า หรือปิดเกม
 */

export type HapticKind = "tap" | "usable" | "reward";

/** Fixed patterns in ms (vibrate, pause, vibrate …). Nothing scales them. */
export const HAPTIC_PATTERNS: Readonly<Record<HapticKind, readonly number[]>> = {
  tap: [10],
  usable: [18],
  reward: [20, 35, 35],
};

/** The mics stay closed this long after a pattern ends (motor ring-down + device delay), then listening waits for silence. */
export const HAPTIC_GUARD_MS = 250;

export function patternMs(kind: HapticKind): number {
  return HAPTIC_PATTERNS[kind].reduce((a, b) => a + b, 0);
}

/** How long after a buzz starts the game must keep ignoring the mics. */
export function quietMs(kind: HapticKind): number {
  return patternMs(kind) + HAPTIC_GUARD_MS;
}

export type HapticPref = "on" | "off";

/** What the game says about this moment; any of these blocks the buzz. */
export interface HapticMoment {
  /** The mics are open for the child's turn, or an attempt is being collected. */
  listening?: boolean;
  /** An example word, a reply or another sound is playing. */
  playing?: boolean;
  paused?: boolean;
  /** The live signal right now: stale / disconnected / missing channel (invalid) or clipping blocks the buzz. */
  signal?: { valid: boolean; clipping?: boolean } | null;
  /** One key per real event (round + event + index): a key that already buzzed never buzzes again. */
  key?: string;
}

export type HapticBlock =
  | "off"
  | "unsupported"
  | "inactive"
  | "hidden"
  | "paused"
  | "listening"
  | "playing"
  | "signal"
  | "duplicate"
  | "busy"
  | "failed";

export type HapticResult = { fired: true; holdUntil: number } | { fired: false; reason: HapticBlock };

/** Everything the service touches outside itself (the browser, or stubs in tests). */
export interface HapticsEnv {
  vibrate: ((pattern: number | number[]) => boolean) | null;
  /** The page is visible (not a background tab / locked screen). */
  visible: () => boolean;
  /** The user has tapped or pressed a key on this page (browsers ignore vibration before that). */
  activated: () => boolean;
  now: () => number;
  load: () => string | null;
  save: (value: string) => void;
}

const KEY = "nasal-trainer-demo:haptics";
const KEYS_KEPT = 200;

export class Haptics {
  private readonly env: HapticsEnv;
  private stored: HapticPref | null;
  private busyUntil = -Infinity;
  private seen = new Set<string>();
  private listeners = new Set<() => void>();
  /** Last outcome (QA and tests read it; the game never does). */
  last: HapticResult | null = null;

  constructor(env: HapticsEnv) {
    this.env = env;
    const v = safe(() => env.load(), null);
    this.stored = v === "on" || v === "off" ? v : null;
  }

  /** The browser offers the vibration call. This does not prove the device can vibrate. */
  get supported(): boolean {
    return this.env.vibrate !== null;
  }

  /** Saved choice, or on by default only where the browser offers vibration. */
  get pref(): HapticPref {
    return this.stored ?? (this.supported ? "on" : "off");
  }

  get enabled(): boolean {
    return this.supported && this.pref === "on";
  }

  setPref(p: HapticPref): void {
    this.stored = p;
    safe(() => this.env.save(p), undefined);
    if (p === "off") this.cancel();
    this.listeners.forEach((l) => l());
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /**
   * Buzz once for a real, finished event. Returns until when the game must keep its mics closed, or why nothing played.
   * Only call it after the voice segment has closed (feedback phase) — `listening: true` is refused.
   */
  buzz(kind: HapticKind, m: HapticMoment = {}): HapticResult {
    // an event is considered once, whatever happens to it: a re-render or a repeated call can never buzz it later
    if (m.key !== undefined) {
      if (this.seen.has(m.key)) return this.done("duplicate");
      this.remember(m.key);
    }
    const r = this.check(m);
    if (r) return this.done(r);
    const now = this.env.now();
    if (now < this.busyUntil) return this.done("busy");
    const ok = safe(() => (this.env.vibrate as (p: number[]) => boolean)([...HAPTIC_PATTERNS[kind]]), false);
    if (!ok) return this.done("failed");
    this.busyUntil = now + patternMs(kind);
    this.last = { fired: true, holdUntil: now + quietMs(kind) };
    return this.last;
  }

  /** "ลองสั่น" in the adult corner: one reward pattern, nothing else (no progress, no rewards). */
  test(): HapticResult {
    return this.buzz("reward", {});
  }

  /** Stop a pattern that may still be running (pause, hidden page, leaving the screen, setting off). */
  cancel(): void {
    this.busyUntil = -Infinity;
    if (!this.env.vibrate) return;
    safe(() => (this.env.vibrate as (p: number) => boolean)(0), false);
  }

  /** Page hidden (tab switch, screen lock): cancel; nothing is replayed when it comes back. */
  handleHidden(): void {
    if (!safe(() => this.env.visible(), true)) this.cancel();
  }

  private check(m: HapticMoment): HapticBlock | null {
    if (!this.supported) return "unsupported";
    if (this.pref !== "on") return "off";
    if (!safe(() => this.env.activated(), true)) return "inactive";
    if (!safe(() => this.env.visible(), true)) return "hidden";
    if (m.paused) return "paused";
    if (m.playing) return "playing";
    if (m.listening) return "listening";
    if (m.signal && (!m.signal.valid || m.signal.clipping)) return "signal";
    return null;
  }

  private done(reason: HapticBlock): HapticResult {
    this.last = { fired: false, reason };
    return this.last;
  }

  private remember(key: string): void {
    this.seen.add(key);
    if (this.seen.size > KEYS_KEPT) {
      const first = this.seen.values().next().value;
      if (first !== undefined) this.seen.delete(first);
    }
  }
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

/** The real browser, read lazily and defensively (no window in tests / server rendering). */
function browserEnv(): HapticsEnv {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }) : null;
  const vib = nav && typeof nav.vibrate === "function" ? (p: number | number[]) => nav.vibrate(p) : null;
  return {
    vibrate: vib,
    visible: () => typeof document === "undefined" || document.visibilityState === "visible",
    activated: () => nav?.userActivation?.hasBeenActive ?? true,
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    load: () => localStorage.getItem(KEY),
    save: (v) => localStorage.setItem(KEY, v),
  };
}

export const haptics = new Haptics(browserEnv());

/** Call once at startup: a hidden page or leaving it cancels any pattern still running. */
export function initHaptics(): void {
  if (typeof document === "undefined") return;
  document.addEventListener("visibilitychange", () => haptics.handleHidden());
  window.addEventListener("pagehide", () => haptics.cancel());
}
