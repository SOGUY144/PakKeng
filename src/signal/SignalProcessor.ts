import { frameQuality, UNKNOWN_QUALITY, type FrameQuality } from "./quality";
import type { ConnectionState, SignalSample } from "./types";

/** "channel" = linked and fresh, but one or both mics give no signal — the nasal % is meaningless then. */
export type FrameStatus = "ok" | "silent" | "stale" | "channel" | "connecting" | "disconnected";

export interface SignalFrame {
  status: FrameStatus;
  /** Data is usable (link up, fresh, in range, both mic channels alive). */
  valid: boolean;
  /** valid && speechDetected — the only state in which games may score. */
  speaking: boolean;
  /** Latest raw nasal % while speaking, else null. */
  nasalRaw: number | null;
  /** Smoothed nasal % while speaking, else null (never shown as "100% oral"). */
  nasal: number | null;
  /** 100 - nasal while speaking, else null. */
  oral: number | null;
  /** Level / clipping / mic-channel checks of the sample behind this frame. */
  quality: FrameQuality;
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
      return { status: conn, valid: false, ...EMPTY, quality: UNKNOWN_QUALITY, sampleT: sample?.t ?? null };
    }
    if (
      !sample ||
      !Number.isFinite(sample.nasalPercent) ||
      sample.nasalPercent < 0 ||
      sample.nasalPercent > 100 ||
      now - sample.t > this.staleAfterMs
    ) {
      this.smooth = null;
      return { status: "stale", valid: false, ...EMPTY, quality: UNKNOWN_QUALITY, sampleT: sample?.t ?? null };
    }
    const quality = frameQuality(sample);
    if (quality.known && quality.channels !== "ok") {
      // A dead mic makes the ratio read 0% or 100% — never pass that on as a measurement.
      this.smooth = null;
      return { status: "channel", valid: false, ...EMPTY, quality, sampleT: sample.t };
    }
    if (!sample.speechDetected) {
      this.smooth = null;
      return { status: "silent", valid: true, ...EMPTY, quality, sampleT: sample.t };
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
      quality,
      sampleT: sample.t,
    };
  }
}
