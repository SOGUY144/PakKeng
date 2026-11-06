import { describe, expect, it } from "vitest";
import { playSuccessChime, scheduleSuccessChime, stopSfx, SUCCESS_NOTES } from "./sfx";

/** Minimal stand-in for the Web Audio nodes the chime uses; records each oscillator's frequency and start time. */
function fakeContext() {
  const played: { freq: number; at: number; until: number }[] = [];
  const param = (onSet?: (v: number) => void) => ({
    setValueAtTime(v: number) {
      onSet?.(v);
      return this;
    },
    exponentialRampToValueAtTime() {
      return this;
    },
  });
  const ctx = {
    createGain: () => ({ gain: param(), connect: (n: unknown) => n }),
    createOscillator: () => {
      const rec = { freq: 0, at: 0, until: 0 };
      return {
        type: "",
        frequency: param((v) => (rec.freq = v)),
        connect: (n: unknown) => n,
        start: (t: number) => {
          rec.at = t;
          played.push(rec);
        },
        stop: (t: number) => (rec.until = t),
      };
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, played };
}

describe("sound effects", () => {
  it("does nothing, and never throws, before the first tap unlocks audio", () => {
    expect(playSuccessChime()).toBe(false);
    expect(() => stopSfx()).not.toThrow();
  });

  it("success chime: the four notes rise in order from the requested time, then a short sparkle, all within 1.5 s", () => {
    const { ctx, played } = fakeContext();
    const count = scheduleSuccessChime(ctx, {} as AudioNode, 2);
    expect(count).toBe(played.length);

    const bodies = SUCCESS_NOTES.map((f) => played.find((p) => p.freq === f));
    expect(bodies.every(Boolean)).toBe(true);
    const starts = bodies.map((b) => b!.at);
    expect(starts[0]).toBe(2);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect([...SUCCESS_NOTES]).toEqual([...SUCCESS_NOTES].sort((a, b) => a - b));

    const end = Math.max(...played.map((p) => p.until));
    expect(end - 2).toBeLessThan(1.5);
    expect(end - 2).toBeGreaterThan(0.8);
  });
});
