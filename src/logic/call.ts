import type { Resonance } from "../data/callWords";
import type { CallWordSummary } from "../data/schema";

/** One turn of a round: a friend to call (frog) or a stretch of the route (runner). */
export interface CallItem {
  id: string;
  word: string;
  resonance: Resonance;
}
import { QUALITY_DEFAULTS } from "../signal/quality";
import type { SignalFrame } from "../signal/SignalProcessor";
import { clampDt } from "./common";
import { SpeechSegmenter } from "./segmenter";

/**
 * ด่านเรียกเพื่อน (ปรับจากกบข้ามบึง) — แยกสามเรื่องออกจากกัน
 * 1) ตรวจพบการลองพูด: ช่วงเสียงจาก speechDetected ขณะเกมกำลังฟัง (ไม่ฟังระหว่างเล่นเสียงตัวอย่าง)
 * 2) คุณภาพสัญญาณ: เบาเกินไป / ล้น / ช่องไมค์หาย / หลุดกลางคัน = “ขอลองใหม่” ไม่ใช่ความผิดของเด็ก ไม่หักอะไร
 * 3) ค่าออกจมูก: เก็บเชิงพรรณนาแยกตามชนิดคำให้ผู้ใหญ่ดู ไม่ใช้ตัดสินในเกม (ไม่มีกติกา “ยิ่งต่ำยิ่งดี”)
 * เพื่อนหันมาและตอบ “ได้ยินแล้ว” เมื่อได้ช่วงเสียงที่สัญญาณใช้ได้ — ไม่ได้แปลว่าออกเสียงถูก
 */
export const CALL_DEFAULTS = {
  /** หลังเสียงตัวอย่างจบ ยังไม่ฟังต่ออีกเท่านี้ (เสียงก้องจากลำโพง + ความหน่วงของอุปกรณ์) แล้วต้องเงียบก่อนจึงเริ่มฟัง */
  settleMs: 450,
  /** ถึงตาเด็กแล้วเงียบนานเท่านี้ → ชวนเรียกอีกครั้ง (ไม่นับเป็นครั้งที่ลอง) */
  nudgeAfterMs: 8000,
  /** สัดส่วนเฟรมที่ล้นตั้งแต่เท่านี้ = เสียงดังเกินกว่าจะใช้ค่า */
  clipShare: 0.2,
  /** ช่วงเสียงที่หลุดกลางคันจะนับเป็นการลอง (สัญญาณไม่พอ) ถ้าพูดไปแล้วอย่างน้อยเท่านี้ */
  minAttemptMs: 150,
};

export type CallIssue = "quiet" | "loud" | "lost" | "channel";
export type CallPhase = "turn" | "playing" | "settle" | "heard" | "done";

export interface WordStat {
  id: string;
  word: string;
  resonance: Resonance;
  /** Times the example word was played. */
  listens: number;
  /** Detected speech segments while the game was listening (usable or not). */
  attempts: number;
  /** Attempts whose signal could be used. */
  usable: number;
  /** Attempts that could not be used, by reason — device/signal trouble, never a mark against the child. */
  issues: Record<CallIssue, number>;
  /** Sum of the mean nasal % of usable attempts (descriptive only). */
  nasalSum: number;
  heard: boolean;
  skipped: boolean;
}

export type CallEvent =
  /** A usable attempt. meanNasal/durationMs describe it (descriptive; only an expert-set target may judge it). */
  | { type: "heard"; index: number; first: boolean; meanNasal: number; durationMs: number }
  | { type: "retry"; index: number; issue: CallIssue }
  | { type: "nudge"; index: number }
  | { type: "next"; index: number }
  | { type: "done" };

export interface CallState {
  index: number;
  phase: CallPhase;
  /** Where to go back to after the example has played. */
  resume: "turn" | "heard";
  /** What is playing: the example word, or the friend's spoken reply. */
  playKind: "model" | "reply";
  settleUntil: number;
  /** Listening only starts after a silent frame (never mid-utterance after the example, a retry or a reconnect). */
  armed: boolean;
  /** Reason of the last unusable attempt, shown as "ขอลองใหม่" until the next attempt or retry. */
  issue: CallIssue | null;
  nudged: boolean;
  /** The child is speaking and the attempt is being collected. */
  inAttempt: boolean;
  words: WordStat[];
  stars: number;
  practiceMs: number;
  /** Increments on every usable attempt (scene: happy gesture). */
  heardSeq: number;
  /** Increments on every unusable attempt (scene: curious head tilt). */
  askSeq: number;
}

interface Acc {
  startAt: number;
  lastVoicedAt: number;
  frames: number;
  clipFrames: number;
  peakDb: number | null;
  known: boolean;
}

export function emptyStat(w: CallItem): WordStat {
  return {
    id: w.id,
    word: w.word,
    resonance: w.resonance,
    listens: 0,
    attempts: 0,
    usable: 0,
    issues: { quiet: 0, loud: 0, lost: 0, channel: 0 },
    nasalSum: 0,
    heard: false,
    skipped: false,
  };
}

export class CallGame {
  /** Round order; the child may still reorder the turns that have not started yet (`chooseNext`). */
  words: CallItem[];
  readonly cfg: typeof CALL_DEFAULTS;
  state: CallState;
  private seg: SpeechSegmenter;
  private acc: Acc | null = null;
  private silentMs = 0;
  /** Mics ignored until this time (device feedback such as a vibration just played), then listening waits for silence. */
  private holdT = -Infinity;

  constructor(words: CallItem[], cfg: Partial<typeof CALL_DEFAULTS> = {}) {
    this.words = words;
    this.cfg = { ...CALL_DEFAULTS, ...cfg };
    this.seg = new SpeechSegmenter({ minSegmentMs: this.cfg.minAttemptMs });
    this.state = {
      index: 0,
      phase: "turn",
      resume: "turn",
      playKind: "model",
      settleUntil: 0,
      armed: false,
      issue: null,
      nudged: false,
      inAttempt: false,
      words: words.map(emptyStat),
      stars: 0,
      practiceMs: 0,
      heardSeq: 0,
      askSeq: 0,
    };
  }

  get current(): WordStat | null {
    return this.state.words[this.state.index] ?? null;
  }

  /** Example word (or the friend's reply) starts playing: the mic is ignored from now on. */
  listenStart(kind: "model" | "reply" = "model"): void {
    const s = this.state;
    if (s.phase === "done") return;
    this.dropAttempt();
    const resume = s.phase === "heard" || (s.phase !== "turn" && s.resume === "heard") ? "heard" : "turn";
    const words = kind === "model" ? this.patchWord(s.index, (w) => ({ ...w, listens: w.listens + 1 })) : s.words;
    this.state = { ...s, phase: "playing", resume, playKind: kind, words, armed: false, inAttempt: false, issue: null, nudged: false };
    this.silentMs = 0;
  }

  /** The friend has heard the child in this turn (also while its reply is playing). */
  get heardNow(): boolean {
    const s = this.state;
    return s.phase === "heard" || ((s.phase === "playing" || s.phase === "settle") && s.resume === "heard");
  }

  /** Playback ended (or the adult finished modelling): keep ignoring for settleMs, then wait for silence. */
  listenEnd(now: number): void {
    const s = this.state;
    if (s.phase !== "playing") return;
    this.state = { ...s, phase: "settle", settleUntil: now + this.cfg.settleMs, armed: false };
  }

  /** "ลองใหม่": clear the message and listen again from silence. Nothing is counted or taken away. */
  retry(): void {
    const s = this.state;
    if (s.phase === "done") return;
    this.dropAttempt();
    this.silentMs = 0;
    this.state = { ...s, issue: null, nudged: false, armed: false, inAttempt: false };
  }

  /** "ข้าม": move on without penalty; the word is marked skipped unless the friend already heard it. */
  skip(): CallEvent[] {
    if (this.state.phase === "done") return [];
    return this.advance(true);
  }

  /** "ไปหาเพื่อนต่อไป" after the friend has heard the child. */
  next(): CallEvent[] {
    if (!this.heardNow) return [];
    return this.advance(false);
  }

  /**
   * The child picks which of the remaining turns comes next. Only turns that have not started move,
   * and each keeps its own stats (they travel with the item, keyed by id). Returns false if `id` is not waiting.
   */
  chooseNext(id: string): boolean {
    const s = this.state;
    const from = this.words.findIndex((w, i) => w.id === id && i > s.index);
    if (from < 0) return false;
    const to = s.index + 1;
    if (from === to) return true;
    const move = <T>(list: T[]): T[] => {
      const out = [...list];
      const [item] = out.splice(from, 1);
      out.splice(to, 0, item);
      return out;
    };
    this.words = move(this.words);
    this.state = { ...s, words: move(s.words) };
    return true;
  }

  /**
   * A short device feedback (vibration) has just played, after the attempt closed: whatever the mics pick up until
   * `until` is not the child, and listening restarts only from a silent frame after it (the same re-arm as after an
   * example word). Nothing is counted or taken away.
   */
  holdUntil(until: number): void {
    if (this.state.phase === "done") return;
    if (until > this.holdT) this.holdT = until;
    this.dropAttempt();
    this.silentMs = 0;
    this.state = { ...this.state, armed: false, inAttempt: false };
  }

  /** Pause / tab hidden: the open attempt is dropped, never scored. */
  interrupt(): void {
    this.dropAttempt();
    const s = this.state;
    const phase = s.phase === "playing" || s.phase === "settle" ? s.resume : s.phase;
    this.state = { ...s, phase, armed: false, inAttempt: false };
  }

  /** End the round early ("จบรอบและดูสรุป"). */
  finish(): void {
    this.dropAttempt();
    this.state = { ...this.state, phase: "done", inAttempt: false };
  }

  update(frame: SignalFrame, now: number, dtMs: number): CallEvent[] {
    const s = this.state;
    if (s.phase === "done") return [];
    const events: CallEvent[] = [];
    const practiceMs = s.practiceMs + (frame.valid && s.phase !== "playing" ? clampDt(dtMs) : 0);

    // Example playing / settling: whatever the mics pick up (often the speaker itself) is not the child.
    if (s.phase === "playing" || s.phase === "settle") {
      this.dropAttempt();
      const phase = s.phase === "settle" && now >= s.settleUntil ? s.resume : s.phase;
      this.state = { ...s, phase, practiceMs, armed: false, inAttempt: false };
      return events;
    }

    // Device feedback still ringing (vibration + guard): not the child; afterwards wait for silence.
    if (now < this.holdT) {
      this.dropAttempt();
      this.state = { ...s, practiceMs, armed: false, inAttempt: false };
      return events;
    }

    // Device trouble: close an open attempt as a signal problem, then wait for fresh data and silence.
    if (!frame.valid) {
      let next: CallState = { ...s, practiceMs, armed: false, inAttempt: false };
      if (this.acc && this.acc.lastVoicedAt - this.acc.startAt >= this.cfg.minAttemptMs) {
        const issue: CallIssue = frame.status === "channel" ? "channel" : "lost";
        next = this.recordIssue(next, issue);
        events.push({ type: "retry", index: s.index, issue });
      }
      this.dropAttempt();
      this.silentMs = 0;
      this.state = next;
      return events;
    }

    if (!s.armed) {
      this.state = { ...s, practiceMs, armed: !frame.speaking, inAttempt: false };
      return events;
    }

    let next: CallState = { ...s, practiceMs };
    const ev = this.seg.update(frame, now);
    if (ev?.type === "start") {
      this.acc = { startAt: now, lastVoicedAt: now, frames: 0, clipFrames: 0, peakDb: null, known: frame.quality.known };
      next = { ...next, issue: null, nudged: false };
    }
    if (this.acc && frame.speaking) {
      const a = this.acc;
      a.lastVoicedAt = now;
      a.frames += 1;
      if (frame.quality.clip) a.clipFrames += 1;
      if (frame.quality.levelDb !== null) a.peakDb = a.peakDb === null ? frame.quality.levelDb : Math.max(a.peakDb, frame.quality.levelDb);
      a.known = a.known && frame.quality.known;
    }
    if (ev?.type === "end") {
      const issue = this.classify();
      const meanNasal = ev.stats.meanNasal;
      this.acc = null;
      if (issue) {
        next = this.recordIssue(next, issue);
        events.push({ type: "retry", index: s.index, issue });
      } else {
        const first = !next.words[s.index].heard;
        next = {
          ...next,
          phase: "heard",
          resume: "heard",
          stars: next.stars + (first ? 1 : 0),
          heardSeq: next.heardSeq + 1,
          words: patch(next.words, s.index, (w) => ({ ...w, attempts: w.attempts + 1, usable: w.usable + 1, nasalSum: w.nasalSum + meanNasal, heard: true })),
        };
        events.push({ type: "heard", index: s.index, first, meanNasal, durationMs: ev.stats.durationMs });
      }
    } else if (ev?.type === "discard") {
      this.acc = null; // a blip shorter than an attempt: not counted at all
    }

    // Gentle nudge after a long silence on the child's turn (no attempt, no penalty).
    if (next.phase === "turn" && !frame.speaking && !this.seg.isActive()) {
      this.silentMs += clampDt(dtMs);
      if (this.silentMs >= this.cfg.nudgeAfterMs && !next.nudged) {
        next = { ...next, nudged: true };
        events.push({ type: "nudge", index: s.index });
      }
    } else {
      this.silentMs = 0;
    }

    this.state = { ...next, inAttempt: this.seg.isActive() };
    return events;
  }

  /** Signal quality of the attempt that just ended (null = usable). Unknown levels cannot be judged, so they pass. */
  private classify(): CallIssue | null {
    const a = this.acc;
    if (!a || !a.known || a.frames === 0) return null;
    if (a.clipFrames / a.frames >= this.cfg.clipShare) return "loud";
    if (a.peakDb === null || a.peakDb < QUALITY_DEFAULTS.quietDb) return "quiet";
    return null;
  }

  private recordIssue(s: CallState, issue: CallIssue): CallState {
    return {
      ...s,
      issue,
      askSeq: s.askSeq + 1,
      words: patch(s.words, s.index, (w) => ({ ...w, attempts: w.attempts + 1, issues: { ...w.issues, [issue]: w.issues[issue] + 1 } })),
    };
  }

  private advance(skipped: boolean): CallEvent[] {
    this.dropAttempt();
    this.silentMs = 0;
    const s = this.state;
    const words = skipped ? patch(s.words, s.index, (w) => (w.heard ? w : { ...w, skipped: true })) : s.words;
    const index = s.index + 1;
    if (index >= this.words.length) {
      this.state = { ...s, words, index: this.words.length, phase: "done", inAttempt: false, issue: null };
      return [{ type: "done" }];
    }
    this.state = { ...s, words, index, phase: "turn", resume: "turn", armed: false, inAttempt: false, issue: null, nudged: false };
    return [{ type: "next", index }];
  }

  private dropAttempt(): void {
    this.seg.reset();
    this.acc = null;
  }

  private patchWord(i: number, f: (w: WordStat) => WordStat): WordStat[] {
    return patch(this.state.words, i, f);
  }
}

function patch(list: WordStat[], i: number, f: (w: WordStat) => WordStat): WordStat[] {
  return list.map((w, j) => (j === i ? f(w) : w));
}

/** What is kept about one word: counts and a descriptive mean — no audio. */
export function wordSummary(w: WordStat): CallWordSummary {
  return {
    id: w.id,
    word: w.word,
    resonance: w.resonance,
    listens: w.listens,
    attempts: w.attempts,
    usable: w.usable,
    issues: { ...w.issues },
    meanNasal: w.usable > 0 ? Math.round((w.nasalSum / w.usable) * 10) / 10 : null,
    heard: w.heard,
    skipped: w.skipped,
  };
}
