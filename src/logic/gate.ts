import type { SignalFrame } from "../signal/SignalProcessor";
import { type Attempt, clampDt, practiceDelta } from "./common";
import { ThresholdLatch } from "./latch";
import { SpeechSegmenter } from "./segmenter";

/**
 * ด่านประตูเสียงนาสิก — ตรรกะแยกจากเกมด้านปาก:
 * - ใช้เกณฑ์ “ออกจมูก ≥ gateThreshold” (ไม่ใช่ออกปาก) กับคำนาสิกที่ผู้เชี่ยวชาญตั้ง: เป้าคือ “ถึงเกณฑ์” ไม่ใช่ “ยิ่งต่ำยิ่งดี”
 * - ประตูเปิดแบบสะสมเวลาที่พูดและอยู่ในโซน (ไม่ลดลงเมื่อหลุดโซน) จนครบ openMs
 * - ความเงียบหรือข้อมูลค้าง/หลุดไม่ทำให้ประตูขยับ
 * - ระหว่างเล่นเสียงตัวอย่าง (หรือผู้ใหญ่พูดให้ฟัง) และอีก settleMs หลังจบ ไม่ฟังไมค์ — เสียงลำโพงไม่ใช่เสียงเด็ก
 *   จากนั้น (และหลังลองใหม่ พัก หรืออุปกรณ์หลุด) ต้องเงียบหนึ่งเฟรมก่อนจึงเริ่มนับ ไม่นับต่อกลางคำ
 */
export interface GateConfig {
  nasalThreshold: number;
  openMs: number;
  /** Ignore the mics this long after the example ends (speaker echo + device delay). Default GATE_SETTLE_MS. */
  settleMs?: number;
}

export const GATE_OPEN_MS = 1500;
/** Same wait as the call level (CALL_DEFAULTS.settleMs). */
export const GATE_SETTLE_MS = 450;
/** After this many voiced attempts without opening, offer a no-pressure skip. */
export const GATE_SKIP_AFTER = 3;

export type GateEvent = { type: "attempt"; attempt: Attempt } | { type: "open" };

/** "listen" = the game hears the child; "playing" = the example word is sounding; "settle" = its echo is fading. */
export type GatePhase = "listen" | "playing" | "settle";

export interface GateState {
  progress: number;
  inZoneMs: number;
  inZone: boolean;
  /** The child is speaking and the game is counting it (never while an example plays). */
  speaking: boolean;
  attempts: Attempt[];
  open: boolean;
  practiceMs: number;
  phase: GatePhase;
  settleUntil: number;
  /** Counting (re)starts only after a silent frame: never mid-utterance after the example, a retry, a pause or a device drop. */
  armed: boolean;
  /** Times the example word was played (or modelled by an adult). */
  listens: number;
}

export class GateGame {
  readonly cfg: GateConfig;
  state: GateState;
  private settleMs: number;
  private latch = new ThresholdLatch();
  private seg = new SpeechSegmenter();

  constructor(cfg: GateConfig) {
    this.cfg = cfg;
    this.settleMs = cfg.settleMs ?? GATE_SETTLE_MS;
    this.state = {
      progress: 0,
      inZoneMs: 0,
      inZone: false,
      speaking: false,
      attempts: [],
      open: false,
      practiceMs: 0,
      phase: "listen",
      settleUntil: 0,
      armed: true,
      listens: 0,
    };
  }

  /** The example word starts playing (or an adult says it): the mics are ignored from now on. */
  listenStart(): void {
    const s = this.state;
    if (s.open) return;
    this.drop();
    this.state = { ...s, phase: "playing", inZone: false, speaking: false, armed: false, listens: s.listens + 1 };
  }

  /** Playback ended (or the adult finished): keep ignoring for settleMs, then wait for silence. */
  listenEnd(now: number): void {
    const s = this.state;
    if (s.phase !== "playing") return;
    this.state = { ...s, phase: "settle", settleUntil: now + this.settleMs };
  }

  /** "ลองใหม่": the utterance in progress is dropped (never counted) and listening restarts after silence. Progress stays: it never goes down. */
  retry(): void {
    if (this.state.open) return;
    this.stopListening();
  }

  /** Pause / tab hidden: the open utterance is dropped, never scored; listening restarts after silence. */
  interrupt(): void {
    this.stopListening();
  }

  update(frame: SignalFrame, now: number, dtMs: number): GateEvent[] {
    const s = this.state;
    const events: GateEvent[] = [];
    const dt = clampDt(dtMs);
    const practiceMs = s.practiceMs + (s.phase === "playing" ? 0 : practiceDelta(frame, dtMs));

    // Example playing / echo settling: whatever the mics pick up (often the speaker itself) is not the child.
    if (s.phase !== "listen") {
      this.drop();
      const phase = s.phase === "settle" && now >= s.settleUntil ? "listen" : s.phase;
      this.state = { ...s, phase, practiceMs, inZone: false, speaking: false, armed: false };
      return events;
    }
    // Device trouble, or not listening again yet: the door does not move; counting restarts at the first silent frame of usable data.
    if (!frame.valid || !s.armed) {
      this.drop();
      this.state = { ...s, practiceMs, inZone: false, speaking: false, armed: frame.valid && !frame.speaking };
      return events;
    }

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
      ...s,
      progress: Math.min(1, inZoneMs / this.cfg.openMs),
      inZoneMs,
      inZone,
      speaking: frame.speaking,
      attempts,
      open,
      practiceMs,
    };
    return events;
  }

  private stopListening(): void {
    this.drop();
    this.state = { ...this.state, phase: "listen", inZone: false, speaking: false, armed: false };
  }

  private drop(): void {
    this.seg.reset();
    this.latch.reset();
  }
}
