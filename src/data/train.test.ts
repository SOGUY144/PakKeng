import { describe, expect, it } from "vitest";
import type { Attempt } from "../logic/common";
import { DEFAULT_PLAN, missionGame, planToDraft, validatePlan } from "./plan";
import { roundDid, roundRating, trainHeadline } from "./resultCards";
import { sessionAttempts, starsFor, totalAttempts } from "./rewards";
import { finishRound, roundId } from "./rounds";
import type { Child, DemoDB, Session, TrainSummary } from "./schema";
import { getDB, migrate } from "./store";
import { freshPlays } from "./todayPath";
import { BRANCH_END, CARGOS, cargoById, JUNCTION, stopSpot } from "./trainCargo";

const used = (n: number): Attempt[] => Array.from({ length: n }, () => ({ meanNasal: 22, passed: true, durationMs: 500 }));
const summary = (legs: number, coasted: number): TrainSummary => ({ legs, total: 4, coasted, cargo: "melon" });

/** A train round saved the way the screen saves it (one usable attempt per leg ridden by voice). */
function save(child: Child, startedAt: string, legs: number, coasted: number, source: "demo" | "device" = "demo", endedEarly = false): Session {
  return finishRound({
    child,
    game: "train",
    source,
    startedAt,
    practiceMs: 40_000,
    attempts: used(legs),
    stars: legs,
    train: summary(legs, coasted),
    choice: { kind: "cargo", id: "melon", label: "แตงโม" },
    endedEarly,
  });
}

describe("delivery train: saved rounds, rewards and the result", () => {
  it("a delivery saves its voiced legs as usable attempts and stars, under the round's own source", () => {
    const child = getDB().children[0];
    const s = save(child, "2026-11-11T05:20:00.000Z", 3, 1, "device");
    expect(s.id).toBe(roundId("train", "2026-11-11T05:20:00.000Z"));
    expect(s.game).toBe("train");
    expect(s.source).toBe("device");
    expect(s.usableAttempts).toBe(3);
    expect(sessionAttempts(s)).toBe(3);
    expect(s.stars).toBe(3);
    expect(s.train).toEqual(summary(3, 1));
    expect(roundDid(s)).toEqual({ kind: "train", label: "วิ่งด้วยเสียง", value: "3/4 ช่วง" });
    expect(roundRating(s)).toEqual({ got: 3, of: 4 });
  });

  it("saving the same delivery again (double tap, back, reopening the result) adds nothing; a new round has its own id", () => {
    const child = getDB().children[0];
    const t = "2026-11-11T05:30:00.000Z";
    const before = totalAttempts(getDB(), child.id, "demo");
    const stars0 = starsFor(getDB(), child, "demo");
    save(child, t, 2, 2);
    save(child, t, 2, 2);
    save(child, t, 2, 2, "demo", true);
    expect(getDB().sessions.filter((s) => s.id === roundId("train", t))).toHaveLength(1);
    expect(totalAttempts(getDB(), child.id, "demo") - before).toBe(2);
    expect(starsFor(getDB(), child, "demo") - stars0).toBe(2);
    const again = save(child, "2026-11-11T05:32:00.000Z", 4, 0);
    expect(again.id).not.toBe(roundId("train", t));
    expect(totalAttempts(getDB(), child.id, "demo") - before).toBe(6);
  });

  it("demo and device deliveries never feed each other's rewards", () => {
    const child = getDB().children[1];
    const demo0 = totalAttempts(getDB(), child.id, "demo");
    const dev0 = totalAttempts(getDB(), child.id, "device");
    save(child, "2026-11-11T06:20:00.000Z", 4, 0, "demo");
    expect(totalAttempts(getDB(), child.id, "demo") - demo0).toBe(4);
    expect(totalAttempts(getDB(), child.id, "device") - dev0).toBe(0);
    save(child, "2026-11-11T06:25:00.000Z", 1, 3, "device");
    expect(totalAttempts(getDB(), child.id, "device") - dev0).toBe(1);
    expect(totalAttempts(getDB(), child.id, "demo") - demo0).toBe(4);
  });

  it("coasting every leg still delivers, with no usable attempts, no stars and no reward — and no telling off", () => {
    const child = getDB().children[2];
    const before = totalAttempts(getDB(), child.id, "demo");
    const s = save(child, "2026-11-11T07:20:00.000Z", 0, 4);
    expect(s.usableAttempts).toBe(0);
    expect(s.stars).toBe(0);
    expect(totalAttempts(getDB(), child.id, "demo")).toBe(before);
    expect(roundRating(s)).toEqual({ got: 0, of: 0 });
    expect(roundDid(s).value).toBe("0/4 ช่วง");
    const h = trainHeadline(s, "แตงโม", "เต่า");
    expect(h.title).toBe("ส่งแตงโมถึงเต่าแล้ว");
    expect(`${h.title} ${h.sub}`).not.toMatch(/ครบ|4 ครั้ง|พูดได้|ผิด|พลาด|แพ้|เสีย/);
  });

  it("the headline counts only voiced legs: all four, some, or a delivery ended early", () => {
    const c = getDB().children[0];
    expect(trainHeadline(save(c, "2026-11-11T08:20:00.000Z", 4, 0), "แตงโม", "เต่า")).toEqual({ title: "ส่งแตงโมถึงเต่าแล้ว!", sub: "วิ่งด้วยเสียงครบ 4 ช่วง" });
    expect(trainHeadline(save(c, "2026-11-11T08:25:00.000Z", 2, 2), "แตงโม", "เต่า")).toEqual({ title: "ส่งแตงโมถึงเต่าแล้ว!", sub: "วิ่งด้วยเสียง 2 ช่วง" });
    expect(trainHeadline(save(c, "2026-11-11T08:30:00.000Z", 2, 0, "demo", true), "แตงโม", "เต่า")).toEqual({
      title: "รถไฟวิ่งได้ 2 ช่วง!",
      sub: "วิ่งด้วยเสียง 2 ช่วง · รอบหน้าไปส่งแตงโมให้เต่ากันนะ",
    });
    expect(trainHeadline(save(c, "2026-11-11T08:35:00.000Z", 0, 1, "demo", true), "แตงโม", "เต่า").title).toBe("จบรอบแล้ว");
  });

  it("the two cargos are the same trip: mirror-image branches, so neither delivery is longer", () => {
    expect(CARGOS.map((x) => x.branch).sort()).toEqual(["left", "right"]);
    expect(new Set(CARGOS.map((x) => x.receiver)).size).toBe(2);
    const len = (id: "melon" | "flowers") => [0, 1, 2, 3].reduce((n, i) => n + Math.hypot(stopSpot(id, i + 1).x - stopSpot(id, i).x, stopSpot(id, i + 1).z - stopSpot(id, i).z), 0);
    expect(len("melon")).toBeCloseTo(len("flowers"), 9);
    expect(BRANCH_END.left.x).toBe(-BRANCH_END.right.x);
    expect(stopSpot("melon", 3)).toEqual(JUNCTION);
    expect(cargoById("nope").id).toBe("melon");
  });
});

describe("delivery train in the plan", () => {
  it("is switched on in plans saved before it existed; a therapist's own choice stays", () => {
    const d = getDB();
    const old = { ...d.children[0].plan, games: { runner: true, balloon: true, frog: true, kick: true, tower: true } } as unknown as Child["plan"];
    const off = { ...d.children[1].plan, games: { runner: true, balloon: true, frog: true, kick: true, tower: true, train: false } };
    const after = migrate({ ...d, children: [{ ...d.children[0], plan: old }, { ...d.children[1], plan: off }] } as DemoDB);
    expect(after.children[0].plan.games.train).toBe(true);
    expect(after.children[1].plan.games.train).toBe(false);
    expect(after.sessions).toHaveLength(d.sessions.length);
  });

  it("a plan with only the train on is valid; the train is the last mission game; it is marked new until played", () => {
    const draft = planToDraft({ ...DEFAULT_PLAN, updatedAt: "" });
    const only = { runner: false, balloon: false, frog: false, kick: false, tower: false, train: true };
    expect(validatePlan({ ...draft, games: only }).ok).toBe(true);
    expect(missionGame({ ...DEFAULT_PLAN, updatedAt: "", games: only })).toBe("train");
    expect(freshPlays([])).toContain("train");
  });
});
