import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, clamp, clampDt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter } from "./segmenter";

/**
 * บอลลูน: ความสูงตามค่าออกปากแบบต่อเนื่อง
 * เวลาในโซนเป็นแบบ “สะสม” — นับเฉพาะเมื่อมีเสียง + ข้อมูลใช้ได้ + อยู่ในโซน (ออกปาก ≥ เกณฑ์)
 * หลุดโซนหรือเงียบ = หยุดนับชั่วคราว ไม่รีเซ็ต (ข้อความในหน้าจอต้องบอกแบบนี้)
 */
export interface BalloonConfig {
  oralThreshold: number;
  holdMs: number;
  balloonsPerRound: number;
}

export const BALLOONS_PER_ROUND = 3;
/** Resting height (0..1) the balloon drifts back to while silent. */
export const BALLOON_REST = 0.06;
const FOLLOW_TAU_S = 0.05;
const DESCEND_PER_S = 0.35;

export type BalloonEvent = { type: "balloon-complete"; index: number } | { type: "done" };

export interface BalloonState {
  /** Display height 0..1 (maps oral 0..100%). */
  height: number;
  holdMs: number;
  completed: number;
  totalInZoneMs: number;
  speakingMs: number;
  inZone: boolean;
  speaking: boolean;
  attempts: Attempt[];
  stars: number;
  practiceMs: number;
  done: boolean;
}

export class BalloonGame {
  readonly cfg: BalloonConfig;
  state: BalloonState;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();

  constructor(cfg: BalloonConfig) {
    this.cfg = cfg;
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
    };
  }

  interrupt(): void {
    this.seg.reset();
    this.latch.reset();
    this.state = { ...this.state, inZone: false, speaking: false };
  }

  /** "จบรอบ" — ends with whatever was achieved so far (an open utterance is counted). */
  finish(): void {
    const f = this.seg.flush();
    const attempts =
      f?.type === "end"
        ? [
            ...this.state.attempts,
            {
              meanNasal: f.stats.meanNasal,
              passed: 100 - f.stats.meanNasal >= this.cfg.oralThreshold,
              durationMs: f.stats.durationMs,
            },
          ]
        : this.state.attempts;
    this.state = { ...this.state, attempts, done: true, inZone: false };
  }

  update(frame: SignalFrame, now: number, dtMs: number): BalloonEvent[] {
    const s = this.state;
    if (s.done) return [];
    const dtMsC = clampDt(dtMs);
    const dt = dtMsC / 1000;
    const events: BalloonEvent[] = [];

    let height = s.height;
    if (frame.speaking && frame.oral !== null) {
      const target = clamp(frame.oral / 100, 0, 1);
      height += (target - height) * (1 - Math.exp(-dt / FOLLOW_TAU_S));
    } else if (frame.valid) {
      height = Math.max(BALLOON_REST, height - DESCEND_PER_S * dt);
    } // invalid data: hold position (frozen), nothing counts

    const inZone = frame.speaking && this.latch.update(frame.oral, this.cfg.oralThreshold);
    if (!frame.speaking) this.latch.reset();

    let { holdMs, completed, totalInZoneMs, stars } = s;
    let done = false;
    if (inZone) {
      holdMs += dtMsC;
      totalInZoneMs += dtMsC;
      if (holdMs >= this.cfg.holdMs) {
        completed += 1;
        stars += 1;
        holdMs = 0;
        events.push({ type: "balloon-complete", index: completed });
        if (completed >= this.cfg.balloonsPerRound) {
          done = true;
          events.push({ type: "done" });
        }
      }
    }

    let attempts = s.attempts;
    const ev = this.seg.update(frame, now);
    // Round finished mid-utterance: close and count the utterance that completed it.
    const finished = ev?.type === "end" ? ev : done ? this.seg.flush() : null;
    if (finished?.type === "end") {
      attempts = [
        ...attempts,
        {
          meanNasal: finished.stats.meanNasal,
          passed: 100 - finished.stats.meanNasal >= this.cfg.oralThreshold,
          durationMs: finished.stats.durationMs,
        },
      ];
    }

    this.state = {
      height,
      holdMs,
      completed,
      totalInZoneMs,
      speakingMs: s.speakingMs + (frame.speaking ? dtMsC : 0),
      inZone,
      speaking: frame.speaking,
      attempts,
      stars,
      practiceMs: s.practiceMs + practiceDelta(frame, dtMs),
      done,
    };
    return events;
  }
}
