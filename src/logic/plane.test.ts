import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { CHARGE_MAX, CHEER_MS, MAX_TRIES, NEAR_MS, PlaneFlight, SHOT_MS, type PlaneEvent } from "./plane";

const oral = (n: number): CallItem[] => Array.from({ length: n }, (_, k) => ({ id: String(k), word: ["ปา", "ตา", "กา"][k % 3], resonance: "oral" }));
const targets = { oralThreshold: 70, nasalThreshold: 40 };

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
  level?: VoiceLevel;
}

/** Drive the flight at 60 fps through demo-device phases (same device model as the kick and call tests). */
function run(game: PlaneFlight, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: PlaneEvent[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const r = mockReading({ ...MOCK_DEFAULTS, ...(p.level ? { level: p.level } : {}) }, 100 - (p.nasal ?? 20), p.speech);
      const sample: DeviceReading & { t: number } = { ...r, t };
      events.push(...game.update(proc.step(sample, "connected", t), t, dt));
    }
  }
  return { events, t };
}

const say = (nasal?: number, ms = 500): Phase => ({ ms, speech: true, nasal });
const hush = (ms = 400): Phase => ({ ms, speech: false });
const settle = (): Phase => hush(SHOT_MS + CHEER_MS + 200);
const nearRest = (): Phase => hush(SHOT_MS + NEAR_MS + 200);

describe("Bubble pilot (นักบินฟองสบู่): one usable word = one bubble or one roll", () => {
  it("easy flight: any usable word fires, the bubble pops the cloud, then the next cloud comes", () => {
    const g = new PlaneFlight(oral(5), "easy", targets);
    expect(g.kind).toBe("cloud");
    const a = run(g, [hush(), say(65), hush(200)]);
    expect(a.events).toContainEqual({ type: "fire", encounter: 0, kind: "cloud" });
    expect(g.phase).toBe("shot");
    const b = run(g, [settle()], a.t);
    expect(b.events).toContainEqual({ type: "hit", encounter: 0 });
    expect(b.events).toContainEqual({ type: "ready", encounter: 1 });
    expect(g.results[0]).toBe("hit");
    expect(g.stars).toBe(1);
    // easy flight never judges the voice: even a nasal-sounding word pops the cloud; the criterion is kept for the adult
    expect(g.oralAttempts).toHaveLength(1);
    expect(g.oralAttempts[0].passed).toBe(false);
  });

  it("adventure, oral word at the plan's target: a hit", () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    const a = run(g, [hush(), say(20), hush(200), settle()]);
    expect(a.events).toContainEqual({ type: "hit", encounter: 0 });
    expect(g.stars).toBe(1);
    expect(g.oralAttempts[0].passed).toBe(true);
  });

  it("adventure, below the target: the bubble floats past (no star, nothing taken), then the same cloud waits for another try", () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    const a = run(g, [hush(), say(45), hush(200), nearRest()]);
    expect(a.events).toContainEqual({ type: "near", encounter: 0, tries: 1 });
    expect(g.phase).toBe("approach");
    expect(g.encounter).toBe(0);
    expect(g.tries).toBe(1);
    expect(g.stars).toBe(0);
    const b = run(g, [hush(), say(20), hush(200), settle()], a.t);
    expect(b.events).toContainEqual({ type: "hit", encounter: 0 });
    expect(g.results[0]).toBe("hit");
    expect(g.stars).toBe(1);
    expect(g.oralAttempts.map((x) => x.passed)).toEqual([false, true]);
  });

  it("after a near miss it is the child's turn again: a clipped try asks for another one (never shown as heard)", () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    const a = run(g, [hush(), say(45), hush(200), nearRest()]);
    expect(g.phase).toBe("approach");
    expect(g.call.state.phase).toBe("turn");
    expect(g.call.state.issue).toBeNull();
    const b = run(g, [hush(), { ms: 500, speech: true, nasal: 20, level: "loud" }, hush(300)], a.t);
    expect(b.events).toContainEqual({ type: "retry", index: 0, issue: "loud" });
    expect(b.events.some((e) => e.type === "fire")).toBe(false);
    expect(g.call.state.phase).toBe("turn");
    expect(g.call.state.issue).toBe("loud");
    expect(g.tries).toBe(1);
  });

  it("a cloud that drifts after near misses keeps its word as tried, not skipped", () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    let t = 0;
    for (let i = 0; i < MAX_TRIES; i++) t = run(g, [hush(), say(45), hush(200), nearRest()], t).t;
    expect(g.call.state.words[0].heard).toBe(true);
    expect(g.call.state.words[0].skipped).toBe(false);
    expect(g.call.state.index).toBe(1);
  });

  it(`adventure: after ${MAX_TRIES} tries below the target the cloud smiles and drifts away — no loss, the next cloud comes`, () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    let t = 0;
    for (let i = 0; i < MAX_TRIES; i++) t = run(g, [hush(), say(45), hush(200), nearRest()], t).t;
    expect(g.results[0]).toBe("drift");
    expect(g.encounter).toBe(1);
    expect(g.phase).toBe("approach");
    expect(g.tries).toBe(0);
    expect(g.stars).toBe(0);
    expect(g.oralAttempts).toHaveLength(MAX_TRIES);
  });

  it("adventure hail (a nasal word): enough voice through the nose rolls the plane past it; too little floats near", () => {
    const items: CallItem[] = [
      { id: "0", word: "มา", resonance: "nasal" },
      { id: "1", word: "มา", resonance: "nasal" },
    ];
    const g = new PlaneFlight(items, "adventure", targets);
    expect(g.kind).toBe("hail");
    const a = run(g, [hush(), say(55), hush(200), settle()]);
    expect(a.events).toContainEqual({ type: "fire", encounter: 0, kind: "hail" });
    expect(a.events).toContainEqual({ type: "dodge", encounter: 0 });
    expect(g.results[0]).toBe("dodge");
    expect(g.stars).toBe(1);
    expect(g.nasalAttempts[0].passed).toBe(true);
    expect(g.oralAttempts).toHaveLength(0);
    const b = run(g, [hush(), say(15), hush(200), nearRest()], a.t);
    expect(b.events).toContainEqual({ type: "near", encounter: 1, tries: 1 });
    expect(g.nasalAttempts[1].passed).toBe(false);
  });

  it("a signal the game cannot use asks for another try: nothing fires, nothing is counted", () => {
    const g = new PlaneFlight(oral(5), "adventure", targets);
    const a = run(g, [hush(), { ms: 500, speech: true, level: "loud" }, hush(300)]);
    expect(a.events.some((e) => e.type === "retry")).toBe(true);
    expect(a.events.some((e) => e.type === "fire")).toBe(false);
    expect(g.phase).toBe("approach");
    expect(g.tries).toBe(0);
    expect(g.oralAttempts).toHaveLength(0);
  });

  it("the plane charges while the child speaks (never past CHARGE_MAX before the word ends) and fires at the end", () => {
    const g = new PlaneFlight(oral(5), "easy", targets);
    run(g, [hush(), say(20, 300)]);
    expect(g.charging).toBe(true);
    expect(g.charge).toBeGreaterThan(0.1);
    expect(g.charge).toBeLessThanOrEqual(CHARGE_MAX);
    const b = run(g, [hush(200)], 700);
    expect(b.events.some((e) => e.type === "fire")).toBe(true);
    expect(g.charge).toBe(1);
  });

  it("the game does not listen while the bubble flies or the cloud pops", () => {
    const g = new PlaneFlight(oral(5), "easy", targets);
    const a = run(g, [hush(), say(), hush(250)]);
    const b = run(g, [say(20, SHOT_MS + 300)], a.t);
    expect(b.events.filter((e) => e.type === "fire")).toHaveLength(0);
    expect(g.oralAttempts).toHaveLength(1);
  });

  it("skip: the cloud floats by without a word (no star), skipping the last one ends the flight", () => {
    const g = new PlaneFlight(oral(2), "easy", targets);
    expect(g.skip()).toContainEqual({ type: "ready", encounter: 1 });
    expect(g.results[0]).toBe("skip");
    expect(g.skip()).toContainEqual({ type: "finish" });
    expect(g.done).toBe(true);
    expect(g.stars).toBe(0);
  });

  it("ending during a hit shot keeps that hit (its word was usable and on target)", () => {
    const g = new PlaneFlight(oral(5), "easy", targets);
    run(g, [hush(), say(), hush(250)]);
    expect(g.phase).toBe("shot");
    g.finish();
    expect(g.done).toBe(true);
    expect(g.stars).toBe(1);
    expect(g.results[0]).toBe("hit");
  });
});
