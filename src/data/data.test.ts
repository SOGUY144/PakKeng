import { describe, expect, it } from "vitest";
import { childSessions, reviewStatus, weeklyBuckets } from "./analytics";
import { DEFAULT_PLAN, planToDraft, validatePlan } from "./plan";
import { createSeed } from "./seed";
import type { Plan } from "./schema";

const NOW = new Date(2026, 10, 4, 9, 0, 0);

describe("seed data", () => {
  it("is deterministic for the same day (no new random numbers per render/refresh)", () => {
    const a = createSeed(NOW);
    const b = createSeed(NOW);
    expect(JSON.stringify(a.sessions)).toBe(JSON.stringify(b.sessions));
  });

  it("never seeds sessions for today, so today's progress is only real demo play", () => {
    const d = createSeed(NOW);
    const today = d.sessions.filter((s) => new Date(s.startedAt).toDateString() === NOW.toDateString());
    expect(today).toHaveLength(0);
  });

  it("uses child codes only", () => {
    const d = createSeed(NOW);
    for (const c of d.children) {
      expect(c.id).toMatch(/^C-\d{3}$/);
      expect(c.nickname).toBe("[ชื่อเล่น]");
    }
  });
});

describe("demo review rules", () => {
  const d = createSeed(NOW);
  const statusOf = (id: string, plan?: Plan) => {
    const child = d.children.find((c) => c.id === id)!;
    return reviewStatus(weeklyBuckets(childSessions(d, id), NOW), plan ?? child.plan);
  };

  it("flags C-021 (flat for 4 weeks above plan)", () => {
    expect(statusOf("C-021").overall).toBe("review");
  });

  it("reports 'not enough data' for C-009 instead of guessing", () => {
    const s = statusOf("C-009");
    expect(s.overall).toBe("insufficient");
    expect(s.rules[0].state).toBe("insufficient");
  });

  it("does not flag C-014 whose trend moves with the plan", () => {
    expect(statusOf("C-014").overall).toBe("clear");
  });

  it("follows the plan of the selected child (a looser oral target clears rule A)", () => {
    const c021 = d.children.find((c) => c.id === "C-021")!;
    const s = statusOf("C-021", { ...c021.plan, oralThreshold: 60 });
    expect(s.rules[0].state).toBe("clear");
  });
});

describe("plan validation", () => {
  const base = planToDraft({ ...DEFAULT_PLAN, updatedAt: NOW.toISOString() });

  it("accepts the demo defaults", () => {
    expect(validatePlan(base).ok).toBe(true);
  });

  it.each([
    ["oralThreshold", "-5"],
    ["oralThreshold", "101"],
    ["oralThreshold", "7.5"],
    ["gateThreshold", "abc"],
    ["gateThreshold", "100"],
    ["dailyMinutes", "0"],
    ["balloonHoldSec", "-1"],
  ] as const)("rejects %s = %s", (field, value) => {
    const r = validatePlan({ ...base, [field]: value });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[field]).toBeTruthy();
  });

  it("requires at least one word and one game", () => {
    expect(validatePlan({ ...base, words: [] }).ok).toBe(false);
    expect(validatePlan({ ...base, games: { runner: false, balloon: false, frog: false, kick: false, tower: false } }).ok).toBe(false);
  });

  it("requires a nasal word while the gate is enabled", () => {
    expect(validatePlan({ ...base, nasalWords: [] }).ok).toBe(false);
    expect(validatePlan({ ...base, nasalWords: [], gateEnabled: false }).ok).toBe(true);
  });
});
