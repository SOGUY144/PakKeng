import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import type { Attempt } from "./common";

/** Legs in one round of the route (one word each, plan order). */
export const ROUTE_LEGS = 6;
/** How long the bunny runs from one stop to the next. The game is not listening meanwhile. */
export const LEG_MS = 1700;

export type RouteEvent = CallEvent | { type: "leave"; to: number } | { type: "arrive"; at: number } | { type: "finish" };

/**
 * เกมวิ่งแบบเลือกทาง: รอบหนึ่งมี ROUTE_LEGS ช่วง แต่ละช่วงใช้คำหนึ่งคำตามลำดับแผน
 * - การตรวจพบเสียงใช้ตัวเดียวกับด่านเรียกเพื่อน (CallGame): เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ ไม่หักอะไร
 * - ได้ช่วงเสียงที่ใช้ได้ → กระต่ายวิ่งไปจุดแวะถัดไป (ระหว่างวิ่งเกมไม่ฟัง) · ข้ามช่วงก็ไปต่อได้โดยไม่เสียอะไร
 * - เกณฑ์ออกปากของผู้เชี่ยวชาญใช้บันทึกให้ผู้ดูแลเท่านั้น (attempt.passed) ฉากไม่ตัดสินว่าพูดถูก/ผิด
 */
export class RouteRun {
  readonly call: CallGame;
  readonly legs: number;
  private readonly oralThreshold: number;
  /** Stops reached (0 = start, legs = destination). */
  reached = 0;
  /** Running towards stop `to`, started at `start` (ms). */
  leg: { to: number; start: number } | null = null;
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
    if (this.leg) {
      const k = Math.min(1, (now - this.leg.start) / LEG_MS);
      this.pos = this.reached + (this.leg.to - this.reached) * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      if (k >= 1) this.arrive(out);
      return out;
    }
    if (this.done) return out;
    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      if (ev.first) this.leave(now, out);
    }
    return out;
  }

  /** "ข้าม": run on to the next stop without the word — nothing is taken away. */
  skip(now: number): RouteEvent[] {
    if (this.leg || this.done) return [];
    const out: RouteEvent[] = [];
    if (!this.call.heardNow) this.call.skip();
    this.leave(now, out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped; a run in progress simply continues afterwards. */
  interrupt(): void {
    this.call.interrupt();
  }

  /** End early: whatever was reached so far is kept. */
  finish(): void {
    this.call.finish();
    this.leg = null;
  }

  private leave(now: number, out: RouteEvent[]): void {
    const to = this.reached + 1;
    this.leg = { to, start: now };
    out.push({ type: "leave", to });
  }

  private arrive(out: RouteEvent[]): void {
    const leg = this.leg;
    if (!leg) return;
    // a heard leg still sits on its word in the call game; a skipped one has already moved on
    if (this.call.heardNow) this.call.next();
    this.reached = leg.to;
    this.pos = leg.to;
    this.leg = null;
    out.push({ type: "arrive", at: leg.to });
    if (this.reached >= this.legs) {
      if (this.call.state.phase !== "done") this.call.finish();
      out.push({ type: "finish" });
    }
  }
}
