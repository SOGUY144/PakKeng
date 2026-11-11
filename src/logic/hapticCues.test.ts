import { describe, expect, it } from "vitest";
import { Haptics, type HapticsEnv } from "../lib/haptics";
import type { CallEvent } from "./call";
import { balloonCue, callCue, gateCue, kickCue, routeCue } from "./hapticCues";
import type { KickEvent } from "./kick";
import type { RouteEvent } from "./route";

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
