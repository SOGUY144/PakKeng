import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, type Attempt } from "./common";

/** Balls in one round (one word each, plan order). */
export const KICK_SHOTS = 5;
/** The ball's flight after a usable word. The game does not listen meanwhile. */
export const FLIGHT_MS = 1150;
/** The goal celebration before the next ball is set up. The game does not listen meanwhile either. */
export const CHEER_MS = 1700;
/**
 * While the child speaks the kicker starts the run-up at once (a little over half of it in the first second), easing
 * towards RUNUP_MAX — only a finished, usable word makes the kick itself.
 */
export const RUNUP_MAX = 0.85;
const RUNUP_RATE = 1.4;

/**
 * Where each ball goes, fixed per shot so every round has variety without any chance involved.
 * The goalie always dives the other way (or just too late): a usable word is always a goal.
 */
export type ShotStyle = "low-left" | "high-right" | "chip" | "low-right" | "top-left";
export const SHOT_STYLES: ShotStyle[] = ["low-left", "high-right", "chip", "low-right", "top-left"];

export type KickPhase = "aim" | "flight" | "cheer" | "done";
export type ShotResult = "goal" | "skip";

export type KickEvent =
  | CallEvent
  | { type: "kick"; shot: number }
  | { type: "goal"; shot: number }
  | { type: "ready"; shot: number }
  | { type: "finish" };

/**
 * เกมยิงจุดโทษ: รอบหนึ่งมี KICK_SHOTS ลูก แต่ละลูกใช้คำหนึ่งคำตามลำดับแผน
 * - การตรวจพบเสียงใช้ตัวเดียวกับด่านเรียกเพื่อน (CallGame): เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ ไม่หักอะไร
 * - เด็กเริ่มพูด → นักเตะเริ่มวิ่งเข้าหาลูกทันที (ไม่เกิน RUNUP_MAX) · ได้ช่วงเสียงที่ใช้ได้ → เตะ ลูกลอยเข้าประตู = ประตู!
 *   ระหว่างลูกลอยและฉลอง เกมไม่ฟัง · เสียงใช้ไม่ได้ = นักเตะหยุดตรงนั้น ไม่ถอยหลัง ไม่มีลูกที่ “พลาด”
 * - ไม่มีแพ้: คำที่สัญญาณใช้ได้เข้าประตูทุกลูก ผู้รักษาประตูพุ่งผิดทางแบบตลก ๆ · ข้ามลูกได้โดยไม่เสียอะไร
 * - แรงเตะ/ทิศลูกไม่ขึ้นกับความดังหรือค่าเสียงจมูก/ปาก · เกณฑ์ออกปากของผู้เชี่ยวชาญบันทึกให้ผู้ดูแลเท่านั้น (attempt.passed)
 */
export class KickMatch {
  readonly call: CallGame;
  readonly shots: number;
  private readonly oralThreshold: number;
  phase: KickPhase = "aim";
  /** The ball being played (0-based); equals `shots` once the round is over. */
  shot = 0;
  goals = 0;
  results: (ShotResult | null)[];
  /** Kicker's run-up towards the ball (0 … RUNUP_MAX on the voice, 1 at the kick); kept when an attempt is not usable. */
  runup = 0;
  /** Running up on the child's voice right now (the game is listening while this happens). */
  charging = false;
  /** Progress of the ball's flight and of the celebration (0 … 1) — what the scene shows. */
  flightK = 0;
  cheerK = 0;
  /** Increments on every kick / goal (scene cues). */
  kickSeq = 0;
  goalSeq = 0;
  /** Usable attempts, judged on the expert's oral criterion for the caregiver's history. */
  attempts: Attempt[] = [];
  private t0 = 0;
  /** Length of the goal celebration (shorter with reduced motion; the child can also skip it). */
  private readonly cheerMs: number;

  constructor(items: CallItem[], oralThreshold: number, opts: { cheerMs?: number } = {}) {
    this.call = new CallGame(items);
    this.shots = items.length;
    this.oralThreshold = oralThreshold;
    this.results = items.map(() => null);
    this.cheerMs = opts.cheerMs ?? CHEER_MS;
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** The ball is flying or the team is celebrating: no listening, no buttons. */
  get busy(): boolean {
    return this.phase === "flight" || this.phase === "cheer";
  }

  /** Where the current (or last) ball goes. */
  get style(): ShotStyle {
    return SHOT_STYLES[Math.min(this.shot, this.shots - 1) % SHOT_STYLES.length];
  }

  /** Goals scored by voice (skipped balls are not counted). */
  get stars(): number {
    return this.goals;
  }

  update(frame: SignalFrame, now: number, dtMs: number): KickEvent[] {
    const out: KickEvent[] = [];
    if (this.phase === "done") return out;
    if (this.phase === "flight") {
      this.flightK = Math.min(1, (now - this.t0) / FLIGHT_MS);
      if (this.flightK >= 1) this.score(now, out);
      return out;
    }
    if (this.phase === "cheer") {
      this.cheerK = Math.min(1, (now - this.t0) / this.cheerMs);
      if (this.cheerK >= 1) this.nextBall(out);
      return out;
    }

    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      if (ev.first) this.kick(now, out);
    }
    if (this.phase !== "aim") return out;

    // the child is speaking (usable signal, not the example word): run up at once
    const c = this.call.state;
    this.charging = c.phase === "turn" && c.inAttempt && frame.valid;
    if (this.charging) this.runup += (RUNUP_MAX - this.runup) * (1 - Math.exp(-RUNUP_RATE * (clampDt(dtMs) / 1000)));
    return out;
  }

  /** "ข้ามลูกนี้": the next ball is set up without the word — nothing is taken away. */
  skip(): KickEvent[] {
    if (this.phase !== "aim") return [];
    const out: KickEvent[] = [];
    if (this.call.heardNow) this.call.next();
    else this.call.skip();
    this.results = this.results.map((r, i) => (i === this.shot ? "skip" : r));
    this.nextBall(out, false);
    return out;
  }

  /** "ลูกต่อไป" during the celebration: set up the next ball now (the goal is already counted). */
  skipCheer(): KickEvent[] {
    if (this.phase !== "cheer") return [];
    const out: KickEvent[] = [];
    this.nextBall(out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped (the run-up made on it stays); a ball in flight lands afterwards. */
  interrupt(): void {
    this.call.interrupt();
    this.charging = false;
  }

  /** End early: what was scored so far is kept (a ball already flying counts — its word was usable). */
  finish(): void {
    if (this.phase === "flight") {
      this.goals += 1;
      this.results = this.results.map((r, i) => (i === this.shot ? "goal" : r));
    }
    this.call.finish();
    this.phase = "done";
    this.charging = false;
  }

  private kick(now: number, out: KickEvent[]): void {
    this.phase = "flight";
    this.runup = 1;
    this.charging = false;
    this.flightK = 0;
    this.t0 = now;
    this.kickSeq += 1;
    out.push({ type: "kick", shot: this.shot });
  }

  private score(now: number, out: KickEvent[]): void {
    this.goals += 1;
    this.goalSeq += 1;
    this.results = this.results.map((r, i) => (i === this.shot ? "goal" : r));
    this.phase = "cheer";
    this.cheerK = 0;
    this.t0 = now;
    out.push({ type: "goal", shot: this.shot });
  }

  private nextBall(out: KickEvent[], fromGoal = true): void {
    // a scored ball still sits on its word in the call game; a skipped one has already moved on
    if (fromGoal && this.call.heardNow) this.call.next();
    this.shot += 1;
    this.runup = 0;
    this.flightK = 0;
    this.cheerK = 0;
    this.charging = false;
    if (this.shot >= this.shots) {
      if (this.call.state.phase !== "done") this.call.finish();
      this.phase = "done";
      out.push({ type: "finish" });
      return;
    }
    this.phase = "aim";
    out.push({ type: "ready", shot: this.shot });
  }
}
