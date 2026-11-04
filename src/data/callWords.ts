/**
 * ชุดคำ “เรียกเพื่อน” — ชื่อสัตว์ที่มีภาพในเกม แยกตามบริบทเสียง
 * oral = ไม่มีพยัญชนะนาสิก, nasal = มีพยัญชนะนาสิก (คาดว่ามีเสียงผ่านจมูกตามธรรมชาติ)
 * เป็นชุดตั้งต้นของต้นแบบ — นักแก้ไขการพูดควรเลือกคำและจุดประสงค์เป็นรายคน (references/evidence-th.md: Prathanee 2003)
 */
import type { CallSummary } from "./schema";

export type FriendId = "crab" | "dog" | "fish" | "bird" | "turtle";
export type Resonance = "oral" | "nasal";

export interface CallWord {
  id: FriendId;
  word: string;
  resonance: Resonance;
  /** เสียงเป้าหมายที่ผู้ใหญ่ฟัง */
  sound: string;
}

export const CALL_WORDS: CallWord[] = [
  { id: "crab", word: "ปู", resonance: "oral", sound: "ป ต้นคำ" },
  { id: "dog", word: "หมา", resonance: "nasal", sound: "ม ต้นคำ" },
  { id: "fish", word: "ปลา", resonance: "oral", sound: "ปล ต้นคำ" },
  { id: "bird", word: "นก", resonance: "nasal", sound: "น ต้นคำ" },
  { id: "turtle", word: "เต่า", resonance: "oral", sound: "ต ต้นคำ" },
];

export const DEFAULT_CALL_WORDS: FriendId[] = CALL_WORDS.map((w) => w.id);

export const RESONANCE_LABEL: Record<Resonance, string> = {
  oral: "คำปาก",
  nasal: "คำมีเสียงนาสิก",
};

/** The plan's chosen words in a fixed order; unknown ids are ignored, an empty choice falls back to the default set. */
export function callWordsFor(ids: readonly string[] | undefined): CallWord[] {
  const chosen = CALL_WORDS.filter((w) => (ids ?? DEFAULT_CALL_WORDS).includes(w.id));
  return chosen.length > 0 ? chosen : CALL_WORDS;
}

/**
 * The round order after the child picks who to visit first: the chosen friend, then the rest in plan order.
 * Everything else (3D model, example word, results) follows this list by id, so a different order never mixes words up.
 */
export function orderFrom(words: CallWord[], first: FriendId | null): CallWord[] {
  const chosen = words.find((w) => w.id === first);
  return chosen ? [chosen, ...words.filter((w) => w !== chosen)] : words;
}

/** Mean nasal % over usable attempts of one word type in a saved call round (attempt-weighted). */
export function callGroupNasal(c: CallSummary, resonance: Resonance): { mean: number | null; usable: number } {
  const g = c.words.filter((w) => w.resonance === resonance && w.meanNasal !== null && w.usable > 0);
  const usable = g.reduce((n, w) => n + w.usable, 0);
  const sum = g.reduce((n, w) => n + (w.meanNasal as number) * w.usable, 0);
  return { mean: usable > 0 ? sum / usable : null, usable };
}
