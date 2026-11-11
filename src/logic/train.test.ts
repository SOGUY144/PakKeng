import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type MicChannels, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor, type SignalFrame } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { MAX_FRAME_DT_MS } from "./common";
import { ARRIVE_MS, COAST_MS, RIDE_MS, TRAIN_LEGS, TrainTrip, trainView, type TrainEvent } from "./train";

const words = ["ปา", "ตา", "กา"];
const items = (n: number): CallItem[] => Array.from({ length: n }, (_, k) => ({ id: String(k), word: words[k % words.length], resonance: "oral" }));

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
  /** demo voice level (loud = clipped signal, quiet = too quiet to use) */
  level?: VoiceLevel;
  /** the device link is down for this phase (frames go stale) */
  down?: boolean;
  channels?: MicChannels;
}

const FRAME = 1000 / 60;
/** A frame with no reading (the game ignores the signal while riding, pulling in or coasting anyway). */
const idle = (t: number): SignalFrame => new SignalProcessor().step(null, "connected", t);

/** Drive the trip at 60 fps through device phases (same demo device model as the kick and call tests). */
function run(game: TrainTrip, phases: Phase[], start = 0, proc = new SignalProcessor(), tweak?: (f: SignalFrame) => SignalFrame) {
  let t = start;
  const events: TrainEvent[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += FRAME;
      const params = { ...MOCK_DEFAULTS, ...(p.level ? { level: p.level } : {}), ...(p.channels ? { channels: p.channels } : {}) };
      const r = mockReading(params, 100 - (p.nasal ?? 25), p.speech);
      const sample: DeviceReading & { t: number } = { ...r, t };
      let frame = proc.step(p.down ? null : sample, p.down ? "disconnected" : "connected", t);
      if (tweak) frame = tweak(frame);
      events.push(...game.update(frame, t, FRAME));
    }
  }
  return { events, t, proc };
}

const say = (ms = 500, nasal?: number): Phase => ({ ms, speech: true, nasal });
const hush = (ms = 400): Phase => ({ ms, speech: false });
/** A whole ride + arrival, with quiet mics. */
const legRest = (): Phase => hush(RIDE_MS + ARRIVE_MS + 150);
const coastRest = (): Phase => hush(COAST_MS + 100);
const trip = () => new TrainTrip(items(TRAIN_LEGS), 70);

describe("Delivery train (รถไฟส่งของ): one usable word = one ride = one leg", () => {
  it("a usable word rides one leg; after pulling in, the next leg listens for its own word", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(200)]);
    expect(a.events).toContainEqual({ type: "go", stop: 1 });
    expect(g.phase).toBe("ride");
    expect(g.at).toBe(0);
    expect(g.to).toBe(1);
    const b = run(g, [legRest()], a.t);
    expect(b.events).toContainEqual({ type: "arrive", stop: 1, last: false });
    expect(b.events).toContainEqual({ type: "ready", stop: 2 });
    expect(g.at).toBe(1);
    expect(g.phase).toBe("aim");
    expect(g.voiced).toBe(1);
    expect(g.stars).toBe(1);
    expect(g.attempts).toHaveLength(1);
    expect(g.call.current?.word).toBe("ตา");
    expect(g.results.slice(0, 2)).toEqual(["ride", null]);
  });

  it("four usable words reach the receiver: the last arrival hands the cargo over and ends the round", () => {
    const g = trip();
    let t = 0;
    const all: TrainEvent[] = [];
    for (let k = 0; k < TRAIN_LEGS; k++) {
      const r = run(g, [hush(), say(), hush(100), legRest()], t);
      t = r.t;
      all.push(...r.events);
    }
    expect(g.done).toBe(true);
    expect(g.at).toBe(TRAIN_LEGS);
    expect(g.voiced).toBe(TRAIN_LEGS);
    expect(g.attempts).toHaveLength(TRAIN_LEGS);
    expect(all.filter((e) => e.type === "go")).toHaveLength(TRAIN_LEGS);
    expect(all).toContainEqual({ type: "arrive", stop: TRAIN_LEGS, last: true });
    expect(all.filter((e) => e.type === "finish")).toHaveLength(1);
    // one ride per leg, nothing more (the arrival never adds a second count)
    expect(g.call.state.words.map((w) => w.usable)).toEqual([1, 1, 1, 1]);
  });

  it("the game does not listen while riding or pulling in: talking over it is not an attempt", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.busy).toBe(true);
    run(g, [say(RIDE_MS + ARRIVE_MS + 200)], a.t); // talks right through the ride and the arrival, into the next leg
    expect(g.at).toBe(1);
    expect(g.phase).toBe("aim");
    expect(g.attempts).toHaveLength(1);
    // the word that started while pulling in never counts: listening restarts only after a silent frame (re-arm)
    expect(g.call.state.armed).toBe(false);
    expect(g.call.state.words[1].attempts).toBe(0);
    const b = run(g, [say(400), hush(200)], a.t + RIDE_MS + ARRIVE_MS + 200);
    expect(b.events.some((e) => e.type === "go")).toBe(false);
    const c = run(g, [hush(300), say(), hush(300)], b.t);
    expect(c.events).toContainEqual({ type: "go", stop: 2 });
  });

  it("the example word never moves the train (playback is not the child)", () => {
    const g = trip();
    g.call.listenStart("model");
    const a = run(g, [say(900)]); // the speaker plays the word into the mics
    g.call.listenEnd(a.t);
    run(g, [hush(800)], a.t);
    expect(g.phase).toBe("aim");
    expect(g.goSeq).toBe(0);
    expect(g.steam).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });

  it("builds steam while the child speaks, but only a finished usable word departs; a blip does nothing", () => {
    const g = trip();
    const a = run(g, [hush(), say(1000)]);
    expect(g.speaking).toBe(true);
    expect(g.steam).toBeGreaterThan(0.5);
    expect(g.goSeq).toBe(0);
    run(g, [hush(90), say(80), hush(900)], a.t);
    const h = trip();
    run(h, [hush(), say(90), hush(900)]);
    expect(h.goSeq).toBe(0);
    expect(h.phase).toBe("aim");
    expect(h.steam).toBeLessThan(0.2); // relaxes again in the quiet
  });

  it("silence never moves the train (a nudge after a long silence is not an attempt)", () => {
    const g = trip();
    const a = run(g, [hush(9000)]);
    expect(a.events).toContainEqual({ type: "nudge", index: 0 });
    expect(g.goSeq).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(g.at).toBe(0);
  });

  it("a clipped (too loud) or too quiet word keeps the train at its stop with a retry; the next usable word departs", () => {
    const g = trip();
    const a = run(g, [hush(), { ms: 500, speech: true, level: "loud" }, hush(300)]);
    expect(a.events.some((e) => e.type === "go")).toBe(false);
    expect(a.events).toContainEqual({ type: "retry", index: 0, issue: "loud" });
    expect(g.phase).toBe("aim");
    const b = run(g, [{ ms: 500, speech: true, level: "quiet" }, hush(300)], a.t);
    expect(b.events.some((e) => e.type === "go")).toBe(false);
    expect(g.at).toBe(0);
    expect(g.attempts).toHaveLength(0);
    const c = run(g, [say(), hush(300)], b.t);
    expect(c.events.filter((e) => e.type === "go")).toHaveLength(1);
    expect(g.attempts).toHaveLength(1);
  });

  it("a dropped link or a dead mic channel never moves the train; after reconnecting it waits for silence first", () => {
    const g = trip();
    const proc = new SignalProcessor();
    const a = run(g, [hush(), say(300), { ms: 600, speech: true, down: true }], 0, proc);
    expect(a.events.some((e) => e.type === "go")).toBe(false);
    expect(a.events).toContainEqual({ type: "retry", index: 0, issue: "lost" });
    // back online mid-word: that word is not counted (no silent frame yet)
    const b = run(g, [say(400)], a.t, proc);
    expect(b.events.some((e) => e.type === "go")).toBe(false);
    const c = run(g, [{ ms: 600, speech: true, channels: "nasal-missing" }, hush(300)], b.t, proc);
    expect(c.events.some((e) => e.type === "go")).toBe(false);
    expect(g.at).toBe(0);
    expect(g.attempts).toHaveLength(0);
    const d = run(g, [hush(300), say(), hush(300)], c.t, proc);
    expect(d.events).toContainEqual({ type: "go", stop: 1 });
  });

  it("ride speed, distance and timing do not depend on loudness or the nasal value; the oral criterion is only recorded", () => {
    const trace = (nasal: number, louder: boolean) => {
      const g = trip();
      const tweak = louder ? (f: SignalFrame): SignalFrame => (f.quality.levelDb === null ? f : { ...f, quality: { ...f.quality, levelDb: f.quality.levelDb + 6 } }) : undefined;
      const a = run(g, [hush(), say(500, nasal)], 0, new SignalProcessor(), tweak);
      const ks: number[] = [];
      let t = a.t;
      for (let i = 0; i < 120; i++) {
        t = run(g, [hush(FRAME)], t, new SignalProcessor()).t;
        ks.push(Math.round(g.moveK * 1000));
      }
      return { g, ks };
    };
    const soft = trace(15, false);
    const loud = trace(80, true);
    expect(soft.ks).toEqual(loud.ks);
    expect(soft.g.at).toBe(1);
    expect(loud.g.at).toBe(1);
    expect(soft.g.attempts[0].passed).toBe(true);
    expect(loud.g.attempts[0].passed).toBe(false);
    expect(soft.g.voiced).toBe(loud.g.voiced);
  });

  it("pause mid-ride for 10 s: the train waits where it was and arrives only with active frames (no warp)", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("ride");
    const before = g.moveK;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(0.5);
    g.interrupt(); // pause: the loop stops calling update()
    const back = a.t + 10_000;
    // first frame after resuming gets dt = 0 (useGameLoop); then normal frames
    g.update(idle(back), back, 0);
    expect(g.moveK).toBeCloseTo(before, 6);
    expect(g.phase).toBe("ride");
    expect(g.at).toBe(0);
    // even a stale first frame that reports the whole 10 s counts at most one frame cap
    g.update(idle(back + 16), back + 16, 10_000);
    expect(g.moveK).toBeLessThanOrEqual(before + MAX_FRAME_DT_MS / RIDE_MS + 1e-9);
    expect(g.phase).toBe("ride");
    const b = run(g, [hush(RIDE_MS)], back + 16);
    expect(b.events).toContainEqual({ type: "arrive", stop: 1, last: false });
    expect(g.done).toBe(false);
  });

  it("pause while pulling in or coasting also waits; pausing while speaking drops the open attempt", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(300), hush(RIDE_MS + 100)]);
    expect(g.phase).toBe("arrive");
    const k = g.arriveK;
    g.interrupt();
    g.update(idle(a.t + 10_000), a.t + 10_000, 0);
    expect(g.arriveK).toBeCloseTo(k, 6);
    expect(g.phase).toBe("arrive");
    const coast = trip();
    coast.skip();
    const b = run(coast, [hush(COAST_MS / 2)]);
    const m = coast.moveK;
    coast.interrupt();
    coast.update(idle(b.t + 10_000), b.t + 10_000, 0);
    expect(coast.moveK).toBeCloseTo(m, 6);
    expect(coast.at).toBe(0);
    const talk = trip();
    const c = run(talk, [hush(), say(900)]);
    talk.interrupt();
    expect(talk.speaking).toBe(false);
    expect(talk.steam).toBe(0);
    run(talk, [hush(600)], c.t);
    expect(talk.goSeq).toBe(0);
    expect(talk.attempts).toHaveLength(0);
  });

  it("a vibration hold at the arrival keeps the mics closed; listening restarts only from silence", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(300), hush(RIDE_MS + 50)]);
    expect(g.phase).toBe("arrive");
    g.call.holdUntil(a.t + 3000); // e.g. a buzz right at the arrival (pattern + guard), longer than the arrival
    const b = run(g, [hush(ARRIVE_MS), say(600), hush(200)], a.t);
    expect(g.phase).toBe("aim");
    expect(b.events.some((e) => e.type === "go")).toBe(false);
    expect(g.call.state.words[1].attempts).toBe(0);
    const c = run(g, [hush(3000), say(), hush(300)], b.t);
    expect(c.events).toContainEqual({ type: "go", stop: 2 });
  });

  it("skip: the train coasts on to the next stop — no usable count, no star", () => {
    const g = trip();
    expect(g.skip()).toEqual([{ type: "coast", stop: 1 }]);
    expect(g.phase).toBe("coast");
    expect(g.busy).toBe(true);
    expect(g.skip()).toEqual([]); // not while riding
    const a = run(g, [say(COAST_MS + 100)]); // talking during the coast is not an attempt
    expect(a.events).toContainEqual({ type: "rolled", stop: 1, last: false });
    expect(a.events).toContainEqual({ type: "ready", stop: 2 });
    expect(g.at).toBe(1);
    expect(g.voiced).toBe(0);
    expect(g.stars).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(g.results.slice(0, 2)).toEqual(["coast", null]);
    expect(g.call.state.words[0].skipped).toBe(true);
    expect(g.call.state.words[0].usable).toBe(0);
  });

  it("skipping every leg still delivers the cargo and ends the round, with nothing counted", () => {
    const g = trip();
    let t = 0;
    const all: TrainEvent[] = [];
    for (let k = 0; k < TRAIN_LEGS; k++) {
      all.push(...g.skip());
      const r = run(g, [coastRest()], t);
      t = r.t;
      all.push(...r.events);
    }
    expect(g.done).toBe(true);
    expect(g.at).toBe(TRAIN_LEGS);
    expect(g.voiced).toBe(0);
    expect(g.coasted).toBe(TRAIN_LEGS);
    expect(g.stars).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(all.filter((e) => e.type === "go" || e.type === "arrive")).toHaveLength(0);
    expect(all).toContainEqual({ type: "rolled", stop: TRAIN_LEGS, last: true });
    expect(all.filter((e) => e.type === "finish")).toHaveLength(1);
    expect(g.call.state.words.every((w) => w.skipped && w.usable === 0)).toBe(true);
  });

  it("ending early keeps what was reached: a ride under way counts, a coast in progress does not", () => {
    const g = trip();
    run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("ride");
    g.finish();
    expect(g.done).toBe(true);
    expect(g.voiced).toBe(1);
    expect(g.at).toBe(1);
    const h = trip();
    h.skip();
    h.finish();
    expect(h.voiced).toBe(0);
    expect(h.at).toBe(1);
    expect(h.results[0]).toBe("coast");
    const i = trip();
    i.finish();
    expect(i.voiced).toBe(0);
    expect(i.at).toBe(0);
    expect(i.update(idle(0), 0, FRAME)).toEqual([]);
  });

  it("pulling in can be cut short (the leg stays counted), but not the ride itself", () => {
    const g = trip();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("ride");
    expect(g.skipArrive()).toEqual([]);
    run(g, [hush(RIDE_MS)], a.t);
    expect(g.phase).toBe("arrive");
    expect(g.skipArrive()).toContainEqual({ type: "ready", stop: 2 });
    expect(g.phase).toBe("aim");
    expect(g.voiced).toBe(1);
    const one = new TrainTrip(items(1), 70);
    const b = run(one, [hush(), say(), hush(300), hush(RIDE_MS)]);
    expect(one.skipArrive()).toContainEqual({ type: "finish" });
    expect(one.done).toBe(true);
    void b;
  });

  it("both views (3D scene and 2D track) read one view of the same game: switching never changes it", () => {
    const g = trip();
    run(g, [hush(), say(), hush(100), hush(RIDE_MS / 2)]);
    const v1 = trainView(g);
    const v2 = trainView(g);
    expect(v1).toEqual(v2);
    expect(v1).toMatchObject({ from: 0, to: 1, moving: "ride", delivered: false });
    expect(v1.k).toBeGreaterThan(0.3);
    expect(v1.k).toBeLessThan(0.8);
    expect(g.phase).toBe("ride"); // reading the view did not move the game
    run(g, [legRest()], 5000);
    expect(trainView(g)).toMatchObject({ from: 1, to: 1, moving: null, voiced: 1, delivered: false });
  });
});
