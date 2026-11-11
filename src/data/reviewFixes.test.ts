import { afterEach, describe, expect, it } from "vitest";
import { GateGame } from "../logic/gate";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import { bedView, EMPTY_LEDGER, nowMs, sessionAttempts, withPlant } from "./rewards";
import { summarizeGate } from "./rounds";
import type { Child, DemoDB, Session } from "./schema";
import { addSession, clearDemoPlays, getDB, updateRewards } from "./store";

/** Drive the door through the demo device model at a given voice level (normal / quiet / loud = clipped). */
function speakAtDoor(g: GateGame, level: VoiceLevel, nasal: number, ms: number, start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const phases = [
    { ms: 300, speech: false },
    { ms, speech: true },
    { ms: 500, speech: false },
  ];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const r = mockReading({ ...MOCK_DEFAULTS, level }, 100 - nasal, p.speech);
      g.update(proc.step({ ...r, t }, "connected", t), t, dt);
    }
  }
  return t;
}

describe("the door's attempts get the same signal-quality check as the other games", () => {
  it("a clipped or too-quiet attempt is recorded for the adult but is not usable for rewards", () => {
    const loud = new GateGame({ nasalThreshold: 40, openMs: 99999 });
    speakAtDoor(loud, "loud", 50, 700);
    const quiet = new GateGame({ nasalThreshold: 40, openMs: 99999 });
    speakAtDoor(quiet, "quiet", 50, 700);
    const normal = new GateGame({ nasalThreshold: 40, openMs: 99999 });
    speakAtDoor(normal, "normal", 50, 700);
    expect(loud.state.attempts.map((a) => a.usable)).toEqual([false]);
    expect(quiet.state.attempts.map((a) => a.usable)).toEqual([false]);
    expect(normal.state.attempts.map((a) => a.usable)).toEqual([true]);
    const summary = summarizeGate([...loud.state.attempts, ...normal.state.attempts], false, false);
    expect(summary).toMatchObject({ attempts: 2, usable: 1 });
  });

  it("rewards count usable door attempts only (older rounds without the count keep the old rule)", () => {
    const base = { attempts: 0, passed: 0, meanNasal: 50, opened: false, skipped: false };
    const s = (gate: Session["gate"]): Session =>
      ({ id: "x", childId: "C", source: "demo", startedAt: "", durationSec: 0, game: "runner", rounds: 1, words: [], level: 1, oralThreshold: 70, gateThreshold: 40, attempts: 2, passed: 0, meanNasalOral: null, gate, balloon: null, frog: null, stars: 0, endedEarly: false }) as Session;
    expect(sessionAttempts(s({ ...base, attempts: 3, usable: 1 }))).toBe(3);
    expect(sessionAttempts(s({ ...base, attempts: 3 }))).toBe(5);
  });
});

describe("saving and clearing (store)", () => {
  const child = (): Child => getDB().children[0];
  const round = (over: Partial<Session>): Session => ({
    id: "r-1",
    childId: child().id,
    source: "demo",
    startedAt: new Date().toISOString(),
    durationSec: 30,
    game: "kick",
    rounds: 1,
    words: [],
    level: 1,
    oralThreshold: 70,
    gateThreshold: 40,
    attempts: 3,
    passed: 1,
    meanNasalOral: null,
    gate: null,
    balloon: null,
    frog: null,
    stars: 3,
    endedEarly: false,
    usableAttempts: 3,
    ...over,
  });

  it("saving the same round twice keeps one session", () => {
    const before = getDB().sessions.length;
    addSession(round({ id: "dup-1" }));
    addSession(round({ id: "dup-1", stars: 99 }));
    const after = getDB().sessions;
    expect(after.length).toBe(before + 1);
    expect(after.find((s) => s.id === "dup-1")?.stars).toBe(3);
  });

  it("clearing demo rounds keeps sample history, device rounds and the device rewards", () => {
    addSession(round({ id: "demo-1", source: "demo" }));
    addSession(round({ id: "dev-1", source: "device" }));
    updateRewards(child().id, () => ({
      species: "dino",
      wear: ["jersey"],
      ledgers: { demo: { ...EMPTY_LEDGER, pets: ["puppy"] }, device: { ...EMPTY_LEDGER, pets: ["kitten"] } },
    }));
    clearDemoPlays();
    const d: DemoDB = getDB();
    expect(d.sessions.some((s) => s.id === "demo-1")).toBe(false);
    expect(d.sessions.some((s) => s.id === "dev-1")).toBe(true);
    expect(d.sessions.some((s) => s.source === "sample")).toBe(true);
    const r = d.rewards?.[child().id];
    expect(r?.ledgers.demo).toBeUndefined();
    expect(r?.ledgers.device?.pets).toEqual(["kitten"]);
    expect(r?.species).toBe("dino");
  });
});

describe("the demo-only 'next day' tool never moves the device clock", () => {
  const original = (globalThis as { localStorage?: Storage }).localStorage;
  afterEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = original;
  });

  it("with a +1 day demo offset, a device plant planted today is still not ready", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (k === "nasal-trainer-demo:day-offset" ? "1" : null),
      setItem: () => {},
      removeItem: () => {},
    };
    expect(nowMs("demo") - nowMs("device")).toBeGreaterThan(23 * 3600 * 1000);
    const since = new Date().toISOString();
    const db: DemoDB = {
      ...getDB(),
      sessions: [
        { ...getDB().sessions[0], id: "g1", source: "device", childId: "C-G", startedAt: new Date(Date.now() + 1000).toISOString(), usableAttempts: 20, call: null, gate: null },
      ],
    };
    const l = withPlant(EMPTY_LEDGER, 0, "carrot", since);
    expect(bedView(db, "C-G", "device", l, 0, nowMs("device"))).toMatchObject({ stage: 2, ready: false, waitTomorrow: true });
  });
});
