import { describe, expect, it } from "vitest";
import { fmtThaiDate, gameRows, reportKpis, reportTitle, trendSessions } from "./report";
import type { Session } from "./schema";

/** Smallest saved round the report reads; each test overrides what its game records. */
function session(over: Partial<Session>): Session {
  return {
    id: "s1",
    childId: "C-014",
    source: "demo",
    startedAt: "2026-11-12T17:43:00.000Z",
    durationSec: 75,
    game: "runner",
    rounds: 1,
    words: ["ปา", "ตา", "กา"],
    level: 3,
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

const FORBIDDEN = /ถูกต้อง|พูดถูก|ผิด|แพ้|วินิจฉัย|ความแม่นยำ|ปกติ|ผิดปกติ/;

describe("report cards — the four numbers on page 1", () => {
  it("a flight: tries include the nasal words on hail; the nasal-word mean comes from the hail; the pass rate from oral words", () => {
    const s = session({
      game: "plane",
      attempts: 4,
      passed: 3,
      meanNasalOral: 24,
      usableAttempts: 6,
      plane: { hits: 4, total: 5, drifted: 1, skipped: 0, level: "adventure", nasalAttempts: 2, nasalPassed: 1, nasalMean: 46 },
    });
    expect(reportKpis(s)).toEqual({ tries: 6, usable: 6, passRate: 75, oralNasal: 24, nasalNasal: 46 });
  });

  it("a call-a-friend round applies no oral criterion: no pass rate; the nasal mean comes from its nasal words", () => {
    const s = session({
      game: "frog",
      attempts: 3,
      passed: 3,
      call: {
        heard: 2,
        target: 2,
        source: "demo",
        words: [
          { id: "crab", word: "ปู", resonance: "oral", listens: 1, attempts: 1, usable: 1, issues: { quiet: 0, loud: 0, lost: 0, channel: 0 }, meanNasal: 20, heard: true, skipped: false },
          { id: "dog", word: "หมา", resonance: "nasal", listens: 1, attempts: 2, usable: 2, issues: { quiet: 0, loud: 0, lost: 0, channel: 0 }, meanNasal: 50, heard: true, skipped: false },
        ],
      },
    });
    const k = reportKpis(s);
    expect(k.passRate).toBeNull();
    expect(k.nasalNasal).toBe(50);
    expect(k.usable).toBe(3);
  });

  it("nothing said: no pass rate and no means (shown as —, never 0%)", () => {
    expect(reportKpis(session({}))).toEqual({ tries: 0, usable: 0, passRate: null, oralNasal: null, nasalNasal: null });
  });
});

describe("game section — what happened in the game, as recorded", () => {
  it("bakery: the level, friends fed and toppings (one per usable word)", () => {
    const rows = gameRows(session({ game: "bakery", stars: 4, bakery: { served: 4, customers: 5, toppings: 9, level: "word" }, choice: { kind: "mode", id: "word", label: "คำเดียว" } }));
    expect(rows).toContainEqual({ label: "เด็กเลือก", value: "คำเดียว" });
    expect(rows).toContainEqual({ label: "เพื่อนที่อิ่ม", value: "4/5 ตัว" });
    expect(rows).toContainEqual(expect.objectContaining({ label: "หน้าขนมที่ใส่", value: "9 ชิ้น" }));
    expect(rows).toContainEqual({ label: "ดาวที่ได้", value: "4 ดวง" });
  });

  it("plane: clouds passed, drifted and skipped kept apart, and the hail (nasal words) on its own row", () => {
    const rows = gameRows(
      session({ game: "plane", plane: { hits: 3, total: 5, drifted: 1, skipped: 1, level: "adventure", nasalAttempts: 2, nasalPassed: 1, nasalMean: 46 } }),
    );
    expect(rows).toContainEqual({ label: "แบบบิน", value: "บินผจญภัย (ใช้เป้าของครู)" });
    expect(rows.some((r) => r.label === "เด็กเลือก")).toBe(false);
    expect(rows).toContainEqual(expect.objectContaining({ label: "เมฆ/ลูกเห็บที่ผ่าน", value: "3/5 ก้อน" }));
    expect(rows).toContainEqual(expect.objectContaining({ label: "ลอยไปเองหลังลอง 3 ครั้ง", value: "1 ก้อน" }));
    expect(rows).toContainEqual(expect.objectContaining({ label: "ข้าม", value: "1 ก้อน" }));
    expect(rows).toContainEqual(expect.objectContaining({ label: "คำนาสิก (ลูกเห็บ)", value: "ลอง 2 ครั้ง · ถึงเกณฑ์ 1 ครั้ง · ออกจมูกเฉลี่ย 46%" }));
  });

  it("a round ended early says so; nothing in any game is called right, wrong or a diagnosis", () => {
    const sessions = [
      session({ game: "kick", endedEarly: true, kick: { goals: 2, shots: 5, team: "lion" }, choice: { kind: "team", id: "lion", label: "ทีมสิงโต" } }),
      session({ game: "tower", tower: { floors: 3, total: 5, skipped: 2, path: "star" } }),
      session({ game: "train", train: { legs: 4, total: 5, coasted: 1, cargo: "melon" } }),
      session({ game: "balloon", balloon: { completed: 2, target: 3, inZoneSec: 14, speakingSec: 20, holdSec: 5 } }),
      session({ game: "runner", gate: { attempts: 2, usable: 2, passed: 1, meanNasal: 44, opened: true, skipped: false } }),
      session({ game: "plane", plane: { hits: 5, total: 5, drifted: 0, skipped: 0, level: "easy", nasalAttempts: 0, nasalPassed: 0, nasalMean: null } }),
    ];
    expect(gameRows(sessions[0])).toContainEqual({ label: "จบก่อนครบรอบ", value: "ใช่ (กดจบรอบเอง)" });
    for (const s of sessions) for (const r of gameRows(s)) expect(`${r.label} ${r.value} ${r.note ?? ""}`).not.toMatch(FORBIDDEN);
  });
});

describe("trend — this round with the ones before it", () => {
  it("only this child's rounds up to this one, oldest first, at most n, this round last", () => {
    const at = (d: number, over: Partial<Session> = {}) => session({ id: `r${d}`, startedAt: `2026-11-${String(d).padStart(2, "0")}T08:00:00.000Z`, ...over });
    const all = [at(1), at(2), at(3, { childId: "C-022" }), at(4), at(5), at(6), at(7)];
    const t = trendSessions(all, all[4], 3);
    expect(t.map((s) => s.id)).toEqual(["r2", "r4", "r5"]);
  });
});

describe("file name and dates", () => {
  it("names the PDF by child code and the round's local date and time (no names)", () => {
    const s = session({ startedAt: new Date(2026, 10, 13, 0, 43).toISOString() });
    expect(reportTitle(s)).toBe("ปากเก่ง รายงานรอบฝึก C-014 2026-11-13 0043");
  });

  it("writes the Thai Buddhist-era date", () => {
    expect(fmtThaiDate(new Date(2026, 10, 13))).toBe("13 พ.ย. 2569");
  });
});
