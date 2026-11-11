import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, levelUsable, type Attempt } from "./common";

/** Legs in one round of the route (one word each, plan order). */
export const ROUTE_LEGS = 6;
/** How long a whole leg takes when the bunny runs it without the voice (skip). The game is not listening meanwhile. */
export const LEG_MS = 1700;
/** Shortest finishing run after a word (the voice may already have carried the bunny most of the way). */
const LEG_MIN_MS = 500;
/**
 * While the child speaks the bunny runs at once: about half a leg in the first second, slowing as it nears DASH_MAX
 * (it keeps moving while the voice goes on, but only a finished, usable word takes it to the flag).
 */
export const DASH_MAX = 0.8;
const DASH_RATE = 1.0;
/**
 * The cloud friend chases from behind (0 = right behind … 1 = far back). Purely playful: quiet time lets it creep
 * closer, running pulls away, it never catches the bunny and nothing is ever lost.
 */
export const GAP_START = 0.45;
export const GAP_MIN = 0.12;
const GAP_CLOSE_PER_S = 0.06;
const GAP_OPEN_PER_S = 0.45;

export type RouteEvent = CallEvent | { type: "leave"; to: number } | { type: "arrive"; at: number } | { type: "finish" };

/**
 * เกมวิ่งแบบเลือกทาง: รอบหนึ่งมี ROUTE_LEGS ช่วง แต่ละช่วงใช้คำหนึ่งคำตามลำดับแผน
 * - การตรวจพบเสียงใช้ตัวเดียวกับด่านเรียกเพื่อน (CallGame): เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ ไม่หักอะไร
 * - เด็กเริ่มพูด → กระต่ายเริ่มวิ่งทันที (ไปได้ไม่เกิน DASH_MAX ของช่วง) · ได้ช่วงเสียงที่ใช้ได้ → วิ่งต่อจนถึงจุดแวะ
 *   (ระหว่างวิ่งช่วงท้ายเกมไม่ฟัง) · เสียงใช้ไม่ได้ = กระต่ายหยุดตรงนั้น ไม่ถอยหลัง · ข้ามช่วงก็ไปต่อได้โดยไม่เสียอะไร
 * - เพื่อนเมฆไล่ตามแบบเล่น ๆ: เงียบแล้วค่อย ๆ เข้ามาใกล้ วิ่งแล้วถูกทิ้งห่าง ไม่มีวันจับได้ ไม่มีแพ้
 *   ความเร็วไม่ขึ้นกับค่าเสียงจมูก/ปาก (ขึ้นกับการตรวจพบเสียงที่สัญญาณใช้ได้เท่านั้น)
 * - เกณฑ์ออกปากของผู้เชี่ยวชาญใช้บันทึกให้ผู้ดูแลเท่านั้น (attempt.passed) ฉากไม่ตัดสินว่าพูดถูก/ผิด
 */
export class RouteRun {
  readonly call: CallGame;
  readonly legs: number;
  private readonly oralThreshold: number;
  /** Stops reached (0 = start, legs = destination). */
  reached = 0;
  /**
   * Finishing run from `from` to stop `to` (lasts `ms`); the game does not listen meanwhile. `elapsed` is logical time:
   * the sum of the clamped frame dt while the game runs, so a pause or a hidden tab mid-run never jumps the bunny ahead.
   */
  leg: { from: number; to: number; elapsed: number; ms: number } | null = null;
  /** Part of the current leg already run on the child's voice (0 … DASH_MAX); kept when an attempt is not usable. */
  dash = 0;
  /** Running on the child's voice right now (the game is listening while this happens). */
  dashing = false;
  /** How far behind the cloud friend is (0 … 1); see GAP_*. */
  gap = GAP_START;
  /** Stops reached, fractional while running — what the scene shows. */
  pos = 0;
  /** Usable attempts, judged on the expert's oral criterion for the caregiver's history. */
  attempts: Attempt[] = [];

  constructor(items: CallItem[], oralThreshold: number) {
    this.call = new CallGame(items);
    this.legs = items.length;
    this.oralThreshold = oralThreshold;
  }

  get done(): boolean {
    return this.reached >= this.legs && this.leg === null;
  }

  get running(): boolean {
    return this.leg !== null;
  }

  /** Stops the child reached by voice (skipped legs move the bunny too, but are not counted here). */
  get stars(): number {
    return this.call.state.stars;
  }

  update(frame: SignalFrame, now: number, dtMs: number): RouteEvent[] {
    const out: RouteEvent[] = [];
    const dt = clampDt(dtMs) / 1000;
    if (this.leg) {
      const L = this.leg;
      L.elapsed += dt * 1000;
      const k = Math.min(1, L.elapsed / L.ms);
      // eased only at the end: when the voice already got the bunny going, the run does not start from a standstill
      const e = L.from > this.reached ? 1 - (1 - k) ** 2 : k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      this.pos = L.from + (L.to - L.from) * e;
      this.gap = Math.min(1, this.gap + GAP_OPEN_PER_S * dt);
      if (k >= 1) this.arrive(out);
      return out;
    }
    if (this.done) {
      this.gap = Math.min(1, this.gap + GAP_OPEN_PER_S * dt);
      return out;
    }
    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      if (ev.first) this.leave(out);
    }
    if (this.leg) return out;

    // the child is speaking in a voice the game can use (not the example word, not clipped, not too quiet): run at once.
    // Quiet turns let the cloud creep closer; a voice the game cannot use holds the bunny and the cloud where they are.
    const c = this.call.state;
    const listening = c.phase === "turn";
    const speaking = listening && c.inAttempt && frame.valid;
    this.dashing = speaking && levelUsable(frame);
    if (this.dashing) {
      this.dash += (DASH_MAX - this.dash) * (1 - Math.exp(-DASH_RATE * dt));
      this.gap = Math.min(1, this.gap + GAP_OPEN_PER_S * dt);
    } else if (listening && !speaking) {
      this.gap = Math.max(GAP_MIN, this.gap - GAP_CLOSE_PER_S * dt);
    }
    this.pos = this.reached + this.dash;
    return out;
  }

  /** "ข้าม": run on to the next stop without the word — nothing is taken away. */
  skip(): RouteEvent[] {
    if (this.leg || this.done) return [];
    const out: RouteEvent[] = [];
    if (!this.call.heardNow) this.call.skip();
    this.leave(out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped (the distance run on it stays); a run in progress continues afterwards. */
  interrupt(): void {
    this.call.interrupt();
    this.dashing = false;
  }

  /** End early: whatever was reached so far is kept. */
  finish(): void {
    this.call.finish();
    this.leg = null;
    this.dashing = false;
  }

  private leave(out: RouteEvent[]): void {
    const to = this.reached + 1;
    const from = this.reached + this.dash;
    this.leg = { from, to, elapsed: 0, ms: Math.max(LEG_MIN_MS, LEG_MS * (to - from)) };
    this.dashing = false;
    out.push({ type: "leave", to });
  }

  private arrive(out: RouteEvent[]): void {
    const leg = this.leg;
    if (!leg) return;
    // a heard leg still sits on its word in the call game; a skipped one has already moved on
    if (this.call.heardNow) this.call.next();
    this.reached = leg.to;
    this.pos = leg.to;
    this.dash = 0;
    this.leg = null;
    out.push({ type: "arrive", at: leg.to });
    if (this.reached >= this.legs) {
      if (this.call.state.phase !== "done") this.call.finish();
      out.push({ type: "finish" });
    }
  }
}
