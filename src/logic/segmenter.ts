import type { SignalFrame } from "../signal/SignalProcessor";

/**
 * แบ่ง “ช่วงเสียง” จาก speechDetected เท่านั้น — เป็นพฤติกรรมเกมต้นแบบ
 * ไม่ใช่อัลกอริทึมตรวจพยางค์ และไม่รู้ว่าเด็กพูดคำอะไร
 */
export const SEGMENTER_DEFAULTS = {
  /** Silence needed before a segment is considered finished. */
  hangoverMs: 180,
  /** Shorter voiced blips are ignored (not scored). */
  minSegmentMs: 150,
};

export interface SegmentStats {
  durationMs: number;
  meanNasal: number;
  frames: number;
}

export type SegmentEvent =
  | { type: "start" }
  | { type: "end"; stats: SegmentStats }
  | { type: "discard"; reason: "too-short" | "invalid" };

export class SpeechSegmenter {
  private active = false;
  private startAt = 0;
  private lastVoicedAt = 0;
  private sum = 0;
  private frames = 0;
  private hangoverMs: number;
  private minSegmentMs: number;

  constructor(opts: Partial<typeof SEGMENTER_DEFAULTS> = {}) {
    this.hangoverMs = opts.hangoverMs ?? SEGMENTER_DEFAULTS.hangoverMs;
    this.minSegmentMs = opts.minSegmentMs ?? SEGMENTER_DEFAULTS.minSegmentMs;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Abort the open segment without scoring it (pause / restart / data loss). */
  reset(): void {
    this.active = false;
    this.sum = 0;
    this.frames = 0;
  }

  /**
   * Close the open segment now and score what was said so far — used when the goal is reached
   * mid-utterance (door opens, balloon hold completes) so the attempt that reached it is counted.
   */
  flush(): SegmentEvent | null {
    if (!this.active) return null;
    const durationMs = this.lastVoicedAt - this.startAt;
    const frames = this.frames;
    const meanNasal = frames > 0 ? this.sum / frames : 0;
    this.reset();
    if (frames === 0 || durationMs < this.minSegmentMs) return { type: "discard", reason: "too-short" };
    return { type: "end", stats: { durationMs, meanNasal, frames } };
  }

  update(frame: SignalFrame, now: number): SegmentEvent | null {
    if (!frame.valid) {
      if (this.active) {
        this.reset();
        return { type: "discard", reason: "invalid" };
      }
      return null;
    }

    if (frame.speaking && frame.nasalRaw !== null) {
      let ev: SegmentEvent | null = null;
      if (!this.active) {
        this.active = true;
        this.startAt = now;
        this.sum = 0;
        this.frames = 0;
        ev = { type: "start" };
      }
      this.sum += frame.nasalRaw;
      this.frames += 1;
      this.lastVoicedAt = now;
      return ev;
    }

    if (this.active && now - this.lastVoicedAt >= this.hangoverMs) {
      const durationMs = this.lastVoicedAt - this.startAt;
      const frames = this.frames;
      const meanNasal = frames > 0 ? this.sum / frames : 0;
      this.reset();
      if (frames === 0 || durationMs < this.minSegmentMs) return { type: "discard", reason: "too-short" };
      return { type: "end", stats: { durationMs, meanNasal, frames } };
    }
    return null;
  }
}
