import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { MAX_FRAME_DT_MS } from "./common";
import { CHEER_MS, FLIGHT_MS, KICK_SHOTS, KickMatch, RUNUP_MAX, SHOT_STYLES, type KickEvent } from "./kick";

const words = ["ปา", "ตา", "กา"];
const items = (n: number): CallItem[] => Array.from({ length: n }, (_, k) => ({ id: String(k), word: words[k % words.length], resonance: "oral" }));

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
  /** demo voice level (loud = clipped signal) */
  level?: VoiceLevel;
}

/** Drive the match at 60 fps through device phases (same demo device model as the route and call tests). */
function run(game: KickMatch, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: KickEvent[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const r = mockReading({ ...MOCK_DEFAULTS, ...(p.level ? { level: p.level } : {}) }, 100 - (p.nasal ?? 25), p.speech);
      const sample: DeviceReading & { t: number } = { ...r, t };
      events.push(...game.update(proc.step(sample, "connected", t), t, dt));
    }
  }
  return { events, t };
}

const say = (ms = 500, nasal?: number): Phase => ({ ms, speech: true, nasal });
const hush = (ms = 400): Phase => ({ ms, speech: false });
const ballRest = (): Phase => hush(FLIGHT_MS + CHEER_MS + 150);

describe("Penalty kicks (ยิงจุดโทษ): one usable word = one kick = one goal", () => {
  it("pause mid-flight or mid-celebration for 10 s: the ball and the cheer wait where they were (no warp on resume)", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("flight");
    const k0 = g.flightK;
    expect(k0).toBeLessThan(0.5);
    g.interrupt();
    const idle = new SignalProcessor().step(null, "connected", a.t + 10_000);
    g.update(idle, a.t + 10_000, 0);
    expect(g.flightK).toBeCloseTo(k0, 6);
    expect(g.phase).toBe("flight");
    expect(g.goals).toBe(0);
    g.update(idle, a.t + 10_016, 10_000);
    expect(g.flightK).toBeLessThanOrEqual(k0 + MAX_FRAME_DT_MS / FLIGHT_MS + 1e-9);
    expect(g.phase).toBe("flight");
    const b = run(g, [hush(FLIGHT_MS)], a.t + 10_016);
    expect(b.events).toContainEqual({ type: "goal", shot: 0 });
    expect(g.phase).toBe("cheer");
    const c0 = g.cheerK;
    g.interrupt();
    g.update(idle, b.t + 20_000, 0);
    expect(g.cheerK).toBeCloseTo(c0, 6);
    expect(g.phase).toBe("cheer");
    expect(g.shot).toBe(0);
  });

  it("a usable word kicks, the ball goes in, and after the celebration the next ball is ready", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), say(), hush(200)]);
    expect(a.events).toContainEqual({ type: "kick", shot: 0 });
    expect(g.phase).toBe("flight");
    const b = run(g, [ballRest()], a.t);
    expect(b.events).toContainEqual({ type: "goal", shot: 0 });
    expect(b.events).toContainEqual({ type: "ready", shot: 1 });
    expect(g.goals).toBe(1);
    expect(g.stars).toBe(1);
    expect(g.shot).toBe(1);
    expect(g.phase).toBe("aim");
    expect(g.call.current?.word).toBe("ตา");
    expect(g.results.slice(0, 2)).toEqual(["goal", null]);
  });

  it("the game does not listen while the ball flies or the team celebrates", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.busy).toBe(true);
    run(g, [say(700), hush(FLIGHT_MS + CHEER_MS)], a.t); // talking over the flight, then the next ball comes
    expect(g.call.state.words[1].attempts).toBe(0);
    expect(g.goals).toBe(1);
    expect(g.attempts).toHaveLength(1);
  });

  it("the example word never kicks", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    g.call.listenStart("model");
    const a = run(g, [say(900)]); // the speaker plays the word into the mics
    g.call.listenEnd(a.t);
    run(g, [hush(800)], a.t);
    expect(g.phase).toBe("aim");
    expect(g.kickSeq).toBe(0);
    expect(g.runup).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });

  it("starts the run-up while the child speaks, but only a finished word kicks", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    run(g, [hush(), say(1200)]);
    expect(g.charging).toBe(true);
    expect(g.runup).toBeGreaterThan(0.5);
    expect(g.runup).toBeLessThan(RUNUP_MAX);
    expect(g.kickSeq).toBe(0);
  });

  it("a blip too short to be an attempt keeps the run-up and does not kick", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    run(g, [hush(), say(90), hush(600)]);
    expect(g.kickSeq).toBe(0);
    expect(g.phase).toBe("aim");
    expect(g.runup).toBeGreaterThanOrEqual(0);
  });

  it("every ball has its own shot style, in a fixed order (no chance)", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const seen: string[] = [];
    let t = 0;
    for (let k = 0; k < KICK_SHOTS; k++) {
      seen.push(g.style);
      t = run(g, [hush(), say(), hush(100), ballRest()], t).t;
    }
    expect(seen).toEqual(SHOT_STYLES.slice(0, KICK_SHOTS));
    expect(g.done).toBe(true);
    expect(g.goals).toBe(KICK_SHOTS);
  });

  it("skip sets up the next ball without a goal; the round ends after the last ball", () => {
    const g = new KickMatch(items(3), 70);
    let t = run(g, [hush(), say(), hush(100), ballRest()]).t;
    expect(g.skip()).toContainEqual({ type: "ready", shot: 2 });
    const end = g.skip();
    expect(end).toContainEqual({ type: "finish" });
    t = run(g, [hush()], t).t;
    expect(g.done).toBe(true);
    expect(g.goals).toBe(1);
    expect(g.results).toEqual(["goal", "skip", "skip"]);
    expect(g.call.state.words.map((w) => w.skipped)).toEqual([false, true, true]);
  });

  it("goals do not depend on the nasal value; the oral criterion is only recorded", () => {
    const low = new KickMatch(items(KICK_SHOTS), 70);
    const high = new KickMatch(items(KICK_SHOTS), 70);
    run(low, [hush(), say(500, 15), hush(100), ballRest()]);
    run(high, [hush(), say(500, 80), hush(100), ballRest()]);
    expect(low.goals).toBe(1);
    expect(high.goals).toBe(1);
    expect(low.attempts[0].passed).toBe(true);
    expect(high.attempts[0].passed).toBe(false);
  });

  it("ending early while the ball flies keeps that goal", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("flight");
    g.finish();
    expect(g.done).toBe(true);
    expect(g.goals).toBe(1);
    expect(g.results[0]).toBe("goal");
  });

  it("the celebration can be skipped (the goal stays) but not the ball's flight; a shorter celebration ends sooner", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("flight");
    expect(g.skipCheer()).toEqual([]);
    const b = run(g, [hush(FLIGHT_MS)], a.t);
    expect(g.phase).toBe("cheer");
    expect(g.skipCheer()).toContainEqual({ type: "ready", shot: 1 });
    expect(g.goals).toBe(1);
    expect(g.phase).toBe("aim");
    const quick = new KickMatch(items(KICK_SHOTS), 70, { cheerMs: 500 });
    const c = run(quick, [hush(), say(), hush(300), hush(FLIGHT_MS)]);
    run(quick, [hush(600)], c.t);
    expect(quick.shot).toBe(1);
    void b;
  });

  it("the next-ball button (ลูกต่อไป) after the last goal ends the round (finish), so the done screen can show", () => {
    const g = new KickMatch(items(1), 70);
    const a = run(g, [hush(), say(), hush(300), hush(FLIGHT_MS)]);
    expect(g.phase).toBe("cheer");
    expect(g.skipCheer()).toContainEqual({ type: "finish" });
    expect(g.done).toBe(true);
    expect(g.goals).toBe(1);
    void a;
  });

  it("a clipped (too loud) or too quiet word does not kick; the next usable word does", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), { ms: 500, speech: true, level: "loud" }, hush(300)]);
    expect(a.events.some((e) => e.type === "kick")).toBe(false);
    expect(g.phase).toBe("aim");
    expect(g.attempts).toHaveLength(0);
    const b = run(g, [{ ms: 500, speech: true, level: "quiet" }, hush(300)], a.t);
    expect(b.events.some((e) => e.type === "kick")).toBe(false);
    expect(g.shot).toBe(0);
    const c = run(g, [say(), hush(300)], b.t);
    expect(c.events.filter((e) => e.type === "kick")).toHaveLength(1);
    expect(g.attempts).toHaveLength(1);
  });

  it("a clipped (too loud) or too quiet voice never runs the kicker up (no ground gained on a voice the game cannot use)", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), { ms: 900, speech: true, level: "loud" }]);
    expect(g.charging).toBe(false);
    expect(g.runup).toBe(0);
    run(g, [hush(), { ms: 900, speech: true, level: "quiet" }, hush(600)], a.t);
    expect(g.charging).toBe(false);
    expect(g.runup).toBe(0);
    expect(g.kickSeq).toBe(0);
  });

  it("pausing drops an open attempt but keeps the run-up", () => {
    const g = new KickMatch(items(KICK_SHOTS), 70);
    const a = run(g, [hush(), say(900)]);
    const before = g.runup;
    g.interrupt();
    expect(g.charging).toBe(false);
    run(g, [hush(600)], a.t);
    expect(g.kickSeq).toBe(0);
    expect(g.runup).toBeCloseTo(before, 5);
  });
});
