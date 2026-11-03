import type { SignalFrame } from "../signal/SignalProcessor";

/** Frames arriving after a long gap (tab switch, breakpoint) never count more than this. */
export const MAX_FRAME_DT_MS = 100;

export const clampDt = (dtMs: number) => Math.min(Math.max(dtMs, 0), MAX_FRAME_DT_MS);

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Attempt {
  /** Mean nasal % over the voiced segment (raw samples). */
  meanNasal: number;
  passed: boolean;
  durationMs: number;
}

export interface SegmentTotals {
  attempts: number;
  passed: number;
  /** Mean nasal % across attempts, or null when nothing was said. */
  meanNasal: number | null;
}

export function totals(list: Attempt[]): SegmentTotals {
  if (list.length === 0) return { attempts: 0, passed: 0, meanNasal: null };
  const sum = list.reduce((s, a) => s + a.meanNasal, 0);
  return {
    attempts: list.length,
    passed: list.filter((a) => a.passed).length,
    meanNasal: sum / list.length,
  };
}

/** Practice time only advances while data is usable (pausing stops calling update()). */
export function practiceDelta(frame: SignalFrame, dtMs: number): number {
  return frame.valid ? clampDt(dtMs) : 0;
}
