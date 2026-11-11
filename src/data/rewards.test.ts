import { describe, expect, it } from "vitest";
import {
  attemptsOnDay,
  bedView,
  dayKey,
  EGG_ATTEMPTS,
  EMPTY_LEDGER,
  eggView,
  ledgerOf,
  outfitOf,
  rewardsOf,
  sessionAttempts,
  speciesName,
  starsFor,
  totalAttempts,
  wearToggle,
  wearViews,
  withEgg,
  withHarvest,
  withHatched,
  withPlant,
  withStarter,
} from "./rewards";
import { roundId } from "./rounds";
import type { Child, DemoDB, RewardLedger, Session } from "./schema";
import { migrate } from "./store";

const child: Child = {
  id: "C-014",
  nickname: "น้องตัวอย่าง",
  plan: {
    words: ["ปา"],
    nasalWords: ["มา"],
    oralThreshold: 70,
    gateThreshold: 40,
    dailyMinutes: 10,
    balloonHoldSec: 3,
    level: 2,
    games: { runner: true, balloon: true, frog: true, kick: true, tower: true },
    gateEnabled: true,
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
  sampleStars: 10,
};
const other: Child = { ...child, id: "C-022", sampleStars: 0 };

let n = 0;
function round(over: Partial<Session>): Session {
  n += 1;
  return {
    id: `r${n}`,
    childId: child.id,
    source: "demo",
    startedAt: "2026-11-11T02:00:00.000Z",
    durationSec: 60,
    game: "kick",
    rounds: 1,
    words: [],
    level: 2,
    oralThreshold: 70,
    gateThreshold: 40,
    attempts: 0,
    passed: 0,
    meanNasalOral: null,
    gate: null,
    balloon: null,
    frog: null,
    call: null,
    stars: 0,
    endedEarly: false,
    ...over,
  };
}

function db(sessions: Session[], rewards?: DemoDB["rewards"]): DemoDB {
  return { version: 1, seededAt: "2026-11-01T00:00:00.000Z", activeChildId: child.id, children: [child, other], sessions, calibrations: {}, rewards };
}

describe("rewards grow only on detected usable speech attempts", () => {
  it("counts a round's usable attempts the same way for every game (explicit count, call words, runner + door)", () => {
    expect(sessionAttempts(round({ usableAttempts: 4 }))).toBe(4);
    const call = round({ game: "frog", attempts: 9, passed: 5, call: { heard: 3, target: 5, source: "demo", words: [
      { id: "crab", word: "ปู", resonance: "oral", listens: 1, attempts: 4, usable: 3, issues: { quiet: 1, loud: 0, lost: 0, channel: 0 }, meanNasal: 20, heard: true, skipped: false },
      { id: "dog", word: "หมา", resonance: "nasal", listens: 0, attempts: 2, usable: 2, issues: { quiet: 0, loud: 0, lost: 0, channel: 0 }, meanNasal: 55, heard: true, skipped: false },
    ] } });
    expect(sessionAttempts(call)).toBe(5);
    expect(sessionAttempts(round({ game: "runner", attempts: 4, gate: { attempts: 2, passed: 1, meanNasal: 44, opened: true, skipped: false } }))).toBe(6);
  });

  it("never counts the seeded sample history, another child, or the other signal source", () => {
    const d = db([
      round({ usableAttempts: 5 }),
      round({ usableAttempts: 7, source: "sample" }),
      round({ usableAttempts: 3, childId: other.id }),
      round({ usableAttempts: 2, source: "device" }),
    ]);
    expect(totalAttempts(d, child.id, "demo")).toBe(5);
    expect(totalAttempts(d, child.id, "device")).toBe(2);
    expect(totalAttempts(d, other.id, "demo")).toBe(3);
    expect(attemptsOnDay(d, child.id, "demo", dayKey(Date.parse("2026-11-11T02:00:00.000Z")))).toBe(5);
  });

  it("stars for classic collectibles: the sample stars stay with demo play; device practice counts device rounds only", () => {
    const d = db([round({ stars: 3 }), round({ stars: 4, source: "device" }), round({ stars: 9, source: "sample" })]);
    expect(starsFor(d, child, "demo")).toBe(13);
    expect(starsFor(d, child, "device")).toBe(4);
  });
});

describe("eggs and pets", () => {
  it("the starter pet is picked once, at once", () => {
    const l = withStarter(EMPTY_LEDGER, "puppy");
    expect(l.pets).toEqual(["puppy"]);
    expect(l.buddy).toBe("puppy");
    expect(withStarter(l, "kitten")).toBe(l);
    expect(withStarter(EMPTY_LEDGER, "dragon")).toBe(EMPTY_LEDGER);
  });

  it("an egg counts only attempts from rounds started after it was picked, and hatches its own pet at EGG_ATTEMPTS", () => {
    const l: RewardLedger = withEgg(EMPTY_LEDGER, "star", "2026-11-11T01:00:00.000Z");
    const before = round({ usableAttempts: 20, startedAt: "2026-11-11T00:30:00.000Z" });
    const half = db([before, round({ usableAttempts: 6 })]);
    const v = eggView(half, child.id, "demo", l);
    expect(v).toMatchObject({ kind: "star", pet: "dragon", tries: 6, ready: false, crack: 1 });
    const full = db([before, round({ usableAttempts: 6 }), round({ usableAttempts: 9 })]);
    expect(eggView(full, child.id, "demo", l)).toMatchObject({ tries: EGG_ATTEMPTS, ready: true, crack: 3 });
    // device practice never hatches a demo egg
    expect(eggView(full, child.id, "device", l)?.tries).toBe(0);
    const hatched = withHatched(l, "dragon");
    expect(hatched.egg).toBeNull();
    expect(hatched.pets).toEqual(["dragon"]);
    expect(withHatched(hatched, "dragon").pets).toEqual(["dragon"]);
  });

  it("an egg whose pet the child already has cannot be picked again", () => {
    const l = withHatched(EMPTY_LEDGER, "dragon");
    expect(withEgg(l, "star", "2026-11-11T01:00:00.000Z").egg).toBeNull();
    expect(withEgg(l, "sun", "2026-11-11T01:00:00.000Z").egg?.kind).toBe("sun");
  });
});

describe("garden", () => {
  const planted = "2026-11-11T01:00:00.000Z";
  const l = withPlant(EMPTY_LEDGER, 1, "sunflower", planted);

  it("grows with attempts after planting, reaches 'growing' at most on the planting day, ready from the next day", () => {
    const d = db([round({ usableAttempts: 20 })]);
    const sameDay = bedView(d, child.id, "demo", l, 1, Date.parse("2026-11-11T05:00:00.000Z"));
    expect(sameDay).toMatchObject({ kind: "sunflower", tries: 20, stage: 2, ready: false, waitTomorrow: true, toNext: null });
    const nextDay = bedView(d, child.id, "demo", l, 1, Date.parse("2026-11-12T05:00:00.000Z"));
    expect(nextDay).toMatchObject({ stage: 3, ready: true });
    // a week away never wilts or shrinks the plant
    expect(bedView(d, child.id, "demo", l, 1, Date.parse("2026-11-19T05:00:00.000Z")).stage).toBe(3);
  });

  it("tells how many attempts to the next stage", () => {
    const d = db([round({ usableAttempts: 4 })]);
    expect(bedView(d, child.id, "demo", l, 1, Date.parse("2026-11-11T05:00:00.000Z"))).toMatchObject({ stage: 1, toNext: 4 });
    expect(bedView(d, child.id, "demo", l, 0, Date.parse("2026-11-11T05:00:00.000Z"))).toMatchObject({ kind: null, stage: 0 });
  });

  it("a bed is planted once; picking frees it and adds to the harvest", () => {
    expect(withPlant(l, 1, "carrot", planted)).toBe(l);
    const picked = withHarvest(l, 1, "sunflower");
    expect(picked.beds[1]).toBeNull();
    expect(picked.harvest.sunflower).toBe(1);
  });
});

describe("clothes", () => {
  it("never picked: wears every unlocked classic collectible (as before)", () => {
    const d = db([]);
    expect(outfitOf(d, child, "demo")).toBe("cap");
  });

  it("new clothes unlock with attempts of the same source and say how many are left", () => {
    const d = db([round({ usableAttempts: 6 })]);
    const demo = wearViews(d, child, "demo").find((w) => w.id === "jersey");
    const device = wearViews(d, child, "device").find((w) => w.id === "jersey");
    expect(demo).toMatchObject({ unlocked: true, left: 0, unit: "ครั้ง" });
    expect(device).toMatchObject({ unlocked: false, left: 5 });
  });

  it("one item per slot; a picked but locked item is not worn", () => {
    expect(wearToggle(["cap", "jersey"], "dress")).toEqual(["cap", "dress"]);
    expect(wearToggle(["cap"], "hoodie")).toEqual(["hoodie"]);
    expect(wearToggle(["cap", "cape"], "cape")).toEqual(["cap"]);
    const d = db([round({ usableAttempts: 6 })], { [child.id]: { species: "dino", wear: ["jersey", "dress", "cape"], ledgers: {} } });
    expect(outfitOf(d, child, "demo")).toBe("jersey");
    expect(rewardsOf(d, child.id).species).toBe("dino");
    expect(ledgerOf(rewardsOf(d, child.id), "device")).toEqual(EMPTY_LEDGER);
  });
});

describe("saving and old data", () => {
  it("one round keeps one id however often it is saved", () => {
    expect(roundId("kick", "2026-11-11T02:00:00.000Z")).toBe(roundId("kick", "2026-11-11T02:00:00.000Z"));
    expect(roundId("kick", "2026-11-11T02:00:00.000Z")).not.toBe(roundId("frog", "2026-11-11T02:00:00.000Z"));
  });

  it("older saved data keeps its history: the new game is switched on and real-device call rounds are labelled device", () => {
    const old = db([round({ game: "frog", call: { words: [], heard: 1, target: 5, source: "device" } }), round({})]);
    const oldPlan = { ...child.plan, games: { runner: true, balloon: false, frog: true } } as unknown as Child["plan"];
    const before: DemoDB = { ...old, children: [{ ...child, plan: oldPlan }] };
    const after = migrate(before);
    expect(after.children[0].plan.games).toEqual({ kick: true, tower: true, runner: true, balloon: false, frog: true });
    expect(after.sessions.map((s) => s.source)).toEqual(["device", "demo"]);
    expect(after.sessions).toHaveLength(2);
  });
});

describe("the child's character by name", () => {
  it("lines about the character on screen use the chosen species (a dino is not called a rabbit)", () => {
    expect(speciesName("dino")).toBe("ไดโน");
    expect(speciesName("kitty")).toBe("แมวเหมียว");
    expect(speciesName("bunny")).toBe("กระต่าย");
    expect(speciesName("unknown" as never)).toBe("กระต่าย");
  });
});
