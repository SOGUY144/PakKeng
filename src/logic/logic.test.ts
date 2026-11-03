import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockOralAt, mockSpeechAt } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { ConnectionState } from "../signal/types";
import { BalloonGame } from "./balloon";
import { FrogGame } from "./frog";
import { GateGame } from "./gate";
import { ThresholdLatch } from "./latch";
import { RunnerGame } from "./runner";
import { roundStars } from "./scoring";
import { SpeechSegmenter } from "./segmenter";

interface Phase {
  ms: number;
  nasal: number;
  speech: boolean;
  conn?: ConnectionState;
  /** Stop delivering new samples (device "stuck"): the last sample ages out. */
  freeze?: boolean;
}

interface Updatable<E> {
  update(frame: ReturnType<SignalProcessor["step"]>, now: number, dtMs: number): E[];
}

/** Drive a game at a fixed frame rate through a script of signal phases. */
function run<E>(game: Updatable<E>, phases: Phase[], fps = 60, start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / fps;
  let t = start;
  let last: { nasalPercent: number; speechDetected: boolean; t: number } | null = null;
  const events: E[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      if (!p.freeze && (p.conn ?? "connected") === "connected") last = { nasalPercent: p.nasal, speechDetected: p.speech, t };
      events.push(...game.update(proc.step(last, p.conn ?? "connected", t), t, dt));
    }
  }
  return { events, t };
}

const say = (ms: number, oral: number): Phase => ({ ms, nasal: 100 - oral, speech: true });
const quiet = (ms: number, oral = 90): Phase => ({ ms, nasal: 100 - oral, speech: false });

describe("SignalProcessor", () => {
  it("never reports an oral value while silent (no fake 100%)", () => {
    const p = new SignalProcessor();
    const f = p.step({ nasalPercent: 5, speechDetected: false, t: 0 }, "connected", 0);
    expect(f.valid).toBe(true);
    expect(f.speaking).toBe(false);
    expect(f.oral).toBeNull();
    expect(f.nasal).toBeNull();
  });

  it("marks data stale after 300 ms without a new sample", () => {
    const p = new SignalProcessor();
    const s = { nasalPercent: 20, speechDetected: true, t: 0 };
    expect(p.step(s, "connected", 250).valid).toBe(true);
    const f = p.step(s, "connected", 320);
    expect(f.valid).toBe(false);
    expect(f.status).toBe("stale");
  });

  it("rejects out-of-range values and disconnected links", () => {
    const p = new SignalProcessor();
    expect(p.step({ nasalPercent: 140, speechDetected: true, t: 0 }, "connected", 0).valid).toBe(false);
    expect(p.step({ nasalPercent: 20, speechDetected: true, t: 0 }, "disconnected", 0).status).toBe("disconnected");
  });

  it("shows 95% of a step change within 200 ms at 60 fps", () => {
    const p = new SignalProcessor();
    let t = 0;
    p.step({ nasalPercent: 20, speechDetected: true, t }, "connected", t);
    for (let i = 0; i < 10; i++) {
      t += 1000 / 60;
      p.step({ nasalPercent: 20, speechDetected: true, t }, "connected", t);
    }
    const t0 = t;
    let reached: number | null = null;
    while (t - t0 < 400) {
      t += 1000 / 60;
      const f = p.step({ nasalPercent: 60, speechDetected: true, t }, "connected", t);
      if (reached === null && (f.nasal as number) >= 20 + 0.95 * 40) reached = t - t0;
    }
    expect(reached).not.toBeNull();
    expect(reached as number).toBeLessThanOrEqual(200);
  });
});

describe("ThresholdLatch", () => {
  it("does not flicker when the value jitters around the threshold", () => {
    const l = new ThresholdLatch(2);
    const states: boolean[] = [];
    for (let i = 0; i < 40; i++) states.push(l.update(i % 2 ? 69.2 : 70.6, 70));
    const flips = states.filter((s, i) => i > 0 && s !== states[i - 1]).length;
    expect(flips).toBe(0);
  });
});

describe("SpeechSegmenter", () => {
  it("turns one long hold into exactly one segment", () => {
    const seg = new SpeechSegmenter();
    const { events } = run({ update: (f, now) => { const e = seg.update(f, now); return e ? [e] : []; } }, [say(3000, 80), quiet(500)]);
    expect(events.filter((e) => e.type === "end")).toHaveLength(1);
  });

  it("drops a segment when data becomes unusable mid-utterance", () => {
    const seg = new SpeechSegmenter();
    const { events } = run(
      { update: (f, now) => { const e = seg.update(f, now); return e ? [e] : []; } },
      [say(600, 80), { ms: 400, nasal: 20, speech: true, conn: "disconnected" }, quiet(400)],
    );
    expect(events.some((e) => e.type === "discard" && e.reason === "invalid")).toBe(true);
    // The reconnect-less tail never produces a scored end for the dropped part.
    expect(events.filter((e) => e.type === "end")).toHaveLength(0);
  });
});

describe("FrogGame", () => {
  const make = () => new FrogGame({ oralThreshold: 70, steps: 8 });

  it("a single long hold moves the frog at most one step", () => {
    const g = make();
    run(g, [say(4000, 85), quiet(400)]);
    expect(g.state.step).toBe(1);
    expect(g.state.attempts).toHaveLength(1);
  });

  it("separate passing segments move one step each", () => {
    const g = make();
    run(g, [say(400, 80), quiet(400), say(400, 80), quiet(400), say(400, 80), quiet(400)]);
    expect(g.state.step).toBe(3);
    expect(g.state.stars).toBe(3);
  });

  it("a failing segment splashes without taking steps or stars away", () => {
    const g = make();
    run(g, [say(400, 80), quiet(400)]);
    const { events } = run(g, [say(400, 50), quiet(400)], 60, 10_000);
    expect(events.some((e) => e.type === "splash")).toBe(true);
    expect(g.state.step).toBe(1);
    expect(g.state.stars).toBe(1);
  });

  it("no speech means no attempt, even with a high slider value", () => {
    const g = make();
    run(g, [quiet(3000, 95)]);
    expect(g.state.attempts).toHaveLength(0);
    expect(g.state.step).toBe(0);
  });

  it("interrupting (pause) drops the open segment instead of scoring it", () => {
    const g = make();
    run(g, [say(500, 85)]);
    g.interrupt();
    run(g, [quiet(500)], 60, 5_000);
    expect(g.state.attempts).toHaveLength(0);
    expect(g.state.step).toBe(0);
  });
});

describe("RunnerGame", () => {
  const make = () => new RunnerGame({ oralThreshold: 70, prompts: ["ปา", "ตา", "กา"], attemptsPerRound: 6 });

  it("silence with a high slider value scores nothing and the chaser does not fall back", () => {
    const g = make();
    const gap0 = g.state.gap;
    run(g, [quiet(4000, 95)]);
    expect(g.state.attempts).toHaveLength(0);
    expect(g.state.stars).toBe(0);
    expect(g.state.gap).toBeLessThanOrEqual(gap0);
  });

  it("passing speech pushes the chaser back continuously and earns a star per passing attempt", () => {
    const g = make();
    const gap0 = g.state.gap;
    run(g, [say(800, 82)]);
    expect(g.state.gap).toBeGreaterThan(gap0);
    run(g, [quiet(400)], 60, 900);
    expect(g.state.stars).toBe(1);
    expect(g.currentPrompt()).toBe("ตา");
  });

  it("finishes after the configured number of attempts", () => {
    const g = make();
    const phases: Phase[] = [];
    for (let i = 0; i < 6; i++) phases.push(say(500, i % 2 ? 60 : 80), quiet(400));
    const { events } = run(g, phases);
    expect(events.filter((e) => e.type === "done")).toHaveLength(1);
    expect(g.state.attempts).toHaveLength(6);
    expect(g.state.stars).toBe(3);
  });

  it("practice time does not advance while data is unusable", () => {
    const g = make();
    run(g, [{ ms: 2000, nasal: 20, speech: true, conn: "disconnected" }]);
    expect(g.state.practiceMs).toBe(0);
  });
});

describe("GateGame (nasal criterion, its own logic)", () => {
  const make = () => new GateGame({ nasalThreshold: 40, openMs: 1500 });

  it("oral-heavy speech does not open the door", () => {
    const g = make();
    run(g, [say(4000, 75)]);
    expect(g.state.progress).toBe(0);
    expect(g.state.open).toBe(false);
  });

  it("silence never moves the door; frozen data stops counting once it is stale (≤ 300 ms)", () => {
    const g = make();
    run(g, [{ ms: 2000, nasal: 60, speech: false }]);
    expect(g.state.inZoneMs).toBe(0);
    run(g, [say(100, 40), { ms: 2000, nasal: 60, speech: true, freeze: true }], 60, 3000);
    const afterFreeze = g.state.inZoneMs;
    expect(afterFreeze).toBeLessThanOrEqual(100 + 300 + 17);
    run(g, [{ ms: 3000, nasal: 60, speech: true, freeze: true }], 60, 6000);
    expect(g.state.inZoneMs).toBe(afterFreeze);
    expect(g.state.open).toBe(false);
  });

  it("opens after enough in-zone speech and counts the utterance that opened it", () => {
    const g = make();
    const { events } = run(g, [say(1800, 45)]);
    expect(g.state.open).toBe(true);
    expect(events.some((e) => e.type === "open")).toBe(true);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.attempts[0].passed).toBe(true);
  });

  it("does not close again when the child drops below the zone", () => {
    const g = make();
    run(g, [say(800, 45)]);
    const p = g.state.progress;
    run(g, [say(800, 80)], 60, 2000);
    expect(g.state.progress).toBeCloseTo(p, 5);
  });
});

describe("BalloonGame (cumulative in-zone time)", () => {
  const make = () => new BalloonGame({ oralThreshold: 70, holdMs: 3000, balloonsPerRound: 3 });

  it("counts time only while speaking, valid and in the zone", () => {
    const g = make();
    run(g, [say(1000, 80), quiet(1000, 95), { ms: 1000, nasal: 20, speech: true, conn: "disconnected" }, say(1000, 60)]);
    expect(g.state.holdMs).toBeGreaterThan(950);
    expect(g.state.holdMs).toBeLessThan(1060);
  });

  it("keeps (does not reset) accumulated time after leaving the zone", () => {
    const g = make();
    run(g, [say(1500, 80), say(1000, 55)]);
    const kept = g.state.holdMs;
    expect(kept).toBeGreaterThan(1400);
    run(g, [say(1600, 80)], 60, 3000);
    expect(g.state.completed).toBe(1);
  });

  it("finishing counts the utterance in progress", () => {
    const g = make();
    run(g, [say(9300, 85)]);
    expect(g.state.done).toBe(true);
    expect(g.state.completed).toBe(3);
    expect(g.state.attempts.length).toBeGreaterThanOrEqual(1);
  });

  it("the balloon rises with oral % and sinks while silent", () => {
    const g = make();
    run(g, [say(600, 90)]);
    const high = g.state.height;
    expect(high).toBeGreaterThan(0.8);
    run(g, [quiet(1500)], 60, 1000);
    expect(g.state.height).toBeLessThan(high - 0.3);
  });
});

describe("Mock source", () => {
  it("speech switch off means speechDetected false whatever the slider says", () => {
    expect(mockSpeechAt({ ...MOCK_DEFAULTS, oralPercent: 100, speechMode: "off" }, 500)).toBe(false);
    expect(mockSpeechAt({ ...MOCK_DEFAULTS, speechMode: "off", holding: true }, 500)).toBe(true);
  });

  it("oscillate pattern stays within ±3 of its centre", () => {
    const p = { ...MOCK_DEFAULTS, pattern: "oscillate" as const, oscillateCenter: 70 };
    for (let t = 0; t < 3000; t += 37) {
      const v = mockOralAt(p, t);
      expect(v).toBeGreaterThanOrEqual(67);
      expect(v).toBeLessThanOrEqual(73);
    }
  });
});

describe("roundStars", () => {
  it("rewards effort with at least one star and never more than three", () => {
    expect(roundStars(0, 0)).toBe(0);
    expect(roundStars(0, 5)).toBe(1);
    expect(roundStars(3, 6)).toBe(2);
    expect(roundStars(6, 6)).toBe(3);
  });
});
