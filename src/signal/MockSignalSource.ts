import type { ConnectionState, SignalSample, SignalSource } from "./types";

export type SpeechMode = "off" | "on" | "bursts";
export type ValuePattern = "manual" | "ramp" | "oscillate";
/** Simulated loudness of the child's voice at the mics. */
export type VoiceLevel = "normal" | "quiet" | "loud";
/** Simulated mic wiring: both alive, or one INMP441 channel dead (digital silence). */
export type MicChannels = "both" | "nasal-missing" | "oral-missing";

export interface MockParams {
  /** Slider value: simulated oral % (nasal = 100 - oral). */
  oralPercent: number;
  speechMode: SpeechMode;
  /** True while the "hold to speak" button / Space key is held. */
  holding: boolean;
  pattern: ValuePattern;
  /** Oral-% centre used by the "oscillate near threshold" pattern. Set by the active screen. */
  oscillateCenter: number;
  /** Simulated device link. */
  linkUp: boolean;
  level: VoiceLevel;
  channels: MicChannels;
  /** Demo option: the phone speaker playing the example word leaks into the mics. */
  leak: boolean;
  /** Set by the demo panel while an example word is playing (used only when `leak` is on). */
  speaker: boolean;
}

/** Deterministic reset target for the demo "รีเซ็ต" button. */
export const MOCK_DEFAULTS: MockParams = {
  oralPercent: 75,
  speechMode: "off",
  holding: false,
  pattern: "manual",
  oscillateCenter: 70,
  linkUp: true,
  level: "normal",
  channels: "both",
  leak: false,
  speaker: false,
};

/** Demo parameters (documented in DECISIONS.md) — not hardware facts. */
export const MOCK_TICK_MS = 20; // 50 Hz
export const MOCK_CONNECT_DELAY_MS = 800;
export const BURST_ON_MS = 1200;
export const BURST_PERIOD_MS = 2000;
export const RAMP_MIN = 40;
export const RAMP_MAX = 95;
export const RAMP_PERIOD_MS = 8000;
export const OSC_AMPLITUDE = 3;
export const OSC_PERIOD_MS = 1400;
/** Simulated loudest-channel level while speaking (dBFS) and the noise floor of a live mic. */
export const MOCK_LEVEL_DB: Record<VoiceLevel, number> = { normal: -22, quiet: -52, loud: 0 };
export const MOCK_FLOOR_DB = -80;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ampDb = (share: number) => 20 * Math.log10(Math.max(share, 0.02));

/** Pure: simulated oral % at `elapsedMs` since the pattern started. */
export function mockOralAt(params: MockParams, elapsedMs: number): number {
  switch (params.pattern) {
    case "manual":
      return clamp(params.oralPercent, 0, 100);
    case "ramp": {
      // Triangle wave RAMP_MIN → RAMP_MAX → RAMP_MIN
      const phase = (elapsedMs % RAMP_PERIOD_MS) / RAMP_PERIOD_MS;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      return RAMP_MIN + (RAMP_MAX - RAMP_MIN) * tri;
    }
    case "oscillate":
      return clamp(
        params.oscillateCenter + OSC_AMPLITUDE * Math.sin((2 * Math.PI * elapsedMs) / OSC_PERIOD_MS),
        0,
        100,
      );
  }
}

/** Pure: simulated speechDetected at `elapsedMs` since the speech mode started. */
export function mockSpeechAt(params: MockParams, elapsedMs: number): boolean {
  if (params.holding) return true;
  if (params.leak && params.speaker) return true;
  switch (params.speechMode) {
    case "off":
      return false;
    case "on":
      return true;
    case "bursts":
      return elapsedMs % BURST_PERIOD_MS < BURST_ON_MS;
  }
}

/**
 * Pure: the device fields for one simulated window. Amplitudes split by the nasal share
 * (nasalance = A_nasal / (A_nasal + A_oral)), so a dead channel also skews nasalPercent — as real hardware would.
 */
export function mockReading(params: MockParams, oral: number, speech: boolean) {
  const share = clamp(100 - oral, 0, 100) / 100;
  const base = speech ? MOCK_LEVEL_DB[params.level] : MOCK_FLOOR_DB;
  let nasalDb = speech ? base + ampDb(share) : base;
  let oralDb = speech ? base + ampDb(1 - share) : base;
  let nasalPercent = Math.round(share * 1000) / 10;
  if (params.channels === "nasal-missing") {
    nasalDb = -Infinity;
    nasalPercent = 0;
  } else if (params.channels === "oral-missing") {
    oralDb = -Infinity;
    nasalPercent = 100;
  }
  return {
    nasalPercent,
    speechDetected: speech,
    nasalDb: Math.round(nasalDb * 10) / 10,
    oralDb: Math.round(oralDb * 10) / 10,
    clip: speech && params.level === "loud",
  };
}

export class MockSignalSource implements SignalSource {
  readonly kind = "mock" as const;
  private params: MockParams = { ...MOCK_DEFAULTS };
  private sample: SignalSample | null = null;
  private conn: ConnectionState = "connected";
  private timer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private patternStart = 0;
  private speechStart = 0;
  private listeners = new Set<() => void>();
  private now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.patternStart = now();
    this.speechStart = now();
  }

  getParams(): MockParams {
    return this.params;
  }

  latest(): SignalSample | null {
    return this.sample;
  }

  connection(): ConnectionState {
    return this.conn;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setParams(patch: Partial<MockParams>): void {
    const prev = this.params;
    const next = { ...prev, ...patch };
    this.params = next;
    if (patch.pattern !== undefined && patch.pattern !== prev.pattern) this.patternStart = this.now();
    if (patch.speechMode !== undefined && patch.speechMode !== prev.speechMode) this.speechStart = this.now();
    if (patch.linkUp !== undefined && patch.linkUp !== prev.linkUp) this.applyLink(next.linkUp);
    // Emit immediately so the UI reacts on the next frame instead of waiting for the tick.
    this.tick();
    this.emit();
  }

  reset(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.params = { ...MOCK_DEFAULTS };
    this.conn = "connected";
    this.patternStart = this.now();
    this.speechStart = this.now();
    this.tick();
    this.emit();
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), MOCK_TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Produce one sample from the current parameters (no sample while the link is down). */
  tick(): void {
    if (this.conn !== "connected") return;
    const now = this.now();
    const oral = mockOralAt(this.params, now - this.patternStart);
    this.sample = { ...mockReading(this.params, oral, mockSpeechAt(this.params, now - this.speechStart)), t: now };
  }

  private applyLink(up: boolean): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
    // Nothing from before the drop may be read after it (no stale packet survives a reconnect).
    this.sample = null;
    if (!up) {
      this.conn = "disconnected";
      return;
    }
    this.conn = "connecting";
    this.connectTimer = setTimeout(() => {
      this.conn = "connected";
      this.connectTimer = null;
      this.tick();
      this.emit();
    }, MOCK_CONNECT_DELAY_MS);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
