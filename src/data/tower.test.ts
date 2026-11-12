import { describe, expect, it } from "vitest";
import { validatePlan, planToDraft, DEFAULT_PLAN, missionGame } from "./plan";
import { roundDid, roundRating, towerHeadline } from "./resultCards";
import { sessionAttempts, starsFor, totalAttempts } from "./rewards";
import { finishRound, roundId } from "./rounds";
import type { Child, DemoDB, Session, TowerSummary } from "./schema";
import { getDB, migrate } from "./store";
import { freshPlays } from "./todayPath";
import { TOWER_PATHS, towerPathById } from "./towerPaths";
import type { Attempt } from "../logic/common";

const used = (n: number): Attempt[] => Array.from({ length: n }, () => ({ meanNasal: 22, passed: true, durationMs: 500 }));
const summary = (floors: number, skipped: number): TowerSummary => ({ floors, total: 5, skipped, path: "star" });

/** A cloud-tower round saved the way the screen saves it (one usable attempt per voiced floor). */
function save(child: Child, startedAt: string, floors: number, skipped: number, source: "demo" | "device" = "demo", endedEarly = false): Session {
  return finishRound({
    child,
    game: "tower",
    source,
    startedAt,
    practiceMs: 40_000,
    attempts: used(floors),
    stars: floors,
    tower: summary(floors, skipped),
    choice: { kind: "path", id: "star", label: "ทางดวงดาว" },
    endedEarly,
  });
}

describe("cloud tower: saved rounds, rewards and the result", () => {
  it("a climb saves its voiced floors as usable attempts and stars, under the round's own source", () => {
    const child = getDB().children[0];
    const s = save(child, "2026-11-11T05:00:00.000Z", 4, 1, "device");
    expect(s.id).toBe(roundId("tower", "2026-11-11T05:00:00.000Z"));
    expect(s.game).toBe("tower");
    expect(s.source).toBe("device");
    expect(s.usableAttempts).toBe(4);
    expect(sessionAttempts(s)).toBe(4);
    expect(s.stars).toBe(4);
    expect(s.tower).toEqual(summary(4, 1));
    expect(s.choice).toEqual({ kind: "path", id: "star", label: "ทางดวงดาว" });
    expect(roundDid(s)).toEqual({ kind: "tower", label: "กระโดดด้วยเสียง", value: "4/5 ชั้น" });
    expect(roundRating(s)).toEqual({ got: 4, of: 5 });
  });

  it("saving the same climb again (double tap, back, reopening the result) adds nothing; a new round has its own id", () => {
    const child = getDB().children[0];
    const t = "2026-11-11T05:10:00.000Z";
    const before = totalAttempts(getDB(), child.id, "demo");
    const stars0 = starsFor(getDB(), child, "demo");
    save(child, t, 3, 2);
    save(child, t, 3, 2);
    save(child, t, 3, 2, "demo", true);
    expect(getDB().sessions.filter((s) => s.id === roundId("tower", t))).toHaveLength(1);
    expect(totalAttempts(getDB(), child.id, "demo") - before).toBe(3);
    expect(starsFor(getDB(), child, "demo") - stars0).toBe(3);
    const again = save(child, "2026-11-11T05:12:00.000Z", 2, 3);
    expect(again.id).not.toBe(roundId("tower", t));
    expect(totalAttempts(getDB(), child.id, "demo") - before).toBe(5);
  });

  it("demo and device climbs never feed each other's rewards", () => {
    const child = getDB().children[1];
    const demo0 = totalAttempts(getDB(), child.id, "demo");
    const dev0 = totalAttempts(getDB(), child.id, "device");
    save(child, "2026-11-11T06:00:00.000Z", 5, 0, "demo");
    expect(totalAttempts(getDB(), child.id, "demo") - demo0).toBe(5);
    expect(totalAttempts(getDB(), child.id, "device") - dev0).toBe(0);
    save(child, "2026-11-11T06:05:00.000Z", 2, 3, "device");
    expect(totalAttempts(getDB(), child.id, "device") - dev0).toBe(2);
    expect(totalAttempts(getDB(), child.id, "demo") - demo0).toBe(5);
  });

  it("skipping every floor reaches the top with no usable attempts, no stars and no reward — and no telling off", () => {
    const child = getDB().children[2];
    const before = totalAttempts(getDB(), child.id, "demo");
    const s = save(child, "2026-11-11T07:00:00.000Z", 0, 5);
    expect(s.usableAttempts).toBe(0);
    expect(s.stars).toBe(0);
    expect(totalAttempts(getDB(), child.id, "demo")).toBe(before);
    expect(roundRating(s)).toEqual({ got: 0, of: 0 });
    expect(roundDid(s).value).toBe("0/5 ชั้น");
    const h = towerHeadline(s);
    expect(h.title).toBe("ถึงยอดหอคอยแล้ว");
    expect(`${h.title} ${h.sub}`).not.toMatch(/ครบ|5 ครั้ง|พูดได้|ผิด|พลาด|แพ้/);
  });

  it("the headline counts only voiced floors: all five, some, or a climb ended early", () => {
    const base = save(getDB().children[0], "2026-11-11T08:00:00.000Z", 5, 0);
    expect(towerHeadline(base)).toEqual({ title: "ถึงยอดหอคอยแล้ว!", sub: "กระโดดด้วยเสียงครบ 5 ชั้น · ทางดวงดาว" });
    const some = save(getDB().children[0], "2026-11-11T08:05:00.000Z", 3, 2);
    expect(towerHeadline(some)).toEqual({ title: "ถึงยอดหอคอยแล้ว!", sub: "กระโดดด้วยเสียง 3 ชั้น · ทางดวงดาว" });
    const early = save(getDB().children[0], "2026-11-11T08:10:00.000Z", 2, 0, "demo", true);
    expect(towerHeadline(early)).toEqual({ title: "ปีนได้ 2 ชั้น!", sub: "กระโดดด้วยเสียง 2 ชั้น · รอบหน้าไปให้ถึงยอดกันนะ" });
    const none = save(getDB().children[0], "2026-11-11T08:15:00.000Z", 0, 1, "demo", true);
    expect(towerHeadline(none).title).toBe("จบรอบแล้ว");
  });

  it("the two paths are the same climb: only the view and the keepsake differ", () => {
    expect(TOWER_PATHS.map((p) => p.side)).toEqual(["left", "right"]);
    expect(new Set(TOWER_PATHS.map((p) => p.keepsake)).size).toBe(2);
    expect(towerPathById("nope").id).toBe("rainbow");
  });
});

describe("cloud tower in the plan", () => {
  it("is switched on in plans saved before it existed; a therapist's own choice stays", () => {
    const d = getDB();
    const old = { ...d.children[0].plan, games: { runner: true, balloon: true, frog: false, kick: false } } as unknown as Child["plan"];
    const off = { ...d.children[1].plan, games: { runner: true, balloon: true, frog: true, kick: true, tower: false, train: true, plane: true, bakery: true } };
    const before: DemoDB = { ...d, children: [{ ...d.children[0], plan: old }, { ...d.children[1], plan: off }] };
    const after = migrate(before);
    expect(after.children[0].plan.games).toEqual({ runner: true, balloon: true, frog: false, kick: false, tower: true, train: true, plane: true, bakery: true });
    expect(after.children[1].plan.games.tower).toBe(false);
    expect(after.sessions).toHaveLength(d.sessions.length);
  });

  it("a plan with only the tower on is valid; all games off is not; the tower is the last mission game", () => {
    const draft = planToDraft({ ...DEFAULT_PLAN, updatedAt: "" });
    expect(validatePlan({ ...draft, games: { runner: false, balloon: false, frog: false, kick: false, tower: true, train: false, plane: false, bakery: false } }).ok).toBe(true);
    expect(validatePlan({ ...draft, games: { runner: false, balloon: false, frog: false, kick: false, tower: false, train: false, plane: false, bakery: false } }).ok).toBe(false);
    expect(missionGame({ ...DEFAULT_PLAN, updatedAt: "", games: { runner: false, balloon: false, frog: false, kick: false, tower: true, train: false, plane: false, bakery: false } })).toBe("tower");
  });

  it("is marked new on the activity cards until the child has played one round", () => {
    expect(freshPlays([])).toEqual(["plane", "bakery", "train", "tower", "kick"]);
  });
});
