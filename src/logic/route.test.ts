import { describe, expect, it } from "vitest";
import { ROUTES, routePoints } from "../data/routes";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { MAX_FRAME_DT_MS } from "./common";
import { DASH_MAX, GAP_MIN, GAP_START, LEG_MS, RouteRun, type RouteEvent } from "./route";

const words = ["ปา", "ตา", "กา"];
const items = (n: number): CallItem[] => Array.from({ length: n }, (_, k) => ({ id: String(k), word: words[k % words.length], resonance: "oral" }));

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
  /** demo voice level (loud = clipped signal, quiet = too quiet to use) */
  level?: VoiceLevel;
}

/** Drive the route at 60 fps through device phases (same demo device model as the call-a-friend tests). */
function run(game: RouteRun, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: RouteEvent[] = [];
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
const legRest = (): Phase => hush(LEG_MS + 100);

describe("Route run (เลือกทางวิ่ง): one usable word = one leg", () => {
  it("pause mid-run for 10 s: the bunny waits where it was and arrives only with active frames (no warp)", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.running).toBe(true);
    const before = g.pos;
    const t0 = g.leg?.elapsed ?? NaN;
    expect(before).toBeLessThan(1);
    g.interrupt(); // pause: the loop stops calling update()
    const idle = new SignalProcessor().step(null, "connected", a.t + 10_000);
    g.update(idle, a.t + 10_000, 0); // first frame after resuming: dt = 0
    expect(g.pos).toBeCloseTo(before, 6);
    expect(g.leg?.elapsed).toBeCloseTo(t0, 6);
    expect(g.running).toBe(true);
    g.update(idle, a.t + 10_016, 10_000); // even a stale frame reporting the whole pause counts one frame cap at most
    expect(g.running).toBe(true);
    expect((g.leg?.elapsed ?? Infinity) - t0).toBeLessThanOrEqual(MAX_FRAME_DT_MS + 1e-9);
    const b = run(g, [hush(LEG_MS)], a.t + 10_016);
    expect(b.events).toContainEqual({ type: "arrive", at: 1 });
  });

  it("pause during a skipped leg's run for 10 s: the bunny waits where it was and arrives only with active frames", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush()]);
    g.skip();
    const b = run(g, [hush(300)], a.t);
    expect(g.running).toBe(true);
    const p0 = g.pos;
    const e0 = g.leg?.elapsed ?? NaN;
    g.interrupt();
    const idle = new SignalProcessor().step(null, "connected", b.t + 10_000);
    g.update(idle, b.t + 10_000, 0);
    expect(g.pos).toBeCloseTo(p0, 6);
    g.update(idle, b.t + 10_016, 10_000);
    expect(g.running).toBe(true);
    expect((g.leg?.elapsed ?? Infinity) - e0).toBeLessThanOrEqual(MAX_FRAME_DT_MS + 1e-9);
    const c = run(g, [hush(LEG_MS)], b.t + 10_016);
    expect(c.events).toContainEqual({ type: "arrive", at: 1 });
    expect(g.stars).toBe(0);
  });

  it("a usable attempt sends the bunny to the next stop, then the next word is up", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(), hush()]);
    expect(a.events).toContainEqual({ type: "leave", to: 1 });
    expect(g.running).toBe(true);
    const b = run(g, [legRest()], a.t);
    expect(b.events).toContainEqual({ type: "arrive", at: 1 });
    expect(g.reached).toBe(1);
    expect(g.call.current?.word).toBe("ตา");
    expect(g.stars).toBe(1);
  });

  it("the game does not listen while the bunny runs", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(), hush()]);
    expect(g.running).toBe(true);
    run(g, [say(600), hush(LEG_MS)], a.t); // talking during the run, then arriving
    expect(g.call.state.words[1].attempts).toBe(0);
    expect(g.reached).toBe(1);
  });

  it("the example word never moves the bunny", () => {
    const g = new RouteRun(items(3), 70);
    g.call.listenStart("model");
    const a = run(g, [say(900)]); // the speaker plays the word into the mics
    g.call.listenEnd(a.t);
    run(g, [hush(800)], a.t);
    expect(g.reached).toBe(0);
    expect(g.running).toBe(false);
    expect(g.attempts).toHaveLength(0);
  });

  it("skip runs on without penalty; the round ends at the destination after every leg", () => {
    const g = new RouteRun(items(3), 70);
    let t = run(g, [hush(), say(), hush(), legRest()]).t;
    g.skip();
    t = run(g, [legRest()], t).t;
    g.skip();
    const end = run(g, [legRest()], t);
    expect(end.events).toContainEqual({ type: "finish" });
    expect(g.done).toBe(true);
    expect(g.reached).toBe(3);
    expect(g.stars).toBe(1);
    expect(g.call.state.words.map((w) => w.skipped)).toEqual([false, true, true]);
  });

  it("pausing mid-run keeps the run; after the pause the bunny arrives at the same stop", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(), hush()]);
    expect(g.running).toBe(true);
    g.interrupt(); // pause button / tab hidden
    const b = run(g, [hush(LEG_MS + 200)], a.t + 5_000);
    expect(b.events).toContainEqual({ type: "arrive", at: 1 });
    expect(g.reached).toBe(1);
    expect(g.call.current?.word).toBe("ตา");
  });

  it("records attempts on the expert's oral criterion for the caregiver only", () => {
    const g = new RouteRun(items(2), 70);
    const a = run(g, [hush(), say(500, 20), hush(), legRest()]);
    run(g, [hush(), say(500, 45), hush(), legRest()], a.t);
    expect(g.attempts.map((x) => x.passed)).toEqual([true, false]);
    // both words moved the bunny: the scene never treats the criterion as a fail
    expect(g.reached).toBe(2);
  });
});

describe("Route run: the bunny runs on the child's voice, the cloud friend chases (never catches)", () => {
  it("starts running as soon as the child speaks, before the word is over, and the word finishes the leg", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(300)]); // still speaking
    expect(g.dashing).toBe(true);
    expect(g.running).toBe(false); // still listening: the finishing run has not started
    expect(g.pos).toBeGreaterThan(0.05);
    expect(g.pos).toBeLessThanOrEqual(DASH_MAX);
    expect(g.reached).toBe(0);
    const b = run(g, [hush(), legRest()], a.t);
    expect(b.events).toContainEqual({ type: "arrive", at: 1 });
    expect(g.reached).toBe(1);
    expect(g.dash).toBe(0);
    expect(g.dashing).toBe(false);
  });

  it("the voice alone never reaches the next stop: a long word keeps the bunny going, slower, short of the flag", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(2000)]);
    const at2s = g.pos;
    run(g, [say(2000)], a.t);
    expect(g.pos).toBeGreaterThan(at2s); // still moving while the voice goes on
    expect(g.pos).toBeLessThan(DASH_MAX);
    expect(g.pos).toBeGreaterThan(0.6);
    expect(g.reached).toBe(0);
  });

  it("an attempt that is too short does not count, and the bunny keeps the ground it ran (nothing taken away)", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush(), say(90), hush(600)]);
    expect(g.reached).toBe(0);
    expect(g.running).toBe(false);
    const kept = g.pos;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(DASH_MAX);
    run(g, [hush(2000)], a.t);
    expect(g.pos).toBe(kept);
  });

  it("the cloud creeps closer while the child is quiet, stops at a distance, and falls back when the bunny runs", () => {
    const g = new RouteRun(items(3), 70);
    expect(g.gap).toBe(GAP_START);
    const a = run(g, [hush(3000)]);
    expect(g.gap).toBeLessThan(GAP_START);
    const b = run(g, [hush(20_000)], a.t);
    expect(g.gap).toBe(GAP_MIN); // never closer than this, and nothing happens there
    expect(g.reached).toBe(0);
    expect(g.call.state.phase).toBe("turn");
    run(g, [say(500), hush(), legRest()], b.t);
    expect(g.gap).toBeGreaterThan(GAP_MIN + 0.4);
  });

  it("a clipped (too loud) or too quiet voice never moves the bunny or sends the cloud back; the next usable word runs the leg", () => {
    const g = new RouteRun(items(3), 70);
    const a = run(g, [hush()]);
    const gap0 = g.gap;
    const b = run(g, [{ ms: 900, speech: true, level: "loud" }], a.t);
    expect(g.dashing).toBe(false);
    expect(g.pos).toBe(0);
    expect(g.gap).toBeLessThanOrEqual(gap0); // shouting never chases the cloud away
    const c = run(g, [hush(), { ms: 900, speech: true, level: "quiet" }, hush(600)], b.t);
    expect(g.pos).toBe(0);
    expect(g.reached).toBe(0);
    expect(g.attempts).toHaveLength(0);
    const d = run(g, [say(), hush(), legRest()], c.t);
    expect(d.events).toContainEqual({ type: "arrive", at: 1 });
    expect(g.stars).toBe(1);
  });

  it("the example word moves neither the bunny nor the cloud", () => {
    const g = new RouteRun(items(3), 70);
    g.call.listenStart("model");
    run(g, [say(900)]);
    expect(g.pos).toBe(0);
    expect(g.dashing).toBe(false);
    expect(g.gap).toBe(GAP_START);
  });

  it("speed never depends on the nasal value: the same speech runs the same distance", () => {
    const low = new RouteRun(items(3), 70);
    const high = new RouteRun(items(3), 70);
    run(low, [hush(), say(400, 10)]);
    run(high, [hush(), say(400, 60)]);
    expect(high.pos).toBeCloseTo(low.pos, 6);
  });
});

describe("Routes on the map", () => {
  it("every route has enough stops for a round and ends at its destination", () => {
    for (const r of ROUTES) {
      const pts = routePoints(r, 6);
      expect(pts).toHaveLength(6);
      expect(pts.at(-1)).toBe(r.destination);
    }
  });
});
