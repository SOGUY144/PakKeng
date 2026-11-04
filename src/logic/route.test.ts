import { describe, expect, it } from "vitest";
import { ROUTES, routePoints } from "../data/routes";
import { MOCK_DEFAULTS, mockReading } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { LEG_MS, RouteRun, type RouteEvent } from "./route";

const words = ["ปา", "ตา", "กา"];
const items = (n: number): CallItem[] => Array.from({ length: n }, (_, k) => ({ id: String(k), word: words[k % words.length], resonance: "oral" }));

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
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
      const r = mockReading({ ...MOCK_DEFAULTS }, 100 - (p.nasal ?? 25), p.speech);
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
    g.skip(t);
    t = run(g, [legRest()], t).t;
    g.skip(t);
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

describe("Routes on the map", () => {
  it("every route has enough stops for a round and ends at its destination", () => {
    for (const r of ROUTES) {
      const pts = routePoints(r, 6);
      expect(pts).toHaveLength(6);
      expect(pts.at(-1)).toBe(r.destination);
    }
  });
});
