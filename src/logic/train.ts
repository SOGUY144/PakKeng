import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, type Attempt } from "./common";

/** Legs in one round (one word each, plan order): depot → three stops → the receiver's station. */
export const TRAIN_LEGS = 4;
/** One ride to the next stop after a usable word. The game does not listen meanwhile. */
export const RIDE_MS = 1500;
/** Pulling in at the stop (a toot, the stop's flag goes up). The game does not listen meanwhile either. */
export const ARRIVE_MS = 1100;
/** "ข้ามช่วงนี้": the train rolls on to the next stop by itself — slower and quieter, nothing is counted. */
export const COAST_MS = 1800;
/** While the child speaks the engine builds steam (a pose only: it never changes the ride, and never from loudness). */
export const STEAM_MAX = 1;
const STEAM_RATE = 3;
const COOL_RATE = 2;

export type TrainPhase = "aim" | "ride" | "arrive" | "coast" | "done";
/** How a stop was reached: a ride on a usable word, or the coast of a skipped leg. */
export type LegResult = "ride" | "coast";

export type TrainEvent =
  | CallEvent
  /** A usable word: the ride to stop `stop` (1-based) starts. */
  | { type: "go"; stop: number }
  /** The ride reached `stop`; `last` = the receiver's station (the cargo is handed over). */
  | { type: "arrive"; stop: number; last: boolean }
  /** Skip: the coast to `stop` starts. */
  | { type: "coast"; stop: number }
  /** The coast reached `stop`. */
  | { type: "rolled"; stop: number; last: boolean }
  /** Listening for the word of the next leg. */
  | { type: "ready"; stop: number }
  | { type: "finish" };

/** What both views draw (3D scene and 2D track) — read from the game, never written back. */
export interface TrainView {
  /** The stop the train stands at, or has just left (0 = the depot). */
  from: number;
  /** The stop it is moving to (= `from` while standing). */
  to: number;
  /** Progress of the ride or coast (0 … 1); 0 while standing. */
  k: number;
  moving: "ride" | "coast" | null;
  /** Progress of pulling in after a ride (0 … 1); 0 otherwise. */
  arriveK: number;
  steam: number;
  speaking: boolean;
  voiced: number;
  results: readonly (LegResult | null)[];
  /** The train is at the receiver's station: the cargo has been handed over. */
  delivered: boolean;
  done: boolean;
}

export function trainView(g: TrainTrip): TrainView {
  const moving = g.phase === "ride" || g.phase === "coast" ? g.phase : null;
  return {
    from: g.at,
    to: g.to,
    k: moving ? g.moveK : 0,
    moving,
    arriveK: g.phase === "arrive" ? g.arriveK : 0,
    steam: g.steam,
    speaking: g.speaking,
    voiced: g.voiced,
    results: g.results,
    delivered: g.at >= g.legs,
    done: g.done,
  };
}

/**
 * รถไฟส่งของ: ส่งสินค้าที่เด็กเลือกไปให้ผู้รับที่สถานีปลายทาง TRAIN_LEGS ช่วง แต่ละช่วงใช้คำหนึ่งคำตามลำดับแผน
 * - ตรวจพบเสียงด้วยตัวเดียวกับด่านเรียกเพื่อน (CallGame): เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ รถจอดรอที่เดิม ไม่ถอย สินค้าไม่เสีย
 * - ช่วงเสียงที่ใช้ได้หนึ่งครั้ง = รถไฟวิ่งหนึ่งช่วง ระยะ ความเร็ว และเวลาเท่ากันทุกครั้ง: ไม่อ่านความดัง ค่าจมูก/ปาก หรือคำถูก
 *   เกณฑ์ออกปากของผู้เชี่ยวชาญบันทึกให้ผู้ดูแลเท่านั้น (attempt.passed)
 * - ระหว่างวิ่ง / เข้าสถานี / ไหลไปเอง เกมไม่ฟัง แล้วเริ่มฟังคำของช่วงถัดไปหลังเฟรมเงียบ (re-arm ของ CallGame)
 * - เวลาของการวิ่งนับจาก dt ของเฟรมที่เกมทำงานจริง (ตัดที่ MAX_FRAME_DT_MS) ไม่ใช่นาฬิกาผนัง:
 *   พัก/ซ่อนหน้ากลางทางแล้วกลับมาทีหลัง รถยังอยู่ตรงเดิม ไม่วาร์ปถึงสถานีหรือจบรอบเอง
 * - ข้ามช่วง = รถไหลไปถึงสถานีถัดไปเองโดยไม่นับคำ ไม่ได้ดาว ข้ามครบก็ส่งของถึงผู้รับได้ ไม่มีจับเวลา ไม่มีแพ้ ไม่มีของเสีย
 */
export class TrainTrip {
  readonly call: CallGame;
  readonly legs: number;
  private readonly oralThreshold: number;
  phase: TrainPhase = "aim";
  /** The stop the train stands at (0 = depot … legs = the receiver's station). During a ride or coast, the one it left. */
  at = 0;
  /** How each stop was reached (index i = stop i + 1); null = not yet. */
  results: (LegResult | null)[];
  /** Progress of the ride or coast (0 … 1) and of pulling in (0 … 1) — what the scene shows. */
  moveK = 0;
  arriveK = 0;
  /** Steam building while the child speaks (0 … STEAM_MAX). Purely a pose: it never changes the ride. */
  steam = 0;
  /** The child is speaking on a usable signal right now (the game is listening while this happens). */
  speaking = false;
  /** Increment on every departure / arrival / coast (scene cues). */
  goSeq = 0;
  arriveSeq = 0;
  coastSeq = 0;
  /** Usable attempts, judged on the expert's oral criterion for the caregiver's history (one per ride). */
  attempts: Attempt[] = [];
  /** Logical time in the current move / arrival (sum of clamped frame dt — frozen while paused). */
  private moveMs = 0;
  private arriveMs = 0;

  constructor(items: CallItem[], oralThreshold: number) {
    this.call = new CallGame(items);
    this.legs = items.length;
    this.oralThreshold = oralThreshold;
    this.results = items.map(() => null);
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** Riding, pulling in or coasting: no listening, no buttons. */
  get busy(): boolean {
    return this.phase === "ride" || this.phase === "arrive" || this.phase === "coast";
  }

  /** The stop being moved to (during a ride or coast), else the stop the train stands at. */
  get to(): number {
    return this.phase === "ride" || this.phase === "coast" ? this.at + 1 : this.at;
  }

  /** Legs ridden on a usable word (coasted legs are not counted). */
  get voiced(): number {
    return this.results.filter((r) => r === "ride").length;
  }

  get coasted(): number {
    return this.results.filter((r) => r === "coast").length;
  }

  /** Stars of the round = legs ridden on a usable word. */
  get stars(): number {
    return this.voiced;
  }

  update(frame: SignalFrame, now: number, dtMs: number): TrainEvent[] {
    const out: TrainEvent[] = [];
    if (this.phase === "done") return out;
    const dt = clampDt(dtMs);
    if (this.phase === "ride" || this.phase === "coast") {
      this.moveMs += dt;
      this.moveK = Math.min(1, this.moveMs / (this.phase === "ride" ? RIDE_MS : COAST_MS));
      if (this.moveK >= 1) this.reach(out);
      return out;
    }
    if (this.phase === "arrive") {
      this.arriveMs += dt;
      this.arriveK = Math.min(1, this.arriveMs / ARRIVE_MS);
      if (this.arriveK >= 1) this.nextLeg(out);
      return out;
    }

    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      if (ev.first) this.go(out);
    }
    if (this.phase !== "aim") return out;

    // the child is speaking (usable signal, not the example word): steam builds — and settles again otherwise
    const c = this.call.state;
    this.speaking = c.phase === "turn" && c.inAttempt && frame.valid;
    const rate = this.speaking ? STEAM_RATE : COOL_RATE;
    const goal = this.speaking ? STEAM_MAX : 0;
    this.steam += (goal - this.steam) * (1 - Math.exp(-rate * (dt / 1000)));
    return out;
  }

  /** "ข้ามช่วงนี้": the train rolls on to the next stop without the word — nothing is counted or taken away. */
  skip(): TrainEvent[] {
    if (this.phase !== "aim") return [];
    if (this.call.heardNow) this.call.next();
    else this.call.skip();
    this.results = this.results.map((r, i) => (i === this.at ? "coast" : r));
    this.phase = "coast";
    this.moveMs = 0;
    this.moveK = 0;
    this.steam = 0;
    this.speaking = false;
    this.coastSeq += 1;
    return [{ type: "coast", stop: this.at + 1 }];
  }

  /** "ไปต่อ" while pulling in: listen for the next leg now (the leg is already counted). */
  skipArrive(): TrainEvent[] {
    if (this.phase !== "arrive") return [];
    const out: TrainEvent[] = [];
    this.nextLeg(out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped; a ride, coast or arrival waits where it is (no time passes). */
  interrupt(): void {
    this.call.interrupt();
    this.speaking = false;
    this.steam = 0;
  }

  /** End early: what was reached so far is kept (a ride already rolling counts — its word was usable). */
  finish(): void {
    if (this.phase === "ride") {
      this.results = this.results.map((r, i) => (i === this.at ? "ride" : r));
      this.at += 1;
    } else if (this.phase === "coast") {
      this.at += 1;
    }
    this.call.finish();
    this.phase = "done";
    this.moveK = 0;
    this.speaking = false;
  }

  private go(out: TrainEvent[]): void {
    this.phase = "ride";
    this.moveMs = 0;
    this.moveK = 0;
    this.steam = 0;
    this.speaking = false;
    this.goSeq += 1;
    out.push({ type: "go", stop: this.at + 1 });
  }

  private reach(out: TrainEvent[]): void {
    const rode = this.phase === "ride";
    if (rode) this.results = this.results.map((r, i) => (i === this.at ? "ride" : r));
    this.at += 1;
    this.moveK = 0;
    const last = this.at >= this.legs;
    if (rode) {
      this.phase = "arrive";
      this.arriveMs = 0;
      this.arriveK = 0;
      this.arriveSeq += 1;
      out.push({ type: "arrive", stop: this.at, last });
      return;
    }
    out.push({ type: "rolled", stop: this.at, last });
    if (last) this.end(out);
    else this.listen(out);
  }

  private nextLeg(out: TrainEvent[]): void {
    // a ridden leg still sits on its word in the call game (heard); move the call game on to the next word
    if (this.call.heardNow) this.call.next();
    this.arriveK = 0;
    if (this.at >= this.legs) this.end(out);
    else this.listen(out);
  }

  private listen(out: TrainEvent[]): void {
    this.phase = "aim";
    this.steam = 0;
    out.push({ type: "ready", stop: this.at + 1 });
  }

  private end(out: TrainEvent[]): void {
    if (this.call.state.phase !== "done") this.call.finish();
    this.phase = "done";
    this.speaking = false;
    out.push({ type: "finish" });
  }
}
