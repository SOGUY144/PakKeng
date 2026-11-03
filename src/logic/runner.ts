import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, clamp, clampDt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter } from "./segmenter";

export interface RunnerConfig {
  oralThreshold: number;
  prompts: string[];
  attemptsPerRound: number;
}

export const RUNNER_ATTEMPTS_PER_ROUND = 6;

/** Demo tuning (per second). The chaser never reaches the hero: no collision, no fail state. */
const GAP_GAIN_PASS = 0.42;
const GAP_LOSS_TRY = 0.1;
const GAP_LOSS_SILENT = 0.05;
export const GAP_MIN = 0.12;

export type RunnerEvent = { type: "attempt"; attempt: RunnerAttempt } | { type: "done" };

export interface RunnerAttempt extends Attempt {
  prompt: string;
}

export interface RunnerState {
  /** 0 = chaser right behind, 1 = far away. */
  gap: number;
  /** Scenery speed multiplier (decorative only). */
  speed: number;
  /** Decorative scroll distance — never used for scoring. */
  scroll: number;
  attempts: RunnerAttempt[];
  stars: number;
  /** Live, latched "oral ≥ threshold while speaking". */
  passing: boolean;
  speaking: boolean;
  inSegment: boolean;
  practiceMs: number;
  done: boolean;
}

export class RunnerGame {
  readonly cfg: RunnerConfig;
  state: RunnerState;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();

  constructor(cfg: RunnerConfig) {
    this.cfg = cfg;
    this.state = {
      gap: 0.55,
      speed: 0,
      scroll: 0,
      attempts: [],
      stars: 0,
      passing: false,
      speaking: false,
      inSegment: false,
      practiceMs: 0,
      done: false,
    };
  }

  currentPrompt(): string {
    const p = this.cfg.prompts;
    return p.length ? p[this.state.attempts.length % p.length] : "";
  }

  /** Called on pause/restart: an unfinished segment is dropped, never scored. */
  interrupt(): void {
    this.seg.reset();
    this.latch.reset();
    this.state = { ...this.state, passing: false, speaking: false, inSegment: false };
  }

  update(frame: SignalFrame, now: number, dtMs: number): RunnerEvent[] {
    const s = this.state;
    if (s.done) return [];
    const dt = clampDt(dtMs) / 1000;
    const events: RunnerEvent[] = [];

    const passing = frame.speaking && this.latch.update(frame.oral, this.cfg.oralThreshold);
    if (!frame.speaking) this.latch.reset();

    let gap = s.gap;
    let targetSpeed: number;
    if (!frame.valid) {
      targetSpeed = 0; // freeze: nothing counts while data is unusable
    } else if (passing) {
      gap += GAP_GAIN_PASS * dt;
      const over = clamp(((frame.oral ?? 0) - this.cfg.oralThreshold) / Math.max(1, 100 - this.cfg.oralThreshold), 0, 1);
      targetSpeed = 1.15 + 0.45 * over;
    } else if (frame.speaking) {
      gap -= GAP_LOSS_TRY * dt;
      targetSpeed = 0.85;
    } else {
      gap -= GAP_LOSS_SILENT * dt;
      targetSpeed = 0.6;
    }
    gap = clamp(gap, GAP_MIN, 1);
    const speed = s.speed + (targetSpeed - s.speed) * (1 - Math.exp(-dt / 0.25));

    let attempts = s.attempts;
    let stars = s.stars;
    let done = false;
    const ev = this.seg.update(frame, now);
    if (ev?.type === "end") {
      const meanOral = 100 - ev.stats.meanNasal;
      const attempt: RunnerAttempt = {
        prompt: this.currentPrompt(),
        meanNasal: ev.stats.meanNasal,
        passed: meanOral >= this.cfg.oralThreshold,
        durationMs: ev.stats.durationMs,
      };
      attempts = [...attempts, attempt];
      if (attempt.passed) stars += 1;
      events.push({ type: "attempt", attempt });
      if (attempts.length >= this.cfg.attemptsPerRound) {
        done = true;
        events.push({ type: "done" });
      }
    }

    this.state = {
      gap,
      speed,
      scroll: s.scroll + speed * dt,
      attempts,
      stars,
      passing,
      speaking: frame.speaking,
      inSegment: this.seg.isActive(),
      practiceMs: s.practiceMs + practiceDelta(frame, dtMs),
      done,
    };
    return events;
  }
}
