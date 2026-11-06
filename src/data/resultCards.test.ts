import { describe, expect, it } from "vitest";
import { fmtClock } from "./format";
import { isDoorAlone, roundDid, roundRating } from "./resultCards";
import type { Session } from "./schema";

/** Smallest session the result cards read; each test overrides what its game records. */
function session(over: Partial<Session>): Session {
  return {
    id: "s1",
    childId: "C-014",
    source: "demo",
    startedAt: "2026-11-06T09:00:00.000Z",
    durationSec: 75,
    game: "runner",
    rounds: 1,
    words: [],
    level: 1,
    oralThreshold: 70,
    gateThreshold: 40,
    attempts: 0,
    passed: 0,
    meanNasalOral: null,
    gate: null,
    balloon: null,
    frog: null,
    call: null,
    choice: null,
    stars: 0,
    endedEarly: false,
    ...over,
  };
}

describe("roundDid — the 'what you did' card of the kid's result", () => {
  it("call-a-friend: friends that heard the child, out of the round", () => {
    const s = session({
      game: "frog",
      call: { words: [], heard: 4, target: 5, source: "demo" },
    });
    expect(roundDid(s)).toMatchObject({ label: "เพื่อนที่ได้ยิน", value: "4/5 ตัว" });
  });

  it("balloon: balloons delivered, out of the trip", () => {
    const s = session({
      game: "balloon",
      balloon: { completed: 3, target: 3, inZoneSec: 9, speakingSec: 10, holdSec: 3 },
    });
    expect(roundDid(s)).toMatchObject({ label: "ส่งถึง", value: "3/3 ลูก" });
  });

  it("route run: legs run with a voice (skipped legs do not count)", () => {
    const s = session({ game: "runner", stars: 5, choice: { kind: "route", id: "flower", label: "ทางดอกไม้" } });
    expect(roundDid(s)).toMatchObject({ label: "วิ่งด้วยเสียง", value: "5/6 ช่วง" });
  });

  it("door: opened or not — never a percentage of 'correct' speech", () => {
    const gate = { attempts: 2, passed: 1, meanNasal: 48, opened: true, skipped: false };
    expect(roundDid(session({ gate }))).toMatchObject({ label: "ประตู", value: "เปิดแล้ว" });
    expect(roundDid(session({ gate: { ...gate, opened: false } }))).toMatchObject({ label: "ประตู", value: "ยังไม่เปิด" });
  });

  it("a route that went on to the door shows the door (its stars include the door's)", () => {
    const s = session({
      game: "runner",
      stars: 7,
      choice: { kind: "door", id: "flower", label: "ประตูดอกไม้" },
      gate: { attempts: 1, passed: 1, meanNasal: 50, opened: true, skipped: false },
    });
    expect(roundDid(s).label).toBe("ประตู");
  });

  it("no value ever claims accuracy", () => {
    const all = [
      session({ game: "frog", call: { words: [], heard: 5, target: 5, source: "demo" } }),
      session({ game: "balloon", balloon: { completed: 3, target: 3, inZoneSec: 9, speakingSec: 9, holdSec: 3 } }),
      session({ game: "runner", stars: 6 }),
    ];
    for (const s of all) expect(roundDid(s).value).not.toMatch(/%|ถูก/);
  });
});

describe("roundDid — which game the card speaks for", () => {
  const skippedGate = { attempts: 0, passed: 0, meanNasal: null, opened: false, skipped: true };

  it("a run whose door was never tried (backed out of the door picker / skipped) shows the run, not a closed door", () => {
    const s = session({ game: "runner", attempts: 6, stars: 6, gate: skippedGate, choice: null });
    expect(roundDid(s)).toEqual({ kind: "runner", label: "วิ่งด้วยเสียง", value: "6/6 ช่วง" });
  });

  it("a run that went on to a door the child tried shows the door", () => {
    const tried = { attempts: 2, passed: 1, meanNasal: 45, opened: false, skipped: false };
    expect(roundDid(session({ game: "runner", attempts: 6, stars: 6, gate: tried }))).toEqual({ kind: "gate", label: "ประตู", value: "ยังไม่เปิด" });
    const opened = { ...tried, opened: true };
    expect(roundDid(session({ game: "runner", attempts: 6, stars: 7, gate: opened }))).toEqual({ kind: "gate", label: "ประตู", value: "เปิดแล้ว" });
  });

  it("a door played on its own always shows the door", () => {
    expect(roundDid(session({ game: "runner", attempts: 0, gate: skippedGate }))).toMatchObject({ kind: "gate" });
  });

  it("a run with every leg skipped, then backed out of the door picker, is still the run (not a door, no stars)", () => {
    const s = session({ game: "runner", attempts: 0, stars: 0, gate: skippedGate, choice: { kind: "route", id: "flower", label: "ทางดอกไม้ ไปชิงช้าสวรรค์" } });
    expect(roundDid(s)).toEqual({ kind: "runner", label: "วิ่งด้วยเสียง", value: "0/6 ช่วง" });
    expect(roundRating(s)).toEqual({ got: 0, of: 0 });
    expect(isDoorAlone(s)).toBe(false);
  });

  it("a door picked on its own but never tried (paused and ended) earns no stars", () => {
    const s = session({ game: "runner", attempts: 0, gate: skippedGate, choice: { kind: "door", id: "star", label: "ประตูดาว" } });
    expect(isDoorAlone(s)).toBe(true);
    expect(roundDid(s)).toMatchObject({ kind: "gate" });
    expect(roundRating(s)).toEqual({ got: 0, of: 0 });
  });

  it("the run's legs do not include the door's star", () => {
    const opened = { attempts: 1, passed: 1, meanNasal: 50, opened: true, skipped: false };
    // card shows the door here; the legs are what the run part of the rating uses
    expect(roundRating(session({ game: "runner", attempts: 6, stars: 7, gate: opened }))).toEqual({ got: 6, of: 6 });
  });

  it("every game gets its kind", () => {
    expect(roundDid(session({ game: "frog", call: { words: [], heard: 1, target: 5, source: "demo" } })).kind).toBe("frog");
    expect(roundDid(session({ game: "balloon", balloon: { completed: 1, target: 3, inZoneSec: 3, speakingSec: 3, holdSec: 3 } })).kind).toBe("balloon");
    expect(roundDid(session({ game: "runner", stars: 2, attempts: 2 })).kind).toBe("runner");
  });
});

describe("roundRating — the 0–3 stars on the kid's result never grade the child's speech", () => {
  it("call-a-friend: friends that heard / friends in the round", () => {
    expect(roundRating(session({ game: "frog", call: { words: [], heard: 4, target: 5, source: "demo" } }))).toEqual({ got: 4, of: 5 });
  });

  it("balloon: delivered / balloons in the trip", () => {
    expect(roundRating(session({ game: "balloon", balloon: { completed: 2, target: 3, inZoneSec: 6, speakingSec: 7, holdSec: 3 } }))).toEqual({ got: 2, of: 3 });
  });

  it("route run: legs run with a voice out of the route — not the oral criterion (that is the adult's)", () => {
    // 6 voiced legs, only 1 met the demo oral criterion: the child still ran all 6
    expect(roundRating(session({ game: "runner", attempts: 6, passed: 1, stars: 6 }))).toEqual({ got: 6, of: 6 });
    expect(roundRating(session({ game: "runner", attempts: 3, passed: 3, stars: 3, endedEarly: true }))).toEqual({ got: 3, of: 6 });
  });

  it("a route with no voiced leg (all skipped) earns no stars", () => {
    expect(roundRating(session({ game: "runner", attempts: 0, stars: 0 }))).toEqual({ got: 0, of: 0 });
  });

  it("a door on its own: opened or not", () => {
    const gate = { attempts: 2, passed: 1, meanNasal: 48, opened: true, skipped: false };
    expect(roundRating(session({ game: "runner", attempts: 0, gate }))).toEqual({ got: 1, of: 1 });
    expect(roundRating(session({ game: "runner", attempts: 0, gate: { ...gate, opened: false } }))).toEqual({ got: 0, of: 1 });
  });
});

describe("fmtClock — compact practice time for a small card", () => {
  it("formats minutes:seconds", () => {
    expect(fmtClock(58)).toBe("0:58");
    expect(fmtClock(75)).toBe("1:15");
    expect(fmtClock(600)).toBe("10:00");
  });

  it("rounds and never goes negative", () => {
    expect(fmtClock(59.6)).toBe("1:00");
    expect(fmtClock(-3)).toBe("0:00");
  });

  it("a missing or broken duration shows 0:00, never NaN", () => {
    expect(fmtClock(Number.NaN)).toBe("0:00");
    expect(fmtClock(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});
