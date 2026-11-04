import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { ConnectionState, DeviceReading } from "../signal/types";
import { BalloonGame, type BalloonConfig, type BalloonEvent } from "./balloon";

interface Phase {
  ms: number;
  speech: boolean;
  /** Oral % the device reports while speaking (default 85 = comfortably inside a 70 % zone). */
  oral?: number;
  level?: VoiceLevel;
  conn?: ConnectionState;
}

/** Drive the balloon game at 60 fps through a script of device phases (levels come from the demo device model). */
function run(game: BalloonGame, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: BalloonEvent[] = [];
  let sample: (DeviceReading & { t: number }) | null = null;
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const conn = p.conn ?? "connected";
      sample = conn === "connected" ? { ...mockReading({ ...MOCK_DEFAULTS, level: p.level ?? "normal" }, p.oral ?? 85, p.speech), t } : null;
      events.push(...game.update(proc.step(sample, conn, t), t, dt));
    }
  }
  return { events, t };
}

const voice = (ms: number, extra: Partial<Phase> = {}): Phase => ({ ms, speech: true, ...extra });
const hush = (ms = 400, extra: Partial<Phase> = {}): Phase => ({ ms, speech: false, ...extra });
/** The trip round as the screen plays it: plan hold 3 s, three balloons, a rest after each one. */
const make = (cfg: Partial<BalloonConfig> = {}) => new BalloonGame({ oralThreshold: 70, holdMs: 3000, balloonsPerRound: 3, restBetween: true, ...cfg });

describe("BalloonGame: rest between balloons", () => {
  it("the plan's hold time delivers one balloon, then the game rests: voice during the rest counts for nothing", () => {
    const g = make();
    const a = run(g, [voice(3200)]);
    expect(a.events.filter((e) => e.type === "balloon-complete")).toHaveLength(1);
    expect(g.state.phase).toBe("rest");
    expect(g.resting).toBe(true);
    expect(g.index).toBe(1);
    const before = { ...g.state };
    run(g, [voice(4000), hush(300), voice(2500, { oral: 95 })], a.t);
    expect(g.state.completed).toBe(1);
    expect(g.state.stars).toBe(1);
    expect(g.state.holdMs).toBe(0);
    expect(g.state.totalInZoneMs).toBe(before.totalInZoneMs);
    expect(g.state.speakingMs).toBe(before.speakingMs);
    expect(g.state.attempts).toHaveLength(before.attempts.length);
    expect(g.state.inZone).toBe(false);
  });

  it("holding on past the plan's time earns nothing more; the utterance that got there is judged once", () => {
    const g = make();
    run(g, [voice(7000)]);
    expect(g.state.completed).toBe(1);
    expect(g.state.totalInZoneMs).toBeLessThanOrEqual(3000 + 17);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.attempts[0].passed).toBe(true);
    expect(g.state.attempts[0].durationMs).toBeLessThan(3100);
  });

  it("the child sets the pace: the next balloon listens only after 'ส่งลูกถัดไป'", () => {
    const g = make();
    const a = run(g, [voice(3100)]);
    const b = run(g, [hush(6000)], a.t);
    expect(g.state.phase).toBe("rest");
    g.nextBalloon();
    expect(g.state.phase).toBe("fly");
    expect(g.resting).toBe(false);
    run(g, [voice(3100)], b.t);
    expect(g.state.completed).toBe(2);
    expect(g.state.results).toEqual(["delivered", "delivered"]);
  });

  it("the last balloon ends the round at once (no rest), with one star per balloon", () => {
    const g = make();
    let t = 0;
    const all: BalloonEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const r = run(g, [hush(200), voice(3100)], t);
      all.push(...r.events);
      t = r.t;
      g.nextBalloon();
    }
    expect(all.at(-1)).toEqual({ type: "done" });
    expect(g.state.done).toBe(true);
    expect(g.state.phase).toBe("done");
    expect(g.state.stars).toBe(3);
    expect(g.state.attempts).toHaveLength(3);
  });

  it("skipping leaves the balloon home without a star or penalty; it is not offered during the rest", () => {
    const g = make();
    const a = run(g, [voice(1200)]);
    const kept = g.state.totalInZoneMs;
    expect(g.skip()).toEqual([{ type: "skip", index: 0 }]);
    expect(g.state.results).toEqual(["skipped"]);
    expect(g.state.holdMs).toBe(0);
    expect(g.state.totalInZoneMs).toBe(kept);
    expect(g.state.stars).toBe(0);
    run(g, [hush(100), voice(3100)], a.t);
    expect(g.resting).toBe(true);
    expect(g.skip()).toEqual([]);
    g.nextBalloon();
    expect(g.skip()).toEqual([{ type: "skip", index: 2 }, { type: "done" }]);
    expect(g.state.done).toBe(true);
    expect(g.state.completed).toBe(1);
  });

  it("finishing during the rest keeps what was delivered", () => {
    const g = make();
    run(g, [voice(3100), hush(500)]);
    g.finish();
    expect(g.state.done).toBe(true);
    expect(g.state.completed).toBe(1);
    expect(g.state.attempts).toHaveLength(1);
  });
});

describe("BalloonGame: the example sound never counts as the child", () => {
  it("no progress while it plays and for the settle window after; a voiced stretch that began during it is not taken", () => {
    const g = make();
    const a = run(g, [hush(200)]);
    g.listenStart();
    const b = run(g, [voice(1500)], a.t); // the speaker leaks into the mics
    expect(g.state.holdMs).toBe(0);
    g.listenEnd(b.t);
    const c = run(g, [voice(420)], b.t); // echo / device latency, still inside the 450 ms window
    expect(g.state.phase).toBe("settle");
    expect(g.state.holdMs).toBe(0);
    const d = run(g, [voice(1000)], c.t); // still the same voiced stretch after the window
    expect(g.state.phase).toBe("fly");
    expect(g.state.holdMs).toBe(0);
    expect(g.state.attempts).toHaveLength(0);
    run(g, [hush(100), voice(1000)], d.t); // silence, then the child's own voice
    expect(g.state.holdMs).toBeGreaterThan(900);
    expect(g.state.listens).toBe(1);
  });

  it("listening during the rest keeps the rest; 'ส่งลูกถัดไป' mid-example still waits out the echo", () => {
    const g = make();
    const a = run(g, [voice(3100)]);
    g.listenStart();
    expect(g.resting).toBe(true);
    expect(g.state.listens).toBe(1); // counted for the balloon now waiting on the pad
    const b = run(g, [voice(300)], a.t);
    g.nextBalloon(); // the screen cut the example off
    expect(g.state.phase).toBe("settle");
    const c = run(g, [voice(400)], b.t);
    expect(g.state.holdMs).toBe(0);
    run(g, [hush(100), voice(1000)], c.t);
    expect(g.state.holdMs).toBeGreaterThan(900);
  });

  it("pausing mid-example returns to the same balloon and listens again only after silence", () => {
    const g = make();
    const a = run(g, [hush(200)]);
    g.listenStart();
    const b = run(g, [voice(300)], a.t);
    g.interrupt();
    expect(g.state.phase).toBe("fly");
    const c = run(g, [voice(600)], b.t);
    expect(g.state.holdMs).toBe(0);
    run(g, [hush(100), voice(600)], c.t);
    expect(g.state.holdMs).toBeGreaterThan(500);
  });
});

describe("BalloonGame: no shouting, no straining, no 'lower nasal is better'", () => {
  it("clipping voice does not lift the balloon: a calm message, nothing judged; normal voice clears it", () => {
    const g = make();
    const a = run(g, [voice(1500, { level: "loud" })]);
    expect(g.state.holdMs).toBe(0);
    expect(g.state.speakingMs).toBe(0);
    expect(g.state.issue).toBe("loud");
    const b = run(g, [hush(500)], a.t);
    expect(g.state.attempts).toHaveLength(0); // a signal problem is never marked as a miss
    expect(g.state.issue).toBe("loud"); // still shown while the child pauses
    run(g, [voice(1500)], b.t);
    expect(g.state.issue).toBeNull();
    expect(g.state.holdMs).toBeGreaterThan(1400);
  });

  it("voice too quiet to measure is not counted either, and nothing is taken away", () => {
    const g = make();
    const a = run(g, [voice(1000)]);
    const kept = g.state.holdMs;
    run(g, [voice(1500, { level: "quiet" }), hush(400)], a.t);
    expect(g.state.issue).toBe("quiet");
    expect(g.state.holdMs).toBe(kept);
  });

  it("every value that meets the expert's criterion rises at the same pace", () => {
    const just = make();
    run(just, [voice(1500, { oral: 72 })]);
    const far = make();
    run(far, [voice(1500, { oral: 99 })]);
    expect(just.state.holdMs).toBeGreaterThan(1400);
    expect(just.state.holdMs).toBe(far.state.holdMs);
  });

  it("silence is never counted as oral, however the device's ratio reads", () => {
    const g = make();
    run(g, [hush(5000, { oral: 100 })]);
    expect(g.state.holdMs).toBe(0);
    expect(g.state.totalInZoneMs).toBe(0);
    expect(g.state.speakingMs).toBe(0);
    expect(g.state.attempts).toHaveLength(0);
  });

  it("time in the zone adds up over several breaths: no need to hold one long breath", () => {
    const g = make();
    run(g, [voice(1100), hush(700), voice(1100), hush(700), voice(1100)]);
    expect(g.state.completed).toBe(1);
    expect(g.state.attempts).toHaveLength(3);
  });
});

describe("BalloonGame: device trouble freezes, never penalises", () => {
  it("a drop mid-utterance keeps the progress and does not judge the cut-off utterance", () => {
    const g = make();
    const a = run(g, [voice(1200)]);
    const kept = g.state.holdMs;
    const b = run(g, [voice(800, { conn: "disconnected" })], a.t);
    expect(g.state.holdMs).toBe(kept);
    expect(g.state.attempts).toHaveLength(0);
    run(g, [hush(200), voice(1200)], b.t);
    expect(g.state.holdMs).toBeGreaterThan(kept + 1100);
  });
});
