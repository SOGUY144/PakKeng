import type { ConnectionState, SignalSample } from "./types";

export type FrameStatus = "ok" | "silent" | "stale" | "connecting" | "disconnected";

export interface SignalFrame {
  status: FrameStatus;
  /** Data is usable (link up, fresh, in range). */
  valid: boolean;
  /** valid && speechDetected — the only state in which games may score. */
  speaking: boolean;
  /** Latest raw nasal % while speaking, else null. */
  nasalRaw: number | null;
  /** Smoothed nasal % while speaking, else null (never shown as "100% oral"). */
  nasal: number | null;
  /** 100 - nasal while speaking, else null. */
  oral: number | null;
  /** performance.now() of the sample behind this frame (for latency readout). */
  sampleT: number | null;
}

/** Demo parameters — chosen so a step change is ~95% visible within 180 ms. */
export const PROCESSOR_DEFAULTS = {
  smoothingTauMs: 60,
  staleAfterMs: 300,
};

const EMPTY = {
  speaking: false,
  nasalRaw: null,
  nasal: null,
  oral: null,
} as const;

export class SignalProcessor {
  private smooth: number | null = null;
  private lastNow: number | null = null;
  private tauMs: number;
  private staleAfterMs: number;

  constructor(opts: Partial<typeof PROCESSOR_DEFAULTS> = {}) {
    this.tauMs = opts.smoothingTauMs ?? PROCESSOR_DEFAULTS.smoothingTauMs;
    this.staleAfterMs = opts.staleAfterMs ?? PROCESSOR_DEFAULTS.staleAfterMs;
  }

  reset(): void {
    this.smooth = null;
    this.lastNow = null;
  }

  step(sample: SignalSample | null, conn: ConnectionState, now: number): SignalFrame {
    const dt = this.lastNow === null ? 0 : Math.max(0, now - this.lastNow);
    this.lastNow = now;

    if (conn !== "connected") {
      this.smooth = null;
      return { status: conn, valid: false, ...EMPTY, sampleT: sample?.t ?? null };
    }
    if (
      !sample ||
      !Number.isFinite(sample.nasalPercent) ||
      sample.nasalPercent < 0 ||
      sample.nasalPercent > 100 ||
      now - sample.t > this.staleAfterMs
    ) {
      this.smooth = null;
      return { status: "stale", valid: false, ...EMPTY, sampleT: sample?.t ?? null };
    }
    if (!sample.speechDetected) {
      this.smooth = null;
      return { status: "silent", valid: true, ...EMPTY, sampleT: sample.t };
    }

    // Start each voiced stretch from the raw value so onset feedback is immediate.
    if (this.smooth === null || dt === 0) {
      this.smooth = sample.nasalPercent;
    } else {
      const a = 1 - Math.exp(-dt / this.tauMs);
      this.smooth += a * (sample.nasalPercent - this.smooth);
    }
    const nasal = this.smooth;
    return {
      status: "ok",
      valid: true,
      speaking: true,
      nasalRaw: sample.nasalPercent,
      nasal,
      oral: 100 - nasal,
      sampleT: sample.t,
    };
  }
}
