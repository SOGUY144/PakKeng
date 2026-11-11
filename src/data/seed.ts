import { DAY_MS, startOfDay } from "./format";
import { DEFAULT_PLAN } from "./plan";
import type { Child, DemoDB, GameId, Plan, Session } from "./schema";

/**
 * ข้อมูลตัวอย่าง (ไม่ใช่ข้อมูลจริง) — สร้างแบบ deterministic และ seed เพียงครั้งเดียวต่อ localStorage
 * แต่ละโปรไฟล์ออกแบบให้เห็นสถานะของกฎแจ้งเตือนต่างกัน:
 *  C-014 แนวโน้มเปลี่ยนตามแผน, C-021 ไม่ลดลง 4 สัปดาห์ (ควรทบทวน), C-009 ข้อมูลยังไม่พอ
 */
interface Profile {
  id: string;
  seed: number;
  sampleStars: number;
  practiceChance: number;
  /** Weekly mean nasal % on oral-target words, oldest → newest (null = no practice that week). */
  weeklyNasalOral: (number | null)[];
  /** Mean nasal % on nasal words (gate). */
  nasalWordMean: number;
  plan: Partial<Omit<Plan, "updatedAt">>;
}

const PROFILES: Profile[] = [
  {
    id: "C-014",
    seed: 14,
    sampleStars: 48,
    practiceChance: 0.74,
    weeklyNasalOral: [38, 36, 33.5, 31, 29, 27, 25, 22.5],
    nasalWordMean: 42,
    plan: {},
  },
  {
    id: "C-021",
    seed: 21,
    sampleStars: 31,
    practiceChance: 0.66,
    weeklyNasalOral: [34, 33, 32.5, 31.5, 31.2, 31.6, 30.9, 31.3],
    nasalWordMean: 41,
    plan: { words: ["ตา", "ทา", "กา"], level: 2, games: { runner: true, balloon: true, frog: false, kick: true, tower: true, train: true } },
  },
  {
    id: "C-009",
    seed: 9,
    sampleStars: 9,
    practiceChance: 0.7,
    weeklyNasalOral: [null, null, null, null, null, null, 35, 33],
    nasalWordMean: 40,
    plan: { words: ["ปา", "ปู", "ปี"], level: 1, balloonHoldSec: 2 },
  },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));
const r1 = (n: number) => Math.round(n * 10) / 10;

function pickGame(rng: () => number, games: Record<GameId, boolean>): GameId {
  const weights: [GameId, number][] = [
    ["runner", 0.6],
    ["balloon", 0.25],
    ["frog", 0.15],
  ];
  const enabled = weights.filter(([g]) => games[g]);
  const total = enabled.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [g, w] of enabled) {
    x -= w;
    if (x <= 0) return g;
  }
  return enabled[enabled.length - 1][0];
}

function sessionsFor(p: Profile, plan: Plan, today: Date): Session[] {
  const rng = mulberry32(p.seed);
  const out: Session[] = [];
  const day0 = startOfDay(today).getTime();
  const weeks = p.weeklyNasalOral.length;
  // dayOffset 1..55 → never "today", so today's progress only reflects real demo play.
  for (let offset = weeks * 7 - 1; offset >= 1; offset--) {
    const week = weeks - 1 - Math.floor(offset / 7);
    const weekMean = p.weeklyNasalOral[week];
    const practiced = rng() < p.practiceChance;
    const sessionCount = rng() < 0.3 ? 2 : 1;
    if (weekMean === null || !practiced) continue;
    for (let k = 0; k < sessionCount; k++) {
      const game = pickGame(rng, plan.games);
      const start = new Date(day0 - offset * DAY_MS + (16 + k * 2) * 3_600_000 + Math.floor(rng() * 50) * 60_000);
      const rounds = game === "runner" ? 3 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2);
      const perRound = game === "runner" ? 6 : game === "frog" ? 10 : 5;
      const attempts = rounds * perRound + Math.floor(rng() * 4);
      const meanNasalOral = r1(weekMean + (rng() - 0.5) * 3);
      const passRatio = logistic((100 - meanNasalOral - plan.oralThreshold) / 5);
      const passed = Math.round(attempts * passRatio);
      const durationSec = rounds * (game === "runner" ? 100 : 85) + Math.floor(rng() * 60);

      let gate: Session["gate"] = null;
      if (game === "runner" && plan.gateEnabled) {
        const gAttempts = rounds * (1 + Math.floor(rng() * 2));
        const gMean = r1(p.nasalWordMean + (rng() - 0.5) * 4);
        const gPassed = Math.round(gAttempts * logistic((gMean - plan.gateThreshold) / 3));
        gate = { attempts: gAttempts, passed: gPassed, meanNasal: gMean, opened: gPassed > 0, skipped: false };
      }
      const balloonTarget = rounds * 3;
      const balloonDone = Math.round(balloonTarget * passRatio);
      out.push({
        id: `s-${p.id}-${offset}-${k}`,
        childId: p.id,
        source: "sample",
        startedAt: start.toISOString(),
        durationSec,
        game,
        rounds,
        words: plan.words,
        level: plan.level,
        oralThreshold: plan.oralThreshold,
        gateThreshold: plan.gateThreshold,
        attempts,
        passed,
        meanNasalOral,
        gate,
        balloon:
          game === "balloon"
            ? {
                completed: balloonDone,
                target: balloonTarget,
                inZoneSec: r1(balloonDone * plan.balloonHoldSec + rng() * 3),
                speakingSec: r1(durationSec * 0.45),
                holdSec: plan.balloonHoldSec,
              }
            : null,
        frog: game === "frog" ? { steps: passed, target: rounds * 8 } : null,
        stars: passed,
        endedEarly: false,
      });
    }
  }
  return out;
}

export function createSeed(today: Date): DemoDB {
  const iso = today.toISOString();
  const children: Child[] = PROFILES.map((p) => ({
    id: p.id,
    nickname: "[ชื่อเล่น]",
    sampleStars: p.sampleStars,
    plan: { ...DEFAULT_PLAN, ...p.plan, games: { ...DEFAULT_PLAN.games, ...p.plan.games }, updatedAt: iso },
  }));
  const sessions = PROFILES.flatMap((p, i) => sessionsFor(p, children[i].plan, today));
  return { version: 1, seededAt: iso, activeChildId: "C-014", children, sessions, calibrations: {} };
}
