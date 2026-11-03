import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, clampDt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter } from "./segmenter";

/**
 * ด่านประตูเสียงนาสิก — ตรรกะแยกจากเกมด้านปาก:
 * - ใช้เกณฑ์ “ออกจมูก ≥ gateThreshold” (ไม่ใช่ออกปาก)
 * - ประตูเปิดแบบสะสมเวลาที่พูดและอยู่ในโซน (ไม่ลดลงเมื่อหลุดโซน) จนครบ openMs
 * - ความเงียบหรือข้อมูลค้าง/หลุดไม่ทำให้ประตูขยับ
 */
export interface GateConfig {
  nasalThreshold: number;
  openMs: number;
}

export const GATE_OPEN_MS = 1500;
/** After this many voiced attempts without opening, offer a no-pressure skip. */
export const GATE_SKIP_AFTER = 3;

export type GateEvent = { type: "attempt"; attempt: Attempt } | { type: "open" };

export interface GateState {
  progress: number;
  inZoneMs: number;
  inZone: boolean;
  speaking: boolean;
  attempts: Attempt[];
  open: boolean;
  practiceMs: number;
}

export class GateGame {
  readonly cfg: GateConfig;
  state: GateState;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();

  constructor(cfg: GateConfig) {
    this.cfg = cfg;
    this.state = { progress: 0, inZoneMs: 0, inZone: false, speaking: false, attempts: [], open: false, practiceMs: 0 };
  }

  interrupt(): void {
    this.seg.reset();
    this.latch.reset();
    this.state = { ...this.state, inZone: false, speaking: false };
  }

  update(frame: SignalFrame, now: number, dtMs: number): GateEvent[] {
    const s = this.state;
    const events: GateEvent[] = [];
    const dt = clampDt(dtMs);

    const inZone = frame.speaking && this.latch.update(frame.nasal, this.cfg.nasalThreshold);
    if (!frame.speaking) this.latch.reset();

    let inZoneMs = s.inZoneMs;
    let open = s.open;
    let justOpened = false;
    if (inZone && !open) {
      inZoneMs += dt;
      if (inZoneMs >= this.cfg.openMs) {
        open = true;
        justOpened = true;
      }
    }

    let attempts = s.attempts;
    const ev = this.seg.update(frame, now);
    // The utterance that opened the door is still open: close and count it now.
    const finished = ev?.type === "end" ? ev : justOpened ? this.seg.flush() : null;
    if (finished?.type === "end") {
      const attempt: Attempt = {
        meanNasal: finished.stats.meanNasal,
        passed: finished.stats.meanNasal >= this.cfg.nasalThreshold,
        durationMs: finished.stats.durationMs,
      };
      attempts = [...attempts, attempt];
      events.push({ type: "attempt", attempt });
    }
    if (justOpened) events.push({ type: "open" });

    this.state = {
      progress: Math.min(1, inZoneMs / this.cfg.openMs),
      inZoneMs,
      inZone,
      speaking: frame.speaking,
      attempts,
      open,
      practiceMs: s.practiceMs + practiceDelta(frame, dtMs),
    };
    return events;
  }
}
