import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type MicChannels, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor, type SignalFrame } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import type { CallItem } from "./call";
import { MAX_FRAME_DT_MS } from "./common";
import { climbView, JUMP_MS, LAND_MS, LIFT_MS, TOWER_FLOORS, TowerClimb, type TowerEvent } from "./tower";

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
/** A frame with no reading (the game ignores the signal while jumping, landing or riding the lift anyway). */
const idle = (t: number): SignalFrame => new SignalProcessor().step(null, "connected", t);

/** Drive the climb at 60 fps through device phases (same demo device model as the kick and call tests). */
function run(game: TowerClimb, phases: Phase[], start = 0, proc = new SignalProcessor(), tweak?: (f: SignalFrame) => SignalFrame) {
  let t = start;
  const events: TowerEvent[] = [];
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
/** A whole jump + landing, with quiet mics. */
const floorRest = (): Phase => hush(JUMP_MS + LAND_MS + 150);
const liftRest = (): Phase => hush(LIFT_MS + 100);
const climb = () => new TowerClimb(items(TOWER_FLOORS), 70);

describe("Cloud tower (หอคอยเมฆ): one usable word = one jump = one floor", () => {
  it("a usable word jumps one floor; after the landing the next floor listens for its own word", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(200)]);
    expect(a.events).toContainEqual({ type: "jump", floor: 1 });
    expect(g.phase).toBe("jump");
    expect(g.at).toBe(0);
    expect(g.to).toBe(1);
    const b = run(g, [floorRest()], a.t);
    expect(b.events).toContainEqual({ type: "land", floor: 1, top: false });
    expect(b.events).toContainEqual({ type: "ready", floor: 2 });
    expect(g.at).toBe(1);
    expect(g.phase).toBe("aim");
    expect(g.voiced).toBe(1);
    expect(g.stars).toBe(1);
    expect(g.attempts).toHaveLength(1);
    expect(g.call.current?.word).toBe("ตา");
    expect(g.results.slice(0, 2)).toEqual(["jump", null]);
  });

  it("five usable words reach the top: the last landing ends the round", () => {
    const g = climb();
    let t = 0;
    const all: TowerEvent[] = [];
    for (let k = 0; k < TOWER_FLOORS; k++) {
      const r = run(g, [hush(), say(), hush(100), floorRest()], t);
      t = r.t;
      all.push(...r.events);
    }
    expect(g.done).toBe(true);
    expect(g.at).toBe(TOWER_FLOORS);
    expect(g.voiced).toBe(TOWER_FLOORS);
    expect(g.attempts).toHaveLength(TOWER_FLOORS);
    expect(all.filter((e) => e.type === "jump")).toHaveLength(TOWER_FLOORS);
    expect(all).toContainEqual({ type: "land", floor: TOWER_FLOORS, top: true });
    expect(all.filter((e) => e.type === "finish")).toHaveLength(1);
    // one jump per floor, nothing more (the landing never adds a second count)
    expect(g.call.state.words.map((w) => w.usable)).toEqual([1, 1, 1, 1, 1]);
  });

  it("the game does not listen while jumping or landing: talking over it is not an attempt", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.busy).toBe(true);
    run(g, [say(JUMP_MS + LAND_MS + 200)], a.t); // talks right through the jump and the landing, into the next floor
    expect(g.at).toBe(1);
    expect(g.phase).toBe("aim");
    expect(g.attempts).toHaveLength(1);
    // the word that started mid-landing never counts: listening restarts only after a silent frame (re-arm)
    expect(g.call.state.armed).toBe(false);
    expect(g.call.state.words[1].attempts).toBe(0);
    const b = run(g, [say(400), hush(200)], a.t + JUMP_MS + LAND_MS + 200);
    expect(b.events.some((e) => e.type === "jump")).toBe(false);
    const c = run(g, [hush(300), say(), hush(300)], b.t);
    expect(c.events).toContainEqual({ type: "jump", floor: 2 });
  });

  it("the example word never jumps (playback is not the child)", () => {
    const g = climb();
    g.call.listenStart("model");
    const a = run(g, [say(900)]); // the speaker plays the word into the mics
    g.call.listenEnd(a.t);
    run(g, [hush(800)], a.t);
    expect(g.phase).toBe("aim");
    expect(g.jumpSeq).toBe(0);
    expect(g.crouch).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });

  it("crouches while the child speaks, but only a finished usable word jumps; a blip does nothing", () => {
    const g = climb();
    const a = run(g, [hush(), say(1000)]);
    expect(g.speaking).toBe(true);
    expect(g.crouch).toBeGreaterThan(0.5);
    expect(g.jumpSeq).toBe(0);
    run(g, [hush(90), say(80), hush(900)], a.t);
    const h = climb();
    run(h, [hush(), say(90), hush(900)]);
    expect(h.jumpSeq).toBe(0);
    expect(h.phase).toBe("aim");
    expect(h.crouch).toBeLessThan(0.2); // relaxes again in the quiet
  });

  it("silence never jumps (a nudge after a long silence is not an attempt)", () => {
    const g = climb();
    const a = run(g, [hush(9000)]);
    expect(a.events).toContainEqual({ type: "nudge", index: 0 });
    expect(g.jumpSeq).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(g.at).toBe(0);
  });

  it("a clipped (too loud) or too quiet word stays on the same cloud with a retry; the next usable word jumps", () => {
    const g = climb();
    const a = run(g, [hush(), { ms: 500, speech: true, level: "loud" }, hush(300)]);
    expect(a.events.some((e) => e.type === "jump")).toBe(false);
    expect(a.events).toContainEqual({ type: "retry", index: 0, issue: "loud" });
    expect(g.phase).toBe("aim");
    const b = run(g, [{ ms: 500, speech: true, level: "quiet" }, hush(300)], a.t);
    expect(b.events.some((e) => e.type === "jump")).toBe(false);
    expect(g.at).toBe(0);
    expect(g.attempts).toHaveLength(0);
    const c = run(g, [say(), hush(300)], b.t);
    expect(c.events.filter((e) => e.type === "jump")).toHaveLength(1);
    expect(g.attempts).toHaveLength(1);
  });

  it("a dropped link or a dead mic channel never jumps; after reconnecting it waits for silence first", () => {
    const g = climb();
    const proc = new SignalProcessor();
    const a = run(g, [hush(), say(300), { ms: 600, speech: true, down: true }], 0, proc);
    expect(a.events.some((e) => e.type === "jump")).toBe(false);
    expect(a.events).toContainEqual({ type: "retry", index: 0, issue: "lost" });
    // back online mid-word: that word is not counted (no silent frame yet)
    const b = run(g, [say(400)], a.t, proc);
    expect(b.events.some((e) => e.type === "jump")).toBe(false);
    const c = run(g, [{ ms: 600, speech: true, channels: "nasal-missing" }, hush(300)], b.t, proc);
    expect(c.events.some((e) => e.type === "jump")).toBe(false);
    expect(g.at).toBe(0);
    expect(g.attempts).toHaveLength(0);
    const d = run(g, [hush(300), say(), hush(300)], c.t, proc);
    expect(d.events).toContainEqual({ type: "jump", floor: 1 });
  });

  it("jump height, length and timing do not depend on loudness or the nasal value; the oral criterion is only recorded", () => {
    const trace = (nasal: number, louder: boolean) => {
      const g = climb();
      const tweak = louder ? (f: SignalFrame): SignalFrame => (f.quality.levelDb === null ? f : { ...f, quality: { ...f.quality, levelDb: f.quality.levelDb + 6 } }) : undefined;
      const a = run(g, [hush(), say(500, nasal)], 0, new SignalProcessor(), tweak);
      const ks: number[] = [];
      let t = a.t;
      for (let i = 0; i < 80; i++) {
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

  it("pause mid-jump for 10 s: the jump waits where it was and finishes only with active frames (no warp)", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("jump");
    const before = g.moveK;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(0.5);
    g.interrupt(); // pause: the loop stops calling update()
    const back = a.t + 10_000;
    // first frame after resuming gets dt = 0 (useGameLoop); then normal frames
    g.update(idle(back), back, 0);
    expect(g.moveK).toBeCloseTo(before, 6);
    expect(g.phase).toBe("jump");
    expect(g.at).toBe(0);
    // even a stale first frame that reports the whole 10 s counts at most one frame cap
    g.update(idle(back + 16), back + 16, 10_000);
    expect(g.moveK).toBeLessThanOrEqual(before + MAX_FRAME_DT_MS / JUMP_MS + 1e-9);
    expect(g.phase).toBe("jump");
    const b = run(g, [hush(JUMP_MS)], back + 16);
    expect(b.events).toContainEqual({ type: "land", floor: 1, top: false });
    expect(g.done).toBe(false);
  });

  it("pause during the landing or the skip lift also waits; pausing while speaking drops the open attempt", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(100), hush(JUMP_MS + 100)]);
    expect(g.phase).toBe("land");
    const k = g.landK;
    g.interrupt();
    g.update(idle(a.t + 10_000), a.t + 10_000, 0);
    expect(g.landK).toBeCloseTo(k, 6);
    expect(g.phase).toBe("land");
    const lift = climb();
    lift.skip();
    const b = run(lift, [hush(LIFT_MS / 2)]);
    const m = lift.moveK;
    lift.interrupt();
    lift.update(idle(b.t + 10_000), b.t + 10_000, 0);
    expect(lift.moveK).toBeCloseTo(m, 6);
    expect(lift.at).toBe(0);
    const talk = climb();
    const c = run(talk, [hush(), say(900)]);
    talk.interrupt();
    expect(talk.speaking).toBe(false);
    expect(talk.crouch).toBe(0);
    run(talk, [hush(600)], c.t);
    expect(talk.jumpSeq).toBe(0);
    expect(talk.attempts).toHaveLength(0);
  });

  it("a vibration hold after the landing keeps the mics closed; listening restarts only from silence", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(300), hush(JUMP_MS + 50)]);
    expect(g.phase).toBe("land");
    g.call.holdUntil(a.t + 3000); // e.g. a buzz right at the landing (pattern + guard), longer than the landing
    const b = run(g, [hush(LAND_MS), say(600), hush(200)], a.t);
    expect(g.phase).toBe("aim");
    expect(b.events.some((e) => e.type === "jump")).toBe(false);
    expect(g.call.state.words[1].attempts).toBe(0);
    const c = run(g, [hush(3000), say(), hush(300)], b.t);
    expect(c.events).toContainEqual({ type: "jump", floor: 2 });
  });

  it("skip: a cloud lift carries the avatar up one floor — no usable count, no star", () => {
    const g = climb();
    expect(g.skip()).toEqual([{ type: "lift", floor: 1 }]);
    expect(g.phase).toBe("lift");
    expect(g.busy).toBe(true);
    expect(g.skip()).toEqual([]); // not while riding
    const a = run(g, [say(LIFT_MS + 100)]); // talking on the lift is not an attempt
    expect(a.events).toContainEqual({ type: "arrive", floor: 1, top: false });
    expect(a.events).toContainEqual({ type: "ready", floor: 2 });
    expect(g.at).toBe(1);
    expect(g.voiced).toBe(0);
    expect(g.stars).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(g.results.slice(0, 2)).toEqual(["skip", null]);
    expect(g.call.state.words[0].skipped).toBe(true);
    expect(g.call.state.words[0].usable).toBe(0);
  });

  it("skipping every floor still reaches the top and ends the round, with nothing counted", () => {
    const g = climb();
    let t = 0;
    const all: TowerEvent[] = [];
    for (let k = 0; k < TOWER_FLOORS; k++) {
      all.push(...g.skip());
      const r = run(g, [liftRest()], t);
      t = r.t;
      all.push(...r.events);
    }
    expect(g.done).toBe(true);
    expect(g.at).toBe(TOWER_FLOORS);
    expect(g.voiced).toBe(0);
    expect(g.skipped).toBe(TOWER_FLOORS);
    expect(g.stars).toBe(0);
    expect(g.attempts).toHaveLength(0);
    expect(all.filter((e) => e.type === "jump" || e.type === "land")).toHaveLength(0);
    expect(all).toContainEqual({ type: "arrive", floor: TOWER_FLOORS, top: true });
    expect(all.filter((e) => e.type === "finish")).toHaveLength(1);
    expect(g.call.state.words.every((w) => w.skipped && w.usable === 0)).toBe(true);
  });

  it("ending early keeps what was reached: a jump in the air counts, a lift in progress does not", () => {
    const g = climb();
    run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("jump");
    g.finish();
    expect(g.done).toBe(true);
    expect(g.voiced).toBe(1);
    expect(g.at).toBe(1);
    const h = climb();
    h.skip();
    h.finish();
    expect(h.voiced).toBe(0);
    expect(h.at).toBe(1);
    expect(h.results[0]).toBe("skip");
    const i = climb();
    i.finish();
    expect(i.voiced).toBe(0);
    expect(i.at).toBe(0);
    expect(i.update(idle(0), 0, FRAME)).toEqual([]);
  });

  it("the landing can be cut short (the floor stays counted), but not the jump itself", () => {
    const g = climb();
    const a = run(g, [hush(), say(), hush(300)]);
    expect(g.phase).toBe("jump");
    expect(g.skipLand()).toEqual([]);
    run(g, [hush(JUMP_MS)], a.t);
    expect(g.phase).toBe("land");
    expect(g.skipLand()).toContainEqual({ type: "ready", floor: 2 });
    expect(g.phase).toBe("aim");
    expect(g.voiced).toBe(1);
    const one = new TowerClimb(items(1), 70);
    const b = run(one, [hush(), say(), hush(300), hush(JUMP_MS)]);
    expect(one.skipLand()).toContainEqual({ type: "finish" });
    expect(one.done).toBe(true);
    void b;
  });

  it("both views (3D scene and 2D side stack) read one view of the same game: switching never changes it", () => {
    const g = climb();
    run(g, [hush(), say(), hush(100), hush(JUMP_MS / 2)]);
    const v1 = climbView(g);
    const v2 = climbView(g);
    expect(v1).toEqual(v2);
    expect(v1).toMatchObject({ from: 0, to: 1, moving: "jump", floor: 0 });
    expect(v1.k).toBeGreaterThan(0.3);
    expect(v1.k).toBeLessThan(0.8);
    expect(g.phase).toBe("jump"); // reading the view did not move the game
    run(g, [floorRest()], 5000);
    expect(climbView(g)).toMatchObject({ from: 1, to: 1, moving: null, floor: 1, voiced: 1 });
  });
});
