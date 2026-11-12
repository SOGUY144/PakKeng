import type { SignalFrame } from "../signal/SignalProcessor";
import { CallGame, type CallEvent, type CallItem } from "./call";
import { clampDt, levelUsable, type Attempt } from "./common";

/** Clouds / hail in one flight (one word each, plan order). */
export const PLANE_ENCOUNTERS = 5;
/** The bubble's flight (or the plane's roll) after a usable word. The game does not listen meanwhile. */
export const SHOT_MS = 900;
/** The cloud turning into a rainbow (or the roll landing) before the next one comes. Not listening either. */
export const CHEER_MS = 1400;
/** A bubble that floats past (below the plan's target) before the same cloud waits again. Not listening. */
export const NEAR_MS = 1100;
/** Tries below the target on one cloud before it smiles and drifts away by itself (never a loss). */
export const MAX_TRIES = 3;
/** While the child speaks the bubble grows at once, up to CHARGE_MAX — only a finished, usable word fires it. */
export const CHARGE_MAX = 0.85;
const CHARGE_RATE = 1.6;

/**
 * easy ("บินสบาย", for the little ones): any usable word pops the cloud — the game never judges the voice.
 * adventure ("บินผจญภัย"): the plan's targets decide — an oral word (a cloud to pop) meets the oral criterion,
 * a nasal word (hail to roll past) has enough voice through the nose. Below the target the bubble floats past.
 */
export type FlightLevel = "easy" | "adventure";
export type EncounterKind = "cloud" | "hail";
export type EncounterResult = "hit" | "dodge" | "drift" | "skip";
export type PlanePhase = "approach" | "shot" | "near" | "cheer" | "done";

export type PlaneEvent =
  | CallEvent
  | { type: "fire"; encounter: number; kind: EncounterKind }
  | { type: "hit"; encounter: number }
  | { type: "dodge"; encounter: number }
  | { type: "near"; encounter: number; tries: number }
  | { type: "drift"; encounter: number }
  | { type: "ready"; encounter: number }
  | { type: "finish" };

export interface PlaneTargets {
  /** Oral words: % through the mouth at least this (the plan's oral criterion). */
  oralThreshold: number;
  /** Nasal words: % through the nose at least this (the plan's nasal-word criterion). */
  nasalThreshold: number;
}

/**
 * เกมนักบินฟองสบู่ (แบบเกมยิงเครื่องบินที่ช้าลงมาก): ตัวละครขับเครื่องบิน เมฆขี้บ่นหรือลูกเห็บโผล่มาแล้วโลกช้าลง
 * - เมฆ (คำด้านปาก) → เป่าฟองให้เมฆกลายเป็นรุ้ง · ลูกเห็บ (คำนาสิก) → เครื่องบินตีลังกาหลบ
 * - การตรวจพบเสียงใช้ CallGame ตัวเดียวกับเกมอื่น: เสียงตัวอย่างไม่นับ สัญญาณใช้ไม่ได้ = ขอลองใหม่ ไม่หักอะไร
 * - เมฆรออยู่ห่าง ๆ ไม่มีจับเวลา ไม่มีชีวิต ไม่มีแพ้ · ต่ำกว่าเป้า = ฟองลอยเฉียดไป ลองได้อีก ครบ MAX_TRIES เมฆยิ้มแล้วลอยไปเอง
 * - แรงฟอง/ทิศไม่ขึ้นกับความดัง · เกมนี้ฟังค่าเสียงจมูกเฉพาะโหมดผจญภัยและเทียบกับเป้าของนักแก้ไขการพูดเท่านั้น
 *   (คำปาก ≠ “ยิ่งต่ำยิ่งดี”: คำนาสิกต้องมีเสียงออกจมูกพอ) — เครื่องไม่รู้ว่าออกเสียงพยัญชนะถูกหรือไม่
 */
export class PlaneFlight {
  readonly call: CallGame;
  readonly encounters: number;
  readonly level: FlightLevel;
  readonly kinds: EncounterKind[];
  private readonly targets: PlaneTargets;
  phase: PlanePhase = "approach";
  /** The cloud / hail being played (0-based); equals `encounters` once the flight is over. */
  encounter = 0;
  results: (EncounterResult | null)[];
  /** Tries below the target on the current encounter. */
  tries = 0;
  /** The bubble growing on the child's voice (0 … CHARGE_MAX), 1 when it fires. */
  charge = 0;
  charging = false;
  /** Progress of the shot / the near miss / the celebration (0 … 1) — what the scene shows. */
  shotK = 0;
  nearK = 0;
  cheerK = 0;
  /** Scene cues. */
  fireSeq = 0;
  hitSeq = 0;
  nearSeq = 0;
  /** What the shot in the air will do when it lands. */
  outcome: "hit" | "near" = "hit";
  /** Usable attempts on oral words (judged on the oral criterion) and on nasal words (judged on the nasal one). */
  oralAttempts: Attempt[] = [];
  nasalAttempts: Attempt[] = [];
  /** Logical time in the current shot / miss / celebration (clamped frame dt, never the wall clock). */
  private elapsed = 0;
  private readonly cheerMs: number;

  constructor(items: CallItem[], level: FlightLevel, targets: PlaneTargets, opts: { cheerMs?: number } = {}) {
    this.call = new CallGame(items);
    this.encounters = items.length;
    this.level = level;
    this.kinds = items.map((it) => (it.resonance === "nasal" ? "hail" : "cloud"));
    this.targets = targets;
    this.results = items.map(() => null);
    this.cheerMs = opts.cheerMs ?? CHEER_MS;
  }

  get done(): boolean {
    return this.phase === "done";
  }

  /** A shot, a near miss or a celebration is playing: no listening, no buttons. */
  get busy(): boolean {
    return this.phase === "shot" || this.phase === "near" || this.phase === "cheer";
  }

  get kind(): EncounterKind {
    return this.kinds[Math.min(this.encounter, this.encounters - 1)] ?? "cloud";
  }

  /** Clouds popped and hail rolled past on a usable word (drifted and skipped ones are not counted). */
  get stars(): number {
    return this.results.filter((r) => r === "hit" || r === "dodge").length;
  }

  update(frame: SignalFrame, now: number, dtMs: number): PlaneEvent[] {
    const out: PlaneEvent[] = [];
    if (this.phase === "done") return out;
    if (this.phase === "shot") {
      this.elapsed += clampDt(dtMs);
      this.shotK = Math.min(1, this.elapsed / SHOT_MS);
      if (this.shotK >= 1) this.land(out);
      return out;
    }
    if (this.phase === "near") {
      this.elapsed += clampDt(dtMs);
      this.nearK = Math.min(1, this.elapsed / NEAR_MS);
      if (this.nearK >= 1) this.afterNear(out);
      return out;
    }
    if (this.phase === "cheer") {
      this.elapsed += clampDt(dtMs);
      this.cheerK = Math.min(1, this.elapsed / this.cheerMs);
      if (this.cheerK >= 1) this.nextEncounter(out);
      return out;
    }

    for (const ev of this.call.update(frame, now, dtMs)) {
      out.push(ev);
      if (ev.type !== "heard" || this.phase !== "approach") continue;
      const met = this.judge(ev.meanNasal, ev.durationMs);
      this.fire(out, this.level === "easy" ? true : met);
    }
    if (this.phase !== "approach") return out;

    // the child is speaking in a voice the game can use (not the example, not clipped, not too quiet): the bubble grows
    const c = this.call.state;
    this.charging = c.phase !== "playing" && c.phase !== "settle" && c.inAttempt && frame.valid && levelUsable(frame);
    if (this.charging) this.charge += (CHARGE_MAX - this.charge) * (1 - Math.exp(-CHARGE_RATE * (clampDt(dtMs) / 1000)));
    return out;
  }

  /** "ข้ามก้อนนี้": the cloud floats by without a word — nothing is taken away. */
  skip(): PlaneEvent[] {
    if (this.phase !== "approach") return [];
    const out: PlaneEvent[] = [];
    this.results = this.results.map((r, i) => (i === this.encounter ? "skip" : r));
    this.nextEncounter(out);
    return out;
  }

  /** "ไปต่อ" during the celebration: the next cloud now (the hit is already counted). */
  skipCheer(): PlaneEvent[] {
    if (this.phase !== "cheer") return [];
    const out: PlaneEvent[] = [];
    this.nextEncounter(out);
    return out;
  }

  /** Pause / tab hidden: an open attempt is dropped; a shot in the air lands afterwards. */
  interrupt(): void {
    this.call.interrupt();
    this.charging = false;
  }

  /** End early: what was scored so far is kept (a hit shot already in the air counts — its word was on target). */
  finish(): void {
    if (this.phase === "shot" && this.outcome === "hit") this.score();
    this.call.finish();
    this.phase = "done";
    this.charging = false;
  }

  /** Records the attempt for the adult (both criteria are the plan's) and says whether it met the encounter's target. */
  private judge(meanNasal: number, durationMs: number): boolean {
    if (this.kind === "hail") {
      const passed = meanNasal >= this.targets.nasalThreshold;
      this.nasalAttempts.push({ meanNasal, passed, durationMs });
      return passed;
    }
    const passed = 100 - meanNasal >= this.targets.oralThreshold;
    this.oralAttempts.push({ meanNasal, passed, durationMs });
    return passed;
  }

  private fire(out: PlaneEvent[], met: boolean): void {
    this.phase = "shot";
    this.outcome = met ? "hit" : "near";
    this.charge = 1;
    this.charging = false;
    this.shotK = 0;
    this.elapsed = 0;
    this.fireSeq += 1;
    out.push({ type: "fire", encounter: this.encounter, kind: this.kind });
  }

  private score(): void {
    this.results = this.results.map((r, i) => (i === this.encounter ? (this.kind === "hail" ? "dodge" : "hit") : r));
  }

  private land(out: PlaneEvent[]): void {
    this.elapsed = 0;
    if (this.outcome === "hit") {
      this.score();
      this.hitSeq += 1;
      this.phase = "cheer";
      this.cheerK = 0;
      out.push(this.kind === "hail" ? { type: "dodge", encounter: this.encounter } : { type: "hit", encounter: this.encounter });
      return;
    }
    this.tries += 1;
    this.nearSeq += 1;
    this.phase = "near";
    this.nearK = 0;
    out.push({ type: "near", encounter: this.encounter, tries: this.tries });
  }

  private afterNear(out: PlaneEvent[]): void {
    if (this.tries >= MAX_TRIES) {
      this.results = this.results.map((r, i) => (i === this.encounter ? "drift" : r));
      out.push({ type: "drift", encounter: this.encounter });
      this.nextEncounter(out);
      return;
    }
    // the same cloud waits again: the child's turn, listening from silence (nothing counted or taken away)
    this.call.reopen();
    this.phase = "approach";
    this.charge = 0;
    this.nearK = 0;
  }

  private nextEncounter(out: PlaneEvent[]): void {
    // a heard word still sits on its turn in the call game; an unheard (skipped) one is marked skipped there
    if (this.call.heardNow) this.call.next();
    else if (this.call.state.phase !== "done") this.call.skip();
    this.encounter += 1;
    this.tries = 0;
    this.charge = 0;
    this.shotK = 0;
    this.nearK = 0;
    this.cheerK = 0;
    this.charging = false;
    this.elapsed = 0;
    if (this.encounter >= this.encounters) {
      if (this.call.state.phase !== "done") this.call.finish();
      this.phase = "done";
      out.push({ type: "finish" });
      return;
    }
    this.phase = "approach";
    out.push({ type: "ready", encounter: this.encounter });
  }
}
