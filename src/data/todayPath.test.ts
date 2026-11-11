import { describe, expect, it } from "vitest";
import type { Session } from "./schema";
import { freshPlays, practiceDaysThisWeek, roundsFor, todayPath } from "./todayPath";

// Thursday 6 Nov 2026, 10:00 local time
const NOW = new Date(2026, 10, 6, 10, 0, 0);

let seq = 0;
function session(at: Date, over: Partial<Session> = {}): Session {
  seq += 1;
  return {
    id: `s${seq}`,
    childId: "C-014",
    source: "demo",
    startedAt: at.toISOString(),
    durationSec: 120,
    game: "frog",
    rounds: 1,
    words: [],
    level: 1,
    oralThreshold: 70,
    gateThreshold: 40,
    attempts: 3,
    passed: 3,
    meanNasalOral: null,
    gate: null,
    balloon: null,
    frog: null,
    call: null,
    choice: null,
    stars: 2,
    endedEarly: false,
    ...over,
  };
}

const today = (h: number, m = 0) => new Date(2026, 10, 6, h, m);

describe("roundsFor — rounds on today's path from the teacher's daily minutes (~3 min a round, 1–6)", () => {
  it.each([
    [1, 1],
    [5, 2],
    [10, 3],
    [15, 5],
    [20, 6],
    [60, 6],
  ])("%i minutes → %i rounds", (minutes, rounds) => {
    expect(roundsFor(minutes)).toBe(rounds);
  });
});

describe("todayPath", () => {
  it("a fresh day: mic check open, round 1 current, the rest locked, chest locked", () => {
    const p = todayPath({ dailyMinutes: 10, sessions: [], calibratedToday: false, now: NOW });
    expect(p.rounds).toBe(3);
    expect(p.played).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.nodes.map((n) => `${n.kind}:${n.state}`)).toEqual(["mic:open", "round:current", "round:locked", "round:locked", "chest:locked"]);
  });

  it("the mic check shows done once calibrated today, but never blocks the rounds", () => {
    const p = todayPath({ dailyMinutes: 10, sessions: [], calibratedToday: true, now: NOW });
    expect(p.nodes[0]).toMatchObject({ kind: "mic", state: "done" });
    expect(p.nodes[1]).toMatchObject({ kind: "round", state: "current" });
  });

  it("each round saved today (any game) passes one step, in the order played, and remembers its game", () => {
    const sessions = [session(today(9, 30), { game: "balloon" }), session(today(8), { game: "frog" })];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW });
    expect(p.played).toBe(2);
    const rounds = p.nodes.filter((n) => n.kind === "round");
    expect(rounds.map((n) => [n.state, n.play])).toEqual([
      ["done", "frog"],
      ["done", "balloon"],
      ["current", undefined],
    ]);
  });

  it("only counts today's rounds of this child", () => {
    const sessions = [
      session(new Date(2026, 10, 5, 18), { game: "frog" }), // yesterday
      session(today(8), { childId: "C-021" }), // another child
      session(today(8, 30), { game: "runner" }),
    ];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW, childId: "C-014" });
    expect(p.played).toBe(1);
  });

  it("a door round shows as the door; a route that went on to the door is one round", () => {
    const gate = { attempts: 1, passed: 1, meanNasal: 50, opened: true, skipped: false };
    const sessions = [session(today(8), { game: "runner", attempts: 0, gate }), session(today(9), { game: "runner", attempts: 6, gate })];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW });
    expect(p.played).toBe(2);
    expect(p.nodes.filter((n) => n.kind === "round").map((n) => n.play)).toEqual(["gate", "runner", undefined]);
  });

  it("all rounds played: the chest opens, nothing is current, extra rounds are counted, not new steps", () => {
    const sessions = [0, 1, 2, 3].map((i) => session(today(8 + i)));
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: true, now: NOW });
    expect(p.complete).toBe(true);
    expect(p.extra).toBe(1);
    expect(p.nodes.filter((n) => n.kind === "round")).toHaveLength(3);
    expect(p.nodes.some((n) => n.state === "current")).toBe(false);
    expect(p.nodes.at(-1)).toMatchObject({ kind: "chest", state: "open" });
  });

  it("minutes and stars of today (for the banner, the current step's ring and the chest)", () => {
    const sessions = [session(today(8), { durationSec: 150, stars: 2 }), session(today(9), { durationSec: 30, stars: 1 })];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW });
    expect(p.practiceSec).toBe(180);
    expect(p.targetSec).toBe(600);
    expect(p.progress).toBeCloseTo(0.3);
    expect(p.starsToday).toBe(3);
  });

  it("only rounds where the child tried to speak pass a step (listening only, or a device that dropped, does not)", () => {
    const sessions = [
      session(today(8), { game: "frog", attempts: 0, passed: 0 }), // only listened to the examples
      session(today(8, 30), { game: "runner", attempts: 0, stars: 0 }), // every leg skipped
      session(today(9), { game: "runner", attempts: 0, gate: { attempts: 2, passed: 1, meanNasal: 45, opened: false, skipped: false } }), // door tried
      session(today(9, 30), { game: "balloon", attempts: 4 }),
    ];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW });
    expect(p.played).toBe(2);
    expect(p.nodes.filter((n) => n.kind === "round" && n.state === "done").map((n) => n.play)).toEqual(["gate", "balloon"]);
  });

  it("a run whose legs were all skipped is not shown as a door round", () => {
    const skipped = { attempts: 0, passed: 0, meanNasal: null, opened: false, skipped: true };
    const sessions = [
      session(today(8), { game: "runner", attempts: 2, gate: skipped, choice: { kind: "route", id: "flower", label: "ทางดอกไม้" } }),
    ];
    const p = todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW });
    expect(p.nodes.find((n) => n.kind === "round")?.play).toBe("runner");
  });

  it("uses the local day: 00:30 today counts, 23:30 yesterday does not", () => {
    const sessions = [session(new Date(2026, 10, 6, 0, 30)), session(new Date(2026, 10, 5, 23, 30))];
    expect(todayPath({ dailyMinutes: 10, sessions, calibratedToday: false, now: NOW }).played).toBe(1);
  });

  it("progress never goes past 1", () => {
    const p = todayPath({ dailyMinutes: 1, sessions: [session(today(8), { durationSec: 600 })], calibratedToday: false, now: NOW });
    expect(p.progress).toBe(1);
  });
});

describe("practiceDaysThisWeek — days with a saved round, Monday to Sunday (not a streak: a missed day never resets it)", () => {
  it("counts distinct days of this week only", () => {
    const sessions = [
      session(new Date(2026, 10, 2, 9)), // Mon
      session(new Date(2026, 10, 2, 17)), // Mon again
      session(new Date(2026, 10, 4, 9)), // Wed
      session(today(8)), // Thu (today)
      session(new Date(2026, 10, 1, 9)), // Sun of last week
      session(new Date(2026, 10, 9, 9)), // next Monday
    ];
    expect(practiceDaysThisWeek(sessions, NOW)).toBe(3);
  });

  it("a Sunday belongs to the week that started the Monday before", () => {
    const sunday = new Date(2026, 10, 8, 20);
    const sessions = [session(new Date(2026, 10, 2, 9)), session(sunday)];
    expect(practiceDaysThisWeek(sessions, sunday)).toBe(2);
  });

  it("the week starts Monday 00:00 and ends before the next Monday 00:00", () => {
    const sessions = [session(new Date(2026, 10, 2, 0, 0)), session(new Date(2026, 10, 9, 0, 0)), session(new Date(2026, 10, 1, 23, 59))];
    expect(practiceDaysThisWeek(sessions, NOW)).toBe(1);
  });

  it("only this child's rounds when a child is given", () => {
    const sessions = [session(today(8)), session(new Date(2026, 10, 3, 9), { childId: "C-021" })];
    expect(practiceDaysThisWeek(sessions, NOW, "C-014")).toBe(1);
  });
});

describe("freshPlays — the “ใหม่” mark on a new game's card", () => {
  it("stays until the child plays the new game once (any real or demo round), not for sample history or another child", () => {
    expect(freshPlays([])).toEqual(["tower", "kick"]);
    expect(freshPlays([session(today(8), { game: "kick", source: "sample" })])).toEqual(["tower", "kick"]);
    expect(freshPlays([session(today(8), { game: "kick", childId: "C-022" })], "C-014")).toEqual(["tower", "kick"]);
    expect(freshPlays([session(today(8), { game: "frog" })])).toEqual(["tower", "kick"]);
    expect(freshPlays([session(today(8), { game: "kick" })])).toEqual(["tower"]);
    expect(freshPlays([session(today(8), { game: "kick", source: "device" })], "C-014")).toEqual(["tower"]);
    expect(freshPlays([session(today(8), { game: "kick" }), session(today(9), { game: "tower" })])).toEqual([]);
  });
});
