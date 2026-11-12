import { describe, expect, it } from "vitest";
import { MOCK_DEFAULTS, mockReading, type VoiceLevel } from "../signal/MockSignalSource";
import { SignalProcessor } from "../signal/SignalProcessor";
import type { DeviceReading } from "../signal/types";
import { BakeryShop, bakeryItems, DROP_MS, EAT_MS, ORDER_SIZE, type BakeryEvent } from "./bakery";

interface Phase {
  ms: number;
  speech: boolean;
  nasal?: number;
  level?: VoiceLevel;
}

function run(game: BakeryShop, phases: Phase[], start = 0) {
  const proc = new SignalProcessor();
  const dt = 1000 / 60;
  let t = start;
  const events: BakeryEvent[] = [];
  for (const p of phases) {
    const end = t + p.ms;
    while (t < end - 1e-9) {
      t += dt;
      const r = mockReading({ ...MOCK_DEFAULTS, ...(p.level ? { level: p.level } : {}) }, 100 - (p.nasal ?? 20), p.speech);
      const sample: DeviceReading & { t: number } = { ...r, t };
      events.push(...game.update(proc.step(sample, "connected", t), t, dt));
    }
  }
  return { events, t };
}

const say = (nasal?: number, ms = 500): Phase => ({ ms, speech: true, nasal });
const hush = (ms = 400): Phase => ({ ms, speech: false });
const word = (nasal?: number): Phase[] => [hush(), say(nasal), hush(250), hush(DROP_MS + 100)];

describe("Animal bakery (ร้านขนมของเพื่อนสัตว์): one usable word = one topping, a full order = a happy customer", () => {
  it("builds the word list: customers × order size, cycling the plan's words; phrase level adds the carrier word", () => {
    const w = bakeryItems(["ปา", "ตา"], "word", 2);
    expect(w).toHaveLength(2 * ORDER_SIZE.word);
    expect(w.map((x) => x.word)).toEqual(["ปา", "ตา", "ปา", "ตา"]);
    expect(bakeryItems(["ปา"], "phrase", 1).map((x) => x.word)).toEqual(["ใส่ ปา", "ใส่ ปา", "ใส่ ปา"]);
    expect(bakeryItems([], "word", 1).map((x) => x.word)).toEqual(["ปา", "ปา"]);
  });

  it("one usable word drops one topping on the cake (the game does not listen while it falls)", () => {
    const g = new BakeryShop(bakeryItems(["ปา", "ตา"], "word", 5), "word", 70);
    const a = run(g, [hush(), say(), hush(250)]);
    expect(a.events).toContainEqual({ type: "drop", customer: 0, topping: 0 });
    expect(g.phase).toBe("drop");
    const b = run(g, [say(20, DROP_MS - 300)], a.t);
    expect(b.events.filter((e) => e.type === "drop")).toHaveLength(0);
    run(g, [hush(500)], b.t);
    expect(g.phase).toBe("order");
    expect(g.placed).toBe(1);
    expect(g.attempts).toHaveLength(1);
  });

  it("a full order: the customer eats, the round counts a served customer, and the next one comes in", () => {
    const g = new BakeryShop(bakeryItems(["ปา", "ตา"], "word", 5), "word", 70);
    let t = 0;
    let events: BakeryEvent[] = [];
    for (let i = 0; i < ORDER_SIZE.word; i++) {
      const r = run(g, word(), t);
      t = r.t;
      events = events.concat(r.events);
    }
    expect(events).toContainEqual({ type: "eat", customer: 0 });
    expect(g.phase).toBe("eat");
    const b = run(g, [hush(EAT_MS + 100)], t);
    expect(b.events).toContainEqual({ type: "served", customer: 0 });
    expect(b.events).toContainEqual({ type: "ready", customer: 1 });
    expect(g.results[0]).toBe("served");
    expect(g.stars).toBe(1);
    expect(g.placed).toBe(0);
  });

  it("every customer is served on usable words whatever the nose/mouth value (the criterion is kept for the adult only)", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 1), "word", 70);
    let t = 0;
    for (let i = 0; i < ORDER_SIZE.word; i++) t = run(g, word(60), t).t;
    run(g, [hush(EAT_MS + 100)], t);
    expect(g.results[0]).toBe("served");
    expect(g.attempts.every((a) => a.passed === false)).toBe(true);
  });

  it("phrase level: three toppings per order", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "phrase", 2), "phrase", 70);
    expect(g.orderSize).toBe(3);
    let t = 0;
    for (let i = 0; i < 2; i++) t = run(g, word(), t).t;
    expect(g.phase).toBe("order");
    t = run(g, word(), t).t;
    expect(g.phase).toBe("eat");
  });

  it("a signal the game cannot use asks for another try: no topping, nothing counted", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 5), "word", 70);
    const a = run(g, [hush(), { ms: 500, speech: true, level: "loud" }, hush(300)]);
    expect(a.events.some((e) => e.type === "retry")).toBe(true);
    expect(a.events.some((e) => e.type === "drop")).toBe(false);
    expect(g.placed).toBe(0);
    expect(g.attempts).toHaveLength(0);
  });

  it("the child picks each topping; the cake keeps the picks in order", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 5), "word", 70);
    g.choose("cherry");
    let t = run(g, word(), 0).t;
    g.choose("sprinkles");
    t = run(g, word(), t).t;
    expect(g.cake).toEqual(["cherry", "sprinkles"]);
    run(g, [hush(EAT_MS + 100)], t);
    expect(g.cake).toEqual([]);
  });

  it("skip a customer: they leave with a wave (no star); skipping the last one ends the round", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 2), "word", 70);
    run(g, word(), 0);
    expect(g.placed).toBe(1);
    expect(g.skip()).toContainEqual({ type: "ready", customer: 1 });
    expect(g.results[0]).toBe("skip");
    expect(g.placed).toBe(0);
    expect(g.skip()).toContainEqual({ type: "finish" });
    expect(g.done).toBe(true);
    expect(g.stars).toBe(0);
    expect(g.attempts).toHaveLength(1);
  });

  it("ending while the last topping of an order is still falling keeps that customer served", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 5), "word", 70);
    const a = run(g, word());
    run(g, [hush(), say(), hush(250)], a.t);
    expect(g.phase).toBe("drop");
    g.finish();
    expect(g.results[0]).toBe("served");
    expect(g.stars).toBe(1);
  });

  it("ending while an earlier topping falls does not serve the customer", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 5), "word", 70);
    run(g, [hush(), say(), hush(250)]);
    expect(g.phase).toBe("drop");
    g.finish();
    expect(g.results[0]).toBeNull();
    expect(g.stars).toBe(0);
  });

  it("ending while a customer eats keeps that customer served", () => {
    const g = new BakeryShop(bakeryItems(["ปา"], "word", 5), "word", 70);
    let t = 0;
    for (let i = 0; i < ORDER_SIZE.word; i++) t = run(g, word(), t).t;
    expect(g.phase).toBe("eat");
    g.finish();
    expect(g.results[0]).toBe("served");
    expect(g.stars).toBe(1);
  });
});
