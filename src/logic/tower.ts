import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, type Attempt } from "./common";

/** Floors in one round (one word each, plan order). The avatar starts on the ground cloud (floor 0). */
export const TOWER_FLOORS = 5;
/** One jump up to the next cloud after a usable word. The game does not listen meanwhile. */
export const JUMP_MS = 900;
/** Landing on the new cloud (squash, the floor's keepsake lights up). The game does not listen meanwhile either. */
export const LAND_MS = 1100;
/** "ข้ามชั้นนี้": a cloud lift carries the avatar up one floor — slower and calmer than a jump, nothing is counted. */
export const LIFT_MS = 1200;
/** While the child speaks the avatar crouches, ready to jump (never more than this; never from loudness). */
export const CROUCH_MAX = 1;
const CROUCH_RATE = 3;
const RELAX_RATE = 2;

export type TowerPhase = "aim" | "jump" | "land" | "lift" | "done";
/** How a floor was reached: by a jump on a usable word, or carried up by the skip lift. */
export type FloorResult = "jump" | "skip";

export type TowerEvent =
  | CallEvent
  /** A usable word: the jump to `floor` (1-based) starts. */
  | { type: "jump"; floor: number }
  /** The jump reached `floor`; `top` = the last floor. */
  | { type: "land"; floor: number; top: boolean }
  /** Skip: the lift to `floor` starts. */
  | { type: "lift"; floor: number }
  /** The lift reached `floor`. */
  | { type: "arrive"; floor: number; top: boolean }
  /** Listening for the word of the next floor. */
  | { type: "ready"; floor: number }
  | { type: "finish" };

/** What both views draw (3D scene and 2D side stack) — read from the game, never written back. */
export interface ClimbView {
  /** The cloud the avatar stands on, or has just left. */
  from: number;
  /** The cloud it is moving to (= `from` while standing). */
  to: number;
  /** Progress of the jump or lift (0 … 1); 0 while standing. */
  k: number;
  moving: "jump" | "lift" | null;
  /** The floor shown as “ชั้น N จาก 5” (the cloud the avatar stands on; it changes on arrival). */
  floor: number;
  /** Progress of the landing (0 … 1) after a jump; 0 otherwise. */
  landK: number;
  crouch: number;
  speaking: boolean;
  voiced: number;
  results: readonly (FloorResult | null)[];
  done: boolean;
}

export function climbView(g: TowerClimb): ClimbView {
  const moving = g.phase === "jump" || g.phase === "lift" ? g.phase : null;
  return {
    from: g.at,
    to: g.to,
    k: moving ? g.moveK : 0,
    moving,
    floor: g.at,
    landK: g.phase === "land" ? g.landK : 0,
    crouch: g.crouch,
    speaking: g.speaking,
    voiced: g.voiced,
    results: g.results,
    done: g.done,
  };
}

/**
 * หอคอยเมฆ: ปีนขึ้น TOWER_FLOORS ชั้น แต่ละชั้นใช้คำหนึ่งคำตามลำดับแผน
 * - ตรวจพบเสียงด้วยตัวเดียวกับด่านเรียกเพื่อน (CallGame): เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ อยู่แท่นเดิม ไม่ตก ไม่ถอย
 * - ช่วงเสียงที่ใช้ได้หนึ่งครั้ง = กระโดดหนึ่งชั้น ระยะ ความสูง และเวลาเท่ากันทุกครั้ง: ไม่อ่านความดัง ค่าจมูก/ปาก หรือคำถูก
 *   เกณฑ์ออกปากของผู้เชี่ยวชาญบันทึกให้ผู้ดูแลเท่านั้น (attempt.passed)
 * - ระหว่างกระโดด / ลงแท่น / ลิฟต์เมฆ เกมไม่ฟัง แล้วเริ่มฟังคำของชั้นถัดไปหลังเฟรมเงียบ (re-arm ของ CallGame)
 * - เวลาของท่ากระโดดนับจาก dt ของแต่ละเฟรมที่เกมทำงานจริง (ตัดที่ MAX_FRAME_DT_MS) ไม่ใช่นาฬิกาผนัง:
 *   พัก/ซ่อนหน้ากลางอากาศแล้วกลับมาทีหลัง ตัวละครยังอยู่ตรงเดิมของท่ากระโดด ไม่วาร์ปลงแท่นหรือจบรอบเอง
 * - ข้ามชั้น = ลิฟต์เมฆพาขึ้นไปโดยไม่นับคำ ไม่ได้ดาว ข้ามครบทุกชั้นก็ถึงยอดได้ ไม่มีแพ้ ไม่มีจับเวลา
 */
export class TowerClimb {
  readonly call: CallGame;
  readonly floors: number;
  private readonly oralThreshold: number;
  phase: TowerPhase = "aim";
  /** The cloud the avatar stands on (0 = ground … floors = top). During a jump or lift it is the cloud it left. */
  at = 0;
  /** How each floor was reached (index i = floor i + 1); null = not yet. */
  results: (FloorResult | null)[];
  /** Progress of the jump or lift (0 … 1) and of the landing (0 … 1) — what the scene shows. */
  moveK = 0;
  landK = 0;
  /** Crouch, ready to jump (0 … CROUCH_MAX), only while the child is speaking. Purely a pose: it never changes the jump. */
  crouch = 0;
  /** The child is speaking on a usable signal right now (the game is listening while this happens). */
  speaking = false;
  /** Increment on every jump / landing / lift (scene cues). */
  jumpSeq = 0;
  landSeq = 0;
  liftSeq = 0;
  /** Usable attempts, judged on the expert's oral criterion for the caregiver's history (one per jump). */
  attempts: Attempt[] = [];
  /** Logical time spent in the current move / landing (sum of clamped frame dt — frozen while paused). */
  private moveMs = 0;
  private landMs = 0;

  constructor(items: CallItem[], oralThreshold: number) {
    this.call = new CallGame(items);
    this.floors = items.length;
    this.oralThreshold = oralThreshold;
    this.results = items.map(() => null);
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** Jumping, landing or riding the lift: no listening, no buttons. */
  get busy(): boolean {
    return this.phase === "jump" || this.phase === "land" || this.phase === "lift";
  }

  /** The floor being moved to (during a jump or lift), else the floor the avatar stands on. */
  get to(): number {
    return this.phase === "jump" || this.phase === "lift" ? this.at + 1 : this.at;
  }

  /** Floors reached by voice (skipped floors are not counted). */
  get voiced(): number {
    return this.results.filter((r) => r === "jump").length;
  }

  get skipped(): number {
    return this.results.filter((r) => r === "skip").length;
  }

  /** Stars of the round = floors jumped on a usable word. */
  get stars(): number {
    return this.voiced;
  }

  update(frame: SignalFrame, now: number, dtMs: number): TowerEvent[] {
    const out: TowerEvent[] = [];
    if (this.phase === "done") return out;
    const dt = clampDt(dtMs);
    if (this.phase === "jump" || this.phase === "lift") {
      this.moveMs += dt;
      this.moveK = Math.min(1, this.moveMs / (this.phase === "jump" ? JUMP_MS : LIFT_MS));
      if (this.moveK >= 1) this.arrive(out);
      return out;
    }
    if (this.phase === "land") {
      this.landMs += dt;
      this.landK = Math.min(1, this.landMs / LAND_MS);
      if (this.landK >= 1) this.nextFloor(out);
      return out;
    }

    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard") continue;
      this.attempts.push({ meanNasal: ev.meanNasal, passed: 100 - ev.meanNasal >= this.oralThreshold, durationMs: ev.durationMs });
      if (ev.first) this.jump(out);
    }
    if (this.phase !== "aim") return out;

    // the child is speaking (usable signal, not the example word): crouch, ready to jump — relax again otherwise
    const c = this.call.state;
    this.speaking = c.phase === "turn" && c.inAttempt && frame.valid;
    const rate = this.speaking ? CROUCH_RATE : RELAX_RATE;
    const goal = this.speaking ? CROUCH_MAX : 0;
    this.crouch += (goal - this.crouch) * (1 - Math.exp(-rate * (dt / 1000)));
    return out;
  }

  /** "ข้ามชั้นนี้": the cloud lift carries the avatar up one floor without the word — nothing is counted or taken away. */
  skip(): TowerEvent[] {
    if (this.phase !== "aim") return [];
    if (this.call.heardNow) this.call.next();
    else this.call.skip();
    this.results = this.results.map((r, i) => (i === this.at ? "skip" : r));
    this.phase = "lift";
    this.moveMs = 0;
    this.moveK = 0;
    this.crouch = 0;
    this.speaking = false;
    this.liftSeq += 1;
    return [{ type: "lift", floor: this.at + 1 }];
  }

  /** "ชั้นต่อไป" while landing: listen for the next floor now (the floor is already counted). */
  skipLand(): TowerEvent[] {
    if (this.phase !== "land") return [];
    const out: TowerEvent[] = [];
    this.nextFloor(out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped; a jump, lift or landing waits where it is (no time passes). */
  interrupt(): void {
    this.call.interrupt();
    this.speaking = false;
    this.crouch = 0;
  }

  /** End early: what was reached so far is kept (a jump already in the air counts — its word was usable). */
  finish(): void {
    if (this.phase === "jump") {
      this.results = this.results.map((r, i) => (i === this.at ? "jump" : r));
      this.at += 1;
    } else if (this.phase === "lift") {
      this.at += 1;
    }
    this.call.finish();
    this.phase = "done";
    this.moveK = 0;
    this.speaking = false;
  }

  private jump(out: TowerEvent[]): void {
    this.phase = "jump";
    this.moveMs = 0;
    this.moveK = 0;
    this.crouch = 0;
    this.speaking = false;
    this.jumpSeq += 1;
    out.push({ type: "jump", floor: this.at + 1 });
  }

  private arrive(out: TowerEvent[]): void {
    const jumped = this.phase === "jump";
    if (jumped) this.results = this.results.map((r, i) => (i === this.at ? "jump" : r));
    this.at += 1;
    this.moveK = 0;
    const top = this.at >= this.floors;
    if (jumped) {
      this.phase = "land";
      this.landMs = 0;
      this.landK = 0;
      this.landSeq += 1;
      out.push({ type: "land", floor: this.at, top });
      return;
    }
    out.push({ type: "arrive", floor: this.at, top });
    if (top) this.end(out);
    else this.listen(out);
  }

  private nextFloor(out: TowerEvent[]): void {
    // a jumped floor still sits on its word in the call game (heard); move the call game on to the next word
    if (this.call.heardNow) this.call.next();
    this.landK = 0;
    if (this.at >= this.floors) this.end(out);
    else this.listen(out);
  }

  private listen(out: TowerEvent[]): void {
    this.phase = "aim";
    this.crouch = 0;
    out.push({ type: "ready", floor: this.at + 1 });
  }

  private end(out: TowerEvent[]): void {
    if (this.call.state.phase !== "done") this.call.finish();
    this.phase = "done";
    this.speaking = false;
    out.push({ type: "finish" });
  }
}
