import { describe, expect, it } from "vitest";
import { Haptics, type HapticsEnv } from "../lib/haptics";
import type { CallEvent } from "./call";
import { bakeryCue, balloonCue, callCue, gateCue, kickCue, planeCue, routeCue, towerCue, trainCue } from "./hapticCues";
import type { KickEvent } from "./kick";
import type { RouteEvent } from "./route";
import type { TowerEvent } from "./tower";
import type { TrainEvent } from "./train";

const R = "r1";

describe("haptic cues: only finished, usable events buzz", () => {
  it("silence, unusable signal, retries, nudges and skips never buzz (no buzz is ever a penalty)", () => {
    const quiet: CallEvent[] = [
      { type: "retry", index: 0, issue: "quiet" },
      { type: "retry", index: 0, issue: "loud" },
      { type: "retry", index: 0, issue: "lost" },
      { type: "retry", index: 0, issue: "channel" },
      { type: "nudge", index: 0 },
      { type: "next", index: 1 },
      { type: "done" },
    ];
    for (const ev of quiet) {
      expect(callCue(ev, R)).toBeNull();
      expect(kickCue(ev, R)).toBeNull();
      expect(routeCue(ev, R, 6, true)).toBeNull();
      expect(towerCue(ev, R)).toBeNull();
      expect(trainCue(ev, R)).toBeNull();
    }
    expect(balloonCue({ type: "skip", index: 0 }, R)).toBeNull();
    expect(balloonCue({ type: "done" }, R)).toBeNull();
    expect(gateCue({ type: "attempt", attempt: { meanNasal: 60, passed: true, durationMs: 600, usable: true } }, R)).toBeNull();
  });

  it("frog: the friend hearing a usable call buzzes once; more calls to the same friend do not", () => {
    expect(callCue({ type: "heard", index: 2, first: true, meanNasal: 30, durationMs: 500 }, R)).toEqual({ kind: "usable", key: "call:r1:heard:2" });
    expect(callCue({ type: "heard", index: 2, first: false, meanNasal: 30, durationMs: 500 }, R)).toBeNull();
  });

  it("kick: one buzz per ball, at the goal — the kick of the same word stays quiet", () => {
    const ball: KickEvent[] = [{ type: "heard", index: 0, first: true, meanNasal: 20, durationMs: 400 }, { type: "kick", shot: 0 }, { type: "goal", shot: 0 }, { type: "ready", shot: 1 }];
    const cues = ball.map((e) => kickCue(e, R)).filter(Boolean);
    expect(cues).toEqual([{ kind: "reward", key: "kick:r1:goal:0" }]);
  });

  it("runner: setting off on a word buzzes (usable); the last word buzzes once, at the destination, and only if it was heard", () => {
    expect(routeCue({ type: "leave", to: 3 }, R, 6, false)).toEqual({ kind: "usable", key: "route:r1:leave:3" });
    expect(routeCue({ type: "leave", to: 6 }, R, 6, true)).toBeNull();
    expect(routeCue({ type: "arrive", at: 3 }, R, 6, true)).toBeNull();
    expect(routeCue({ type: "finish" }, R, 6, true)).toEqual({ kind: "reward", key: "route:r1:finish" });
    expect(routeCue({ type: "finish" } as RouteEvent, R, 6, false)).toBeNull();
  });

  it("balloon and door: the delivery and the opening are the rewards", () => {
    expect(balloonCue({ type: "balloon-complete", index: 2 }, R)).toEqual({ kind: "reward", key: "balloon:r1:delivered:2" });
    expect(gateCue({ type: "open" }, R)).toEqual({ kind: "reward", key: "gate:r1:open" });
  });

  it("tower: one buzz per voiced floor, at the landing; the top is the reward alone; the skip lift and the jump stay quiet", () => {
    const floor: TowerEvent[] = [{ type: "heard", index: 0, first: true, meanNasal: 20, durationMs: 400 }, { type: "jump", floor: 1 }, { type: "land", floor: 1, top: false }, { type: "ready", floor: 2 }];
    expect(floor.map((e) => towerCue(e, R)).filter(Boolean)).toEqual([{ kind: "usable", key: "tower:r1:land:1" }]);
    const top: TowerEvent[] = [{ type: "jump", floor: 5 }, { type: "land", floor: 5, top: true }, { type: "finish" }];
    expect(top.map((e) => towerCue(e, R)).filter(Boolean)).toEqual([{ kind: "reward", key: "tower:r1:top" }]);
    const lift: TowerEvent[] = [{ type: "lift", floor: 3 }, { type: "arrive", floor: 3, top: false }, { type: "arrive", floor: 5, top: true }, { type: "finish" }];
    expect(lift.map((e) => towerCue(e, R)).filter(Boolean)).toEqual([]);
  });

  it("train: one buzz per voiced leg, when it pulls in; the delivery is the reward alone; coasting and departing stay quiet", () => {
    const leg: TrainEvent[] = [{ type: "heard", index: 0, first: true, meanNasal: 20, durationMs: 400 }, { type: "go", stop: 1 }, { type: "arrive", stop: 1, last: false }, { type: "ready", stop: 2 }];
    expect(leg.map((e) => trainCue(e, R)).filter(Boolean)).toEqual([{ kind: "usable", key: "train:r1:arrive:1" }]);
    const last: TrainEvent[] = [{ type: "go", stop: 4 }, { type: "arrive", stop: 4, last: true }, { type: "finish" }];
    expect(last.map((e) => trainCue(e, R)).filter(Boolean)).toEqual([{ kind: "reward", key: "train:r1:deliver" }]);
    const coast: TrainEvent[] = [{ type: "coast", stop: 2 }, { type: "rolled", stop: 2, last: false }, { type: "rolled", stop: 4, last: true }, { type: "finish" }];
    expect(coast.map((e) => trainCue(e, R)).filter(Boolean)).toEqual([]);
  });

  it("the same event seen twice (re-render, repeated handler) buzzes once; a new round's event buzzes again", () => {
    const calls: unknown[] = [];
    let t = 0;
    const env: HapticsEnv = {
      vibrate: (p) => {
        calls.push(p);
        return true;
      },
      visible: () => true,
      activated: () => true,
      now: () => (t += 1000),
      load: () => null,
      save: () => {},
    };
    const h = new Haptics(env);
    const goal: KickEvent = { type: "goal", shot: 0 };
    for (let i = 0; i < 3; i++) {
      const c = kickCue(goal, "round-a");
      if (c) h.buzz(c.kind, { key: c.key });
    }
    const next = kickCue(goal, "round-b");
    if (next) h.buzz(next.kind, { key: next.key });
    expect(calls).toEqual([
      [20, 35, 35],
      [20, 35, 35],
    ]);
  });
});

describe("haptic cues of the bubble pilot and the animal bakery", () => {
  it("plane: a reward only when a cloud pops or the plane rolls past hail; a near miss or a drift never buzzes", () => {
    expect(planeCue({ type: "hit", encounter: 2 }, R)).toEqual({ kind: "reward", key: "plane:r1:hit:2" });
    expect(planeCue({ type: "dodge", encounter: 4 }, R)).toEqual({ kind: "reward", key: "plane:r1:dodge:4" });
    expect(planeCue({ type: "near", encounter: 1, tries: 1 }, R)).toBeNull();
    expect(planeCue({ type: "drift", encounter: 1 }, R)).toBeNull();
    expect(planeCue({ type: "fire", encounter: 1, kind: "cloud" }, R)).toBeNull();
  });

  it("bakery: a quiet tap when a topping drops on a usable word, a reward when the friend eats; each key is unique", () => {
    expect(bakeryCue({ type: "drop", customer: 1, topping: 0 }, R)).toEqual({ kind: "usable", key: "bakery:r1:drop:1:0" });
    expect(bakeryCue({ type: "drop", customer: 1, topping: 1 }, R)?.key).toBe("bakery:r1:drop:1:1");
    expect(bakeryCue({ type: "eat", customer: 3 }, R)).toEqual({ kind: "reward", key: "bakery:r1:eat:3" });
    expect(bakeryCue({ type: "served", customer: 3 }, R)).toBeNull();
  });
});
