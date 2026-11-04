import { describe, expect, it } from "vitest";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { ConnectionState } from "../signal/types";
import { GATE_SETTLE_MS, GateGame, type GateEvent } from "./gate";

interface Phase {
  ms: number;
  /** Nasal % the device reports. */
  nasal: number;
  speech: boolean;
  conn?: ConnectionState;
}

/** Drive the gate at 60 fps through a script of device phases. */
function run(game: GateGame, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  let last: { nasalPercent: number; speechDetected: boolean; t: number } | null = null;
  const events: GateEvent[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const conn = p.conn ?? "connected";
      last = conn === "connected" ? { nasalPercent: p.nasal, speechDetected: p.speech, t } : null;
      events.push(...game.update(proc.step(last, conn, t), t, dt));
    }
  }
  return { events, t };
}

/** "มา" said with a nasal value at or above the plan's 40% target. */
const say = (ms: number, nasal = 60): Phase => ({ ms, nasal, speech: true });
const hush = (ms = 400): Phase => ({ ms, nasal: 60, speech: false });
const make = () => new GateGame({ nasalThreshold: 40, openMs: 1500 });

describe("GateGame: the example word never counts as the child", () => {
  it("speech picked up while the example plays, and its echo, is ignored; listening restarts after silence", () => {
    const g = make();
    const a = run(g, [hush(200)]);
    g.listenStart();
    expect(g.state.phase).toBe("playing");
    const b = run(g, [say(900)], a.t); // the speaker leaks into the mics
    g.listenEnd(b.t);
    const c = run(g, [say(GATE_SETTLE_MS - 50)], b.t); // echo inside the settle window
    const d = run(g, [say(600)], c.t); // still voiced after the window: not the child's turn yet
    expect(g.state).toMatchObject({ inZoneMs: 0, progress: 0, attempts: [], listens: 1, armed: false });
    run(g, [hush(300), say(600), hush()], d.t);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.inZoneMs).toBeGreaterThan(500);
    expect(g.state.inZoneMs).toBeLessThan(700);
  });

  it("a long, clearly nasal example never opens the door and adds no attempt or practice time", () => {
    const g = make();
    g.listenStart();
    const { events } = run(g, [say(4000, 80)]);
    expect(events).toEqual([]);
    expect(g.state).toMatchObject({ open: false, progress: 0, attempts: [], practiceMs: 0 });
  });

  it("an adult modelling the word is ignored until they say it is the child's turn", () => {
    const g = make();
    g.listenStart(); // no voice on this device: the adult says the word
    const a = run(g, [say(800), hush(3000), say(700)]);
    expect(g.state.phase).toBe("playing");
    expect(g.state.inZoneMs).toBe(0);
    g.listenEnd(a.t); // "ผู้ใหญ่พูดแล้ว ถึงตาหนู"
    run(g, [hush(600), say(700), hush()], a.t);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.attempts[0].passed).toBe(true);
  });

  it("playing the example again after the door opened changes nothing", () => {
    const g = make();
    run(g, [say(1800)]);
    expect(g.state.open).toBe(true);
    g.listenStart();
    expect(g.state).toMatchObject({ phase: "listen", listens: 0, open: true });
  });
});

describe("GateGame: trying again, pausing and device trouble cost nothing", () => {
  it("retry drops the utterance in progress (not counted) and keeps the progress", () => {
    const g = make();
    const a = run(g, [say(800)]);
    const kept = g.state.progress;
    expect(kept).toBeGreaterThan(0.4);
    g.retry();
    const b = run(g, [say(400), hush(300)], a.t); // the rest of the dropped utterance
    expect(g.state.attempts).toHaveLength(0);
    expect(g.state.progress).toBeCloseTo(kept, 5);
    run(g, [say(400), hush()], b.t);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.progress).toBeGreaterThan(kept);
  });

  it("pausing mid-utterance drops it; listening resumes after silence", () => {
    const g = make();
    const a = run(g, [hush(), say(500)]);
    g.interrupt();
    run(g, [say(300), hush(600)], a.t);
    expect(g.state.attempts).toHaveLength(0);
    expect(g.state.inZoneMs).toBeGreaterThan(450);
    expect(g.state.inZoneMs).toBeLessThan(550);
  });

  it("a device drop freezes the door and drops the utterance; after reconnecting it counts from silence", () => {
    const g = make();
    const a = run(g, [hush(), say(400), { ms: 600, nasal: 60, speech: true, conn: "disconnected" }]);
    const frozen = g.state.inZoneMs;
    expect(g.state.attempts).toHaveLength(0);
    const b = run(g, [say(500)], a.t); // reconnected while the child is still talking: not counted
    expect(g.state.inZoneMs).toBe(frozen);
    run(g, [hush(300), say(500), hush()], b.t);
    expect(g.state.attempts).toHaveLength(1);
    expect(g.state.inZoneMs).toBeGreaterThan(frozen + 450);
  });
});

describe("GateGame: the target is reaching the expert's threshold", () => {
  it("a strongly nasal 'มา' opens the door like any value at or above the threshold (no 'lower is better' rule)", () => {
    const g = make();
    const { events } = run(g, [say(1800, 85)]);
    expect(events.some((e) => e.type === "open")).toBe(true);
    expect(g.state.attempts[0].passed).toBe(true);
  });
});
