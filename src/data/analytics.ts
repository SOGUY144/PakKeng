import { DAY_MS, dayDiff, isSameDay, startOfDay } from "./format";
import { callGroupNasal } from "./callWords";
import type { Child, DemoDB, Plan, Session } from "./schema";

/** Nasal % on oral-target words and its weight; call rounds weigh only their usable oral-word attempts. */
function oralPair(s: Session): [number | null, number] {
  if (s.call) {
    const g = callGroupNasal(s.call, "oral");
    return [g.mean, g.usable];
  }
  return [s.meanNasalOral, s.attempts];
}

/** Nasal % on nasal words: the gate, or the nasal words of a call round. */
function nasalPair(s: Session): [number | null, number] {
  if (s.call) {
    const g = callGroupNasal(s.call, "nasal");
    return [g.mean, g.usable];
  }
  return [s.gate?.meanNasal ?? null, s.gate?.attempts ?? 0];
}

export interface WeekBucket {
  /** 1 = oldest, n = the 7 days ending today. */
  index: number;
  start: Date;
  end: Date;
  practiceDays: number;
  sessions: number;
  attempts: number;
  passed: number;
  /** Attempt-weighted mean nasal % while saying oral-target words. */
  nasalOral: number | null;
  /** Attempt-weighted mean nasal % on nasal words (gate). */
  nasalNasal: number | null;
}

function weightedMean(pairs: [number | null, number][]): number | null {
  let sum = 0;
  let w = 0;
  for (const [v, weight] of pairs) {
    if (v === null || weight <= 0) continue;
    sum += v * weight;
    w += weight;
  }
  return w > 0 ? sum / w : null;
}

export function childSessions(d: DemoDB, childId: string): Session[] {
  return d.sessions.filter((s) => s.childId === childId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function weeklyBuckets(sessions: Session[], now: Date, weeks = 8): WeekBucket[] {
  const today = startOfDay(now);
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < weeks; i++) {
    const endOffset = (weeks - 1 - i) * 7;
    const end = new Date(today.getTime() - endOffset * DAY_MS);
    const start = new Date(end.getTime() - 6 * DAY_MS);
    const inWeek = sessions.filter((s) => {
      const off = dayDiff(today, new Date(s.startedAt));
      return off >= endOffset && off <= endOffset + 6;
    });
    const days = new Set(inWeek.map((s) => startOfDay(new Date(s.startedAt)).getTime()));
    buckets.push({
      index: i + 1,
      start,
      end,
      practiceDays: days.size,
      sessions: inWeek.length,
      // Call rounds apply no oral criterion, so they stay out of the pass rate.
      attempts: inWeek.reduce((n, s) => n + (s.call ? 0 : s.attempts), 0),
      passed: inWeek.reduce((n, s) => n + (s.call ? 0 : s.passed), 0),
      nasalOral: weightedMean(inWeek.map(oralPair)),
      nasalNasal: weightedMean(inWeek.map(nasalPair)),
    });
  }
  return buckets;
}

/** กฎแจ้งเตือนของเดโม — ไม่ใช่การวินิจฉัย แสดงเกณฑ์และข้อมูลที่ใช้เสมอ */
export const REVIEW_RULES = {
  minDaysPerWeek: 2,
  oralWeeks: 4,
  oralMinDrop: 2,
  nasalWeeks: 3,
} as const;

export type RuleState = "flag" | "clear" | "insufficient";

export interface RuleResult {
  id: "oral-trend" | "nasal-words";
  title: string;
  rule: string;
  state: RuleState;
  detail: string;
  used: { week: number; value: number | null }[];
}

export interface ReviewStatus {
  overall: "review" | "insufficient" | "clear";
  rules: RuleResult[];
}

export function reviewStatus(weeks: WeekBucket[], plan: Plan): ReviewStatus {
  const R = REVIEW_RULES;
  const target = 100 - plan.oralThreshold;

  // Rule A — oral-target words should move toward the plan (nasal % down toward ≤ target).
  const lastA = weeks.slice(-R.oralWeeks);
  const usableA = lastA.filter((w) => w.practiceDays >= R.minDaysPerWeek && w.nasalOral !== null);
  const usedA = lastA.map((w) => ({ week: w.index, value: w.nasalOral }));
  const ruleA: RuleResult = {
    id: "oral-trend",
    title: "คำด้านปาก",
    rule: `ถ้าค่าออกจมูกเฉลี่ยสูงกว่าแผน (เกิน ${target}%) ทุกสัปดาห์ใน ${R.oralWeeks} สัปดาห์ล่าสุด และลดลงไม่ถึง ${R.oralMinDrop} จุด → ควรทบทวนแผน`,
    state: "clear",
    detail: "",
    used: usedA,
  };
  if (usableA.length < R.oralWeeks) {
    ruleA.state = "insufficient";
    ruleA.detail = `ข้อมูลยังไม่พอ: มีสัปดาห์ที่ฝึก ≥ ${R.minDaysPerWeek} วัน ${usableA.length} จาก ${R.oralWeeks} สัปดาห์`;
  } else {
    const values = usableA.map((w) => w.nasalOral as number);
    const allAbove = values.every((v) => v > target);
    const change = values[values.length - 1] - values[0];
    if (allAbove && change > -R.oralMinDrop) {
      ruleA.state = "flag";
      ruleA.detail = `สูงกว่าแผนทุกสัปดาห์ และเปลี่ยน ${change >= 0 ? "+" : ""}${change.toFixed(1)} จุดใน ${R.oralWeeks} สัปดาห์`;
    } else {
      ruleA.detail = allAbove
        ? `ยังสูงกว่าแผน แต่ลดลง ${Math.abs(change).toFixed(1)} จุดใน ${R.oralWeeks} สัปดาห์`
        : "มีสัปดาห์ที่อยู่ในแผนแล้ว";
    }
  }

  // Rule B — nasal words should still carry nasal resonance (guards against "suppress everything").
  const lastB = weeks.slice(-R.nasalWeeks);
  const usableB = lastB.filter((w) => w.nasalNasal !== null);
  const ruleB: RuleResult = {
    id: "nasal-words",
    title: "คำนาสิก (ด่านประตู)",
    rule: `ถ้าค่าออกจมูกขณะพูดคำนาสิกต่ำกว่าเกณฑ์ด่านประตู (${plan.gateThreshold}%) ทุกสัปดาห์ใน ${R.nasalWeeks} สัปดาห์ล่าสุด → ควรทบทวนแผน`,
    state: "clear",
    detail: "",
    used: lastB.map((w) => ({ week: w.index, value: w.nasalNasal })),
  };
  if (!plan.gateEnabled && usableB.length === 0) {
    ruleB.state = "insufficient";
    ruleB.detail = "ปิดด่านประตูอยู่ จึงไม่มีข้อมูลคำนาสิก";
  } else if (usableB.length < R.nasalWeeks) {
    ruleB.state = "insufficient";
    ruleB.detail = `ข้อมูลยังไม่พอ: มีข้อมูล ${usableB.length} จาก ${R.nasalWeeks} สัปดาห์`;
  } else if (usableB.every((w) => (w.nasalNasal as number) < plan.gateThreshold)) {
    ruleB.state = "flag";
    ruleB.detail = "ต่ำกว่าเกณฑ์ด่านประตูทุกสัปดาห์";
  } else {
    ruleB.detail = "มีสัปดาห์ที่ถึงเกณฑ์ด่านประตู";
  }

  const rules = [ruleA, ruleB];
  const overall = rules.some((r) => r.state === "flag")
    ? "review"
    : ruleA.state === "insufficient"
      ? "insufficient"
      : "clear";
  return { overall, rules };
}

// ---------- kid-side helpers ----------

export function practiceSecToday(d: DemoDB, childId: string, now: Date): number {
  return d.sessions
    .filter((s) => s.childId === childId && isSameDay(new Date(s.startedAt), now))
    .reduce((n, s) => n + s.durationSec, 0);
}

export function totalStars(d: DemoDB, child: Child): number {
  return child.sampleStars + d.sessions.filter((s) => s.childId === child.id && s.source !== "sample").reduce((n, s) => n + s.stars, 0);
}

export interface Collectible {
  id: "cap" | "shoes" | "scarf" | "crown";
  name: string;
  stars: number;
}

export const COLLECTIBLES: Collectible[] = [
  { id: "cap", name: "หมวก", stars: 0 },
  { id: "shoes", name: "รองเท้า", stars: 30 },
  { id: "scarf", name: "ผ้าพันคอ", stars: 60 },
  { id: "crown", name: "มงกุฎ", stars: 100 },
];

export function nextCollectible(stars: number): Collectible | null {
  return COLLECTIBLES.find((c) => c.stars > stars) ?? null;
}

/** Unlocked collectibles as a stable string (e.g. "cap,shoes") — what the 3D bunny wears. */
export function outfitFor(stars: number): string {
  return COLLECTIBLES.filter((c) => stars >= c.stars)
    .map((c) => c.id)
    .join(",");
}
