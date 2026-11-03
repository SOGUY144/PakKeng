import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter } from "./segmenter";

/**
 * กบข้ามบึง: หนึ่งช่วงเสียง = หนึ่งครั้งฝึก (ใช้ speechDetected แบ่งช่วงเท่านั้น ไม่ได้ตรวจว่าเป็นพยางค์ “ปา” จริง)
 * - ตัดสินเมื่อช่วงเสียงจบ → ผ่าน = กระโดด 1 ก้าว (ค้างเสียงนานแค่ไหนก็ได้แค่ 1 ก้าว)
 * - ไม่ผ่าน = splash เบา ๆ แล้วกลับใบบัวเดิม ไม่ลดก้าว ไม่หักดาว
 */
export interface FrogConfig {
  oralThreshold: number;
  steps: number;
}

export const FROG_STEPS = 8;

export type FrogEvent = { type: "jump"; step: number } | { type: "splash" } | { type: "done" };

export interface FrogState {
  step: number;
  attempts: Attempt[];
  stars: number;
  /** Live latched status while a segment is open (for the crouch cue). */
  passingLive: boolean;
  speaking: boolean;
  inSegment: boolean;
  practiceMs: number;
  done: boolean;
}

export class FrogGame {
  readonly cfg: FrogConfig;
  state: FrogState;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();

  constructor(cfg: FrogConfig) {
    this.cfg = cfg;
    this.state = {
      step: 0,
      attempts: [],
      stars: 0,
      passingLive: false,
      speaking: false,
      inSegment: false,
      practiceMs: 0,
      done: false,
    };
  }

  interrupt(): void {
    this.seg.reset();
    this.latch.reset();
    this.state = { ...this.state, passingLive: false, speaking: false, inSegment: false };
  }

  finish(): void {
    this.seg.reset();
    this.state = { ...this.state, done: true };
  }

  update(frame: SignalFrame, now: number, dtMs: number): FrogEvent[] {
    const s = this.state;
    if (s.done) return [];
    const events: FrogEvent[] = [];

    const passingLive = frame.speaking && this.latch.update(frame.oral, this.cfg.oralThreshold);
    if (!frame.speaking) this.latch.reset();

    let { step, stars, attempts } = s;
    let done = false;
    const ev = this.seg.update(frame, now);
    if (ev?.type === "end") {
      const passed = 100 - ev.stats.meanNasal >= this.cfg.oralThreshold;
      attempts = [...attempts, { meanNasal: ev.stats.meanNasal, passed, durationMs: ev.stats.durationMs }];
      if (passed) {
        step += 1;
        stars += 1;
        events.push({ type: "jump", step });
        if (step >= this.cfg.steps) {
          done = true;
          events.push({ type: "done" });
        }
      } else {
        events.push({ type: "splash" });
      }
    }

    this.state = {
      step,
      attempts,
      stars,
      passingLive,
      speaking: frame.speaking,
      inSegment: this.seg.isActive(),
      practiceMs: s.practiceMs + practiceDelta(frame, dtMs),
      done,
    };
    return events;
  }
}
