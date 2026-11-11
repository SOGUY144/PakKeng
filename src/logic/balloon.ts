import { QUALITY_DEFAULTS } from "../signal/quality";
import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, clamp, clampDt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter, type SegmentStats } from "./segmenter";

/**
 * บอลลูน: ความสูงตามค่าออกปากแบบต่อเนื่อง
 * เวลาในโซนเป็นแบบ “สะสม” — นับเฉพาะเมื่อมีเสียง + ข้อมูลใช้ได้ + อยู่ในโซน (ออกปาก ≥ เกณฑ์)
 * หลุดโซนหรือเงียบ = หยุดนับชั่วคราว ไม่รีเซ็ต (ข้อความในหน้าจอต้องบอกแบบนี้)
 *
 * รอบ “พาบอลลูนไปส่ง” (restBetween): สะสมครบเวลาตามแผน = บอลลูนลูกนั้นถึงหมุด แล้วพัก ไม่นับเสียงจนเด็กกด “ส่งลูกถัดไป”
 * - ไม่มีรางวัลสำหรับการลากเสียงเกินเวลาในแผน และไม่มีกติกา “ยิ่งออกปากมากยิ่งดี”: ทุกค่าที่ผ่านเกณฑ์สะสมเวลาเท่ากัน
 * - ระหว่างเสียงตัวอย่างและหลังจากนั้นอีก settleMs ไม่ฟังไมค์ แล้วต้องเงียบก่อนจึงเริ่มนับ (เสียงลำโพงไม่ใช่เสียงเด็ก)
 * - เสียงล้น/เบาเกินกว่าจะใช้ค่า = สัญญาณใช้ไม่ได้: ไม่นับ ไม่หัก บอลลูนรออยู่ที่เดิม และช่วงเสียงนั้นไม่ถูกตัดสินตามเกณฑ์
 */
export interface BalloonConfig {
  oralThreshold: number;
  holdMs: number;
  balloonsPerRound: number;
  /** Rest after each delivered balloon: the mics are not counted until `nextBalloon()` (the child sets the pace). */
  restBetween?: boolean;
}

/** Demo parameters (same reasoning as CALL_DEFAULTS in call.ts) — not clinical values. */
export const BALLOON_DEFAULTS = {
  /** After the example sound ends the mics stay ignored this long (speaker echo + device latency); then listening waits for silence. */
  settleMs: 450,
  /** Smoothing of the unusable-voice share behind the calm message, so short dips never make it flicker. */
  issueTauMs: 400,
  /** An utterance with at least this share of unusable frames is not judged on the criterion (signal, not the child). */
  badShare: 0.2,
};

export const BALLOONS_PER_ROUND = 3;
/** Resting height (0..1) the balloon drifts back to while silent. */
export const BALLOON_REST = 0.06;
const FOLLOW_TAU_S = 0.05;
const DESCEND_PER_S = 0.35;
const ISSUE_ON = 0.5;
const ISSUE_OFF = 0.15;

/** "fly" = listening for the balloon on the pad; every other phase ignores the mics. */
export type BalloonPhase = "fly" | "playing" | "settle" | "rest" | "done";
/** Voice the device picked up but the game cannot use: clipping ("loud") or below the quality floor ("quiet"). */
export type BalloonIssue = "loud" | "quiet";
export type BalloonResult = "delivered" | "skipped";

export type BalloonEvent =
  /** `index` = balloons delivered so far (1-based). */
  | { type: "balloon-complete"; index: number }
  /** `index` = the skipped balloon (0-based). */
  | { type: "skip"; index: number }
  | { type: "done" };

export interface BalloonState {
  /** Display height 0..1 (maps oral 0..100%). */
  height: number;
  /** In-zone time of the balloon on the pad (its share of the plan's hold time = how far it has risen). */
  holdMs: number;
  /** Delivered balloons (one star each). */
  completed: number;
  totalInZoneMs: number;
  /** Usable voice while the game was listening. */
  speakingMs: number;
  inZone: boolean;
  /** A usable voiced frame the game is counting. */
  speaking: boolean;
  attempts: Attempt[];
  stars: number;
  practiceMs: number;
  done: boolean;
  phase: BalloonPhase;
  /** Where the example sound returns to. */
  resume: "fly" | "rest";
  /** End of the settle window after a sound (-1 = it starts on the next frame). */
  settleUntil: number;
  /** Listening only starts after a silent frame once a sound has played (never mid-utterance). */
  armed: boolean;
  /** Calm message while the voice cannot be used — shown to help, never counted against the child. */
  issue: BalloonIssue | null;
  /** Outcome of each balloon so far, in order; its length is the index of the balloon on the pad. */
  results: BalloonResult[];
  /** Times the example word was played for the balloon on the pad. */
  listens: number;
}

/** Voice that cannot be used for a value. Unknown levels cannot be judged, so they pass. */
function voiceIssue(frame: SignalFrame): BalloonIssue | null {
  const q = frame.quality;
  if (!q.known) return null;
  if (q.clip) return "loud";
  if (q.levelDb !== null && q.levelDb < QUALITY_DEFAULTS.quietDb) return "quiet";
  return null;
}

const sink = (h: number, dt: number) => Math.max(BALLOON_REST, h - DESCEND_PER_S * dt);

export class BalloonGame {
  readonly cfg: BalloonConfig;
  readonly opts: typeof BALLOON_DEFAULTS;
  state: BalloonState;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();
  /** Frames of the open utterance, and how many of them could not be used. */
  private uttFrames = 0;
  private uttBad = 0;
  /** Smoothed share of unusable voice (drives the calm message). */
  private badShare = 0;
  private badKind: BalloonIssue = "loud";
  /** Mics ignored until this time (a vibration just played), then listening waits for silence. */
  private holdT = -Infinity;

  constructor(cfg: BalloonConfig, opts: Partial<typeof BALLOON_DEFAULTS> = {}) {
    this.cfg = cfg;
    this.opts = { ...BALLOON_DEFAULTS, ...opts };
    this.state = {
      height: BALLOON_REST,
      holdMs: 0,
      completed: 0,
      totalInZoneMs: 0,
      speakingMs: 0,
      inZone: false,
      speaking: false,
      attempts: [],
      stars: 0,
      practiceMs: 0,
      done: false,
      phase: "fly",
      resume: "fly",
      settleUntil: 0,
      armed: true,
      issue: null,
      results: [],
      listens: 0,
    };
  }

  /** Index of the balloon on the pad (flying, or waiting there during the rest). */
  get index(): number {
    return this.state.results.length;
  }

  /** A balloon has just reached the pin and the next one waits for "ส่งลูกถัดไป" (also while the example plays then). */
  get resting(): boolean {
    const s = this.state;
    return s.phase === "rest" || ((s.phase === "playing" || s.phase === "settle") && s.resume === "rest");
  }

  /** Example word starts playing: the mics are ignored from now on. */
  listenStart(): void {
    const s = this.state;
    if (s.done) return;
    this.dropUtterance();
    this.latch.reset();
    const resume = s.phase === "playing" || s.phase === "settle" ? s.resume : s.phase === "rest" ? "rest" : "fly";
    this.state = { ...s, phase: "playing", resume, listens: s.listens + 1, armed: false, inZone: false, speaking: false, issue: null };
    this.badShare = 0;
  }

  /** Playback ended (or the adult finished modelling): keep ignoring for settleMs, then wait for silence. */
  listenEnd(now: number): void {
    const s = this.state;
    if (s.phase !== "playing") return;
    this.state = { ...s, phase: "settle", settleUntil: now + this.opts.settleMs, armed: false };
  }

  /** "ส่งลูกถัดไป": the rest ends and the balloon on the pad starts listening. */
  nextBalloon(): void {
    if (!this.resting) return;
    this.dropUtterance();
    this.state = this.listenNext(this.state);
  }

  /** "ข้ามลูกนี้": the balloon stays home (no star, nothing taken away) and the next one is ready at once. */
  skip(): BalloonEvent[] {
    const s = this.state;
    if (s.done || this.resting) return [];
    this.dropUtterance();
    this.latch.reset();
    this.badShare = 0;
    const events: BalloonEvent[] = [{ type: "skip", index: s.results.length }];
    const next: BalloonState = { ...s, results: [...s.results, "skipped"], holdMs: 0, listens: 0, issue: null, inZone: false, speaking: false };
    if (next.results.length >= this.cfg.balloonsPerRound) {
      this.state = { ...next, phase: "done", done: true };
      events.push({ type: "done" });
      return events;
    }
    this.state = this.listenNext(next);
    return events;
  }

  /**
   * A short device feedback (vibration) has just played: the mics are ignored until `until`, then counting restarts
   * only from a silent frame (as after an example word). Nothing is counted or taken away; the balloon stays where it is.
   */
  holdUntil(until: number): void {
    if (this.state.done) return;
    if (until > this.holdT) this.holdT = until;
    this.dropUtterance();
    this.latch.reset();
    this.state = { ...this.state, armed: false, inZone: false, speaking: false };
  }

  /** Pause / tab hidden: the open utterance is dropped, never scored; a cut-off example means waiting for silence again. */
  interrupt(): void {
    this.dropUtterance();
    this.latch.reset();
    const s = this.state;
    const sound = s.phase === "playing" || s.phase === "settle";
    this.state = { ...s, phase: sound ? s.resume : s.phase, armed: sound ? false : s.armed, inZone: false, speaking: false };
  }

  /** "จบรอบ" — ends with whatever was achieved so far (an open utterance is counted). */
  finish(): void {
    const f = this.seg.flush();
    const attempts = f?.type === "end" ? this.judged(this.state.attempts, f.stats) : this.state.attempts;
    this.resetUtterance();
    this.state = { ...this.state, attempts, done: true, phase: "done", inZone: false, speaking: false };
  }

  update(frame: SignalFrame, now: number, dtMs: number): BalloonEvent[] {
    const s = this.state;
    if (s.done) return [];
    const dtMsC = clampDt(dtMs);
    const dt = dtMsC / 1000;
    const events: BalloonEvent[] = [];
    // practice time runs on usable data, except while the example plays (rests and the settle window are practice too)
    const practiceMs = s.phase === "playing" ? s.practiceMs : s.practiceMs + practiceDelta(frame, dtMs);

    // Not listening: the example is playing or its echo settling, or the child rests between balloons.
    // Whatever the mics pick up is not counted; an open utterance is dropped, never scored.
    if (s.phase !== "fly") {
      this.dropUtterance();
      this.latch.reset();
      // a sound cut off by a button starts its settle window on the first frame after it
      const settleUntil = s.phase === "settle" && s.settleUntil < 0 ? now + this.opts.settleMs : s.settleUntil;
      const phase = s.phase === "settle" && now >= settleUntil ? s.resume : s.phase;
      this.state = { ...s, phase, settleUntil, practiceMs, height: frame.valid ? sink(s.height, dt) : s.height, inZone: false, speaking: false };
      return events;
    }

    // Device feedback still ringing (vibration + guard): not the child; afterwards wait for silence.
    if (now < this.holdT) {
      this.dropUtterance();
      this.latch.reset();
      this.state = { ...s, practiceMs, armed: false, inZone: false, speaking: false };
      return events;
    }

    // After a sound: wait for a silent frame, so a voiced stretch that began during it is never taken as the child's.
    if (!s.armed) {
      this.dropUtterance();
      const silent = frame.valid && !frame.speaking;
      this.state = { ...s, practiceMs, armed: silent, height: silent ? sink(s.height, dt) : s.height, inZone: false, speaking: false };
      return events;
    }

    const bad = frame.speaking ? voiceIssue(frame) : null;
    const usable = frame.speaking && bad === null;

    let height = s.height;
    if (usable && frame.oral !== null) {
      const target = clamp(frame.oral / 100, 0, 1);
      height += (target - height) * (1 - Math.exp(-dt / FOLLOW_TAU_S));
    } else if (frame.valid && !frame.speaking) {
      height = sink(height, dt);
    } // invalid data or unusable voice: hold position (frozen), nothing counts

    // a binary zone (expert criterion, with hysteresis): every value that meets it counts the same
    const inZone = usable && this.latch.update(frame.oral, this.cfg.oralThreshold);
    if (!frame.speaking) this.latch.reset();

    // calm message for unusable voice; it stays while the child pauses and goes once usable voice is back
    let issue = s.issue;
    if (frame.speaking) {
      this.badShare += ((bad ? 1 : 0) - this.badShare) * (1 - Math.exp(-dtMsC / this.opts.issueTauMs));
      if (bad) this.badKind = bad;
      if (this.badShare >= ISSUE_ON) issue = this.badKind;
      else if (this.badShare <= ISSUE_OFF) issue = null;
    }

    let { holdMs, completed, totalInZoneMs, stars, results, listens } = s;
    let phase: BalloonPhase = "fly";
    let done = false;
    let delivered = false;
    if (inZone) {
      holdMs += dtMsC;
      totalInZoneMs += dtMsC;
      if (holdMs >= this.cfg.holdMs) {
        delivered = true;
        completed += 1;
        stars += 1;
        holdMs = 0;
        results = [...results, "delivered"];
        listens = 0;
        events.push({ type: "balloon-complete", index: completed });
        if (results.length >= this.cfg.balloonsPerRound) {
          done = true;
          phase = "done";
          events.push({ type: "done" });
        } else if (this.cfg.restBetween) {
          phase = "rest";
        }
      }
    }

    let attempts = s.attempts;
    const ev = this.seg.update(frame, now);
    if (ev?.type === "start") this.resetUtterance();
    if (frame.speaking && this.seg.isActive()) {
      this.uttFrames += 1;
      if (bad) this.uttBad += 1;
    }
    // Reached the pin mid-utterance (round over, or a rest starts): close and count the utterance that got it there.
    const finished = ev?.type === "end" ? ev : phase !== "fly" ? this.seg.flush() : null;
    if (finished?.type === "end") attempts = this.judged(attempts, finished.stats);
    if (finished || ev?.type === "discard") this.resetUtterance();

    if (delivered && phase !== "fly") {
      this.latch.reset();
      this.badShare = 0;
      issue = null;
    }

    this.state = {
      ...s,
      height,
      holdMs,
      completed,
      totalInZoneMs,
      speakingMs: s.speakingMs + (usable ? dtMsC : 0),
      inZone: inZone && phase === "fly",
      speaking: usable && phase === "fly",
      attempts,
      stars,
      practiceMs,
      done,
      phase,
      issue,
      results,
      listens,
    };
    return events;
  }

  /** Listening moves on to the balloon on the pad; a sound that was just cut off still gets its settle window. */
  private listenNext(s: BalloonState): BalloonState {
    if (s.phase === "playing" || s.phase === "settle") {
      return { ...s, phase: "settle", resume: "fly", settleUntil: s.phase === "playing" ? -1 : s.settleUntil, armed: false };
    }
    return { ...s, phase: "fly", resume: "fly", armed: true };
  }

  /** Add a finished utterance, judged on the oral criterion — unless too much of it was unusable signal. */
  private judged(list: Attempt[], stats: SegmentStats): Attempt[] {
    if (this.uttFrames > 0 && this.uttBad / this.uttFrames >= this.opts.badShare) return list;
    return [...list, { meanNasal: stats.meanNasal, passed: 100 - stats.meanNasal >= this.cfg.oralThreshold, durationMs: stats.durationMs }];
  }

  private resetUtterance(): void {
    this.uttFrames = 0;
    this.uttBad = 0;
  }

  private dropUtterance(): void {
    this.seg.reset();
    this.resetUtterance();
  }
}
