import { describe, expect, it } from "vitest";
import type { Attempt } from "../logic/common";
import { finishRound } from "./rounds";
import { getDB } from "./store";

const tries = (means: number[], passed = true): Attempt[] => means.map((m) => ({ meanNasal: m, passed, durationMs: 500 }));

describe("saving a bubble-pilot flight and an animal-bakery round", () => {
  it("a flight counts nasal words (hail) as usable attempts but keeps them out of the oral-word numbers", () => {
    const child = getDB().children[0];
    const s = finishRound({
      child,
      game: "plane",
      source: "demo",
      startedAt: "2026-11-12T08:00:00.000Z",
      practiceMs: 30_000,
      attempts: tries([20, 30, 25]),
      stars: 4,
      plane: { hits: 4, total: 5, drifted: 1, skipped: 0, level: "adventure", nasalAttempts: 2, nasalPassed: 1, nasalMean: 50 },
      choice: { kind: "mode", id: "adventure", label: "บินผจญภัย" },
      endedEarly: false,
    });
    expect(s.game).toBe("plane");
    expect(s.attempts).toBe(3);
    expect(s.meanNasalOral).toBe(25);
    expect(s.usableAttempts).toBe(5);
    expect(s.plane?.nasalMean).toBe(50);
    expect(s.choice).toEqual({ kind: "mode", id: "adventure", label: "บินผจญภัย" });
  });

  it("a bakery round saves one usable attempt per topping and its served friends", () => {
    const child = getDB().children[0];
    const s = finishRound({
      child,
      game: "bakery",
      source: "demo",
      startedAt: "2026-11-12T08:10:00.000Z",
      practiceMs: 30_000,
      attempts: tries([20, 22, 24, 26]),
      stars: 2,
      bakery: { served: 2, customers: 5, toppings: 4, level: "word" },
      choice: { kind: "mode", id: "word", label: "คำเดียว" },
      endedEarly: true,
    });
    expect(s.game).toBe("bakery");
    expect(s.attempts).toBe(4);
    expect(s.usableAttempts).toBe(4);
    expect(s.bakery).toEqual({ served: 2, customers: 5, toppings: 4, level: "word" });
    expect(s.endedEarly).toBe(true);
  });
});
