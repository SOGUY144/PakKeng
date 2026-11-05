import { describe, expect, it } from "vitest";
import { fmtClock } from "./format";
import { roundDid } from "./resultCards";
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
    expect(roundDid(s)).toEqual({ label: "เพื่อนที่ได้ยิน", value: "4/5 ตัว" });
  });

  it("balloon: balloons delivered, out of the trip", () => {
    const s = session({
      game: "balloon",
      balloon: { completed: 3, target: 3, inZoneSec: 9, speakingSec: 10, holdSec: 3 },
    });
    expect(roundDid(s)).toEqual({ label: "ส่งถึง", value: "3/3 ลูก" });
  });

  it("route run: legs run with a voice (skipped legs do not count)", () => {
    const s = session({ game: "runner", stars: 5, choice: { kind: "route", id: "flower", label: "ทางดอกไม้" } });
    expect(roundDid(s)).toEqual({ label: "วิ่งด้วยเสียง", value: "5/6 ช่วง" });
  });

  it("door: opened or not — never a percentage of 'correct' speech", () => {
    const gate = { attempts: 2, passed: 1, meanNasal: 48, opened: true, skipped: false };
    expect(roundDid(session({ gate }))).toEqual({ label: "ประตู", value: "เปิดแล้ว" });
    expect(roundDid(session({ gate: { ...gate, opened: false } }))).toEqual({ label: "ประตู", value: "ยังไม่เปิด" });
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
});
