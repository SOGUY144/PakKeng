import { describe, expect, it } from "vitest";
import { HAPTIC_GUARD_MS, HAPTIC_PATTERNS, Haptics, patternMs, quietMs, type HapticsEnv } from "./haptics";

/** A stub browser: records every vibrate call; time, visibility, activation and storage are set by the test. */
function stub(over: Partial<HapticsEnv> & { supported?: boolean; result?: boolean; throws?: boolean } = {}) {
  const calls: (number | number[])[] = [];
  let t = 1000;
  let stored: string | null = null;
  const state = { visible: true, activated: true };
  const env: HapticsEnv = {
    vibrate:
      over.supported === false
        ? null
        : (p) => {
            calls.push(p);
            if (over.throws) throw new Error("blocked");
            return over.result ?? true;
          },
    visible: () => state.visible,
    activated: () => state.activated,
    now: () => t,
    load: () => stored,
    save: (v) => {
      stored = v;
    },
    ...over,
  };
  return {
    env,
    calls,
    state,
    tick: (ms: number) => (t += ms),
    stored: () => stored,
    setStored: (v: string | null) => (stored = v),
  };
}

describe("haptics: optional, short, fixed patterns", () => {
  it("patterns are fixed: tap 10 ms, usable attempt 18 ms, goal/reward 20-35-35 ms", () => {
    expect(HAPTIC_PATTERNS.tap).toEqual([10]);
    expect(HAPTIC_PATTERNS.usable).toEqual([18]);
    expect(HAPTIC_PATTERNS.reward).toEqual([20, 35, 35]);
    expect(patternMs("reward")).toBe(90);
    expect(quietMs("usable")).toBe(18 + HAPTIC_GUARD_MS);
  });

  it("each kind sends exactly its own pattern (nothing in the moment scales it)", () => {
    const s = stub();
    const h = new Haptics(s.env);
    h.buzz("tap");
    s.tick(500);
    h.buzz("usable", { signal: { valid: true } });
    s.tick(500);
    h.buzz("reward", { key: "goal-1" });
    expect(s.calls).toEqual([[10], [18], [20, 35, 35]]);
  });

  it("without navigator.vibrate it is a safe no-op: off by default, nothing thrown, cancel does nothing", () => {
    const s = stub({ supported: false });
    const h = new Haptics(s.env);
    expect(h.supported).toBe(false);
    expect(h.pref).toBe("off");
    expect(h.enabled).toBe(false);
    expect(h.buzz("reward")).toEqual({ fired: false, reason: "unsupported" });
    expect(() => h.cancel()).not.toThrow();
    // even a saved "on" cannot make an unsupported browser vibrate
    h.setPref("on");
    expect(h.buzz("tap")).toEqual({ fired: false, reason: "unsupported" });
  });

  it("a browser that refuses (returns false) or throws never breaks the game and reports failed", () => {
    const refusing = new Haptics(stub({ result: false }).env);
    expect(refusing.buzz("tap")).toEqual({ fired: false, reason: "failed" });
    const throwing = new Haptics(stub({ throws: true }).env);
    expect(() => throwing.buzz("tap")).not.toThrow();
    expect(throwing.buzz("usable")).toEqual({ fired: false, reason: "failed" });
    expect(() => throwing.cancel()).not.toThrow();
  });

  it("on by default only where the browser offers vibration; the adult's choice is saved and kept on reload", () => {
    const s = stub();
    const h = new Haptics(s.env);
    expect(h.pref).toBe("on");
    h.setPref("off");
    expect(s.stored()).toBe("off");
    const again = new Haptics(s.env);
    expect(again.pref).toBe("off");
    expect(again.buzz("reward")).toEqual({ fired: false, reason: "off" });
    expect(s.calls.filter((c) => c !== 0)).toEqual([]);
  });

  it("turning it off cancels a pattern that is still running", () => {
    const s = stub();
    const h = new Haptics(s.env);
    h.buzz("reward");
    h.setPref("off");
    expect(s.calls).toEqual([[20, 35, 35], 0]);
  });

  it("no vibration before the first tap on the page (browsers ignore it then)", () => {
    const s = stub();
    s.state.activated = false;
    expect(new Haptics(s.env).buzz("tap")).toEqual({ fired: false, reason: "inactive" });
    expect(s.calls).toEqual([]);
  });

  it("paused or hidden: nothing buzzes, and hiding the page cancels what is running (nothing replays on return)", () => {
    const s = stub();
    const h = new Haptics(s.env);
    expect(h.buzz("reward", { paused: true })).toEqual({ fired: false, reason: "paused" });
    h.buzz("reward");
    s.state.visible = false;
    h.handleHidden();
    expect(s.calls).toEqual([[20, 35, 35], 0]);
    expect(h.buzz("tap")).toEqual({ fired: false, reason: "hidden" });
    s.state.visible = true;
    s.tick(1000);
    // back on the page: no late buzz, only new events can vibrate
    expect(s.calls).toEqual([[20, 35, 35], 0]);
  });

  it("cancel (pause / leaving the screen) sends vibrate(0) and frees the motor for the next event", () => {
    const s = stub();
    const h = new Haptics(s.env);
    h.buzz("reward");
    h.cancel();
    expect(h.buzz("tap").fired).toBe(true);
    expect(s.calls).toEqual([[20, 35, 35], 0, [10]]);
  });

  it("never while the game listens, an example plays, or the signal is unusable (lost, stale, channel, clipping)", () => {
    const s = stub();
    const h = new Haptics(s.env);
    expect(h.buzz("usable", { listening: true })).toEqual({ fired: false, reason: "listening" });
    expect(h.buzz("usable", { playing: true })).toEqual({ fired: false, reason: "playing" });
    expect(h.buzz("usable", { signal: { valid: false } })).toEqual({ fired: false, reason: "signal" });
    expect(h.buzz("reward", { signal: { valid: true, clipping: true } })).toEqual({ fired: false, reason: "signal" });
    expect(s.calls).toEqual([]);
  });

  it("one event buzzes once: the same key (re-render, repeated save, reopened result) never buzzes again", () => {
    const s = stub();
    const h = new Haptics(s.env);
    expect(h.buzz("reward", { key: "kick:r1:goal:0" }).fired).toBe(true);
    s.tick(2000);
    expect(h.buzz("reward", { key: "kick:r1:goal:0" })).toEqual({ fired: false, reason: "duplicate" });
    // an event refused while listening is used up too: it cannot buzz late
    expect(h.buzz("usable", { key: "frog:r1:heard:2", listening: true }).fired).toBe(false);
    expect(h.buzz("usable", { key: "frog:r1:heard:2" })).toEqual({ fired: false, reason: "duplicate" });
    expect(s.calls).toEqual([[20, 35, 35]]);
  });

  it("no queue: a second event while a pattern still runs is dropped, not played later", () => {
    const s = stub();
    const h = new Haptics(s.env);
    h.buzz("reward");
    s.tick(40);
    expect(h.buzz("tap")).toEqual({ fired: false, reason: "busy" });
    s.tick(60);
    expect(h.buzz("tap").fired).toBe(true);
    expect(s.calls).toEqual([[20, 35, 35], [10]]);
  });

  it("re-arm guard: a buzz tells the game to keep its mics closed until the pattern plus the guard has passed", () => {
    const s = stub();
    const h = new Haptics(s.env);
    const r = h.buzz("usable");
    expect(r).toEqual({ fired: true, holdUntil: 1000 + 18 + HAPTIC_GUARD_MS });
    s.tick(1000);
    expect(h.buzz("reward")).toEqual({ fired: true, holdUntil: 2000 + 90 + HAPTIC_GUARD_MS });
  });

  it("the adult's test button plays one reward pattern and is refused like any other buzz when off", () => {
    const s = stub();
    const h = new Haptics(s.env);
    expect(h.test().fired).toBe(true);
    h.setPref("off");
    expect(h.test()).toEqual({ fired: false, reason: "off" });
  });

  it("blocked storage: the choice still applies for this visit", () => {
    const s = stub({
      load: () => {
        throw new Error("blocked");
      },
      save: () => {
        throw new Error("blocked");
      },
    });
    const h = new Haptics(s.env);
    expect(h.pref).toBe("on");
    h.setPref("off");
    expect(h.pref).toBe("off");
  });
});
