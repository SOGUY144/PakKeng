import { CALL_WORDS, DEFAULT_CALL_WORDS } from "./callWords";
import type { GameId, Level, Plan } from "./schema";

/** ค่าเริ่มต้นของเดโม (ไม่ใช่เกณฑ์มาตรฐานสำหรับเด็กทุกคน) — แก้ได้ที่แดชบอร์ด */
export const DEFAULT_PLAN: Omit<Plan, "updatedAt"> = {
  words: ["ปา", "ตา", "กา"],
  nasalWords: ["มา"],
  oralThreshold: 70,
  gateThreshold: 40,
  dailyMinutes: 10,
  balloonHoldSec: 3,
  level: 3,
  games: { runner: true, balloon: true, frog: true, kick: true },
  gateEnabled: true,
  callWords: [...DEFAULT_CALL_WORDS],
};

export const PLAN_LIMITS = {
  oralThreshold: { min: 50, max: 95 },
  gateThreshold: { min: 20, max: 80 },
  dailyMinutes: { min: 1, max: 60 },
  balloonHoldSec: { min: 1, max: 10 },
  words: { min: 1, max: 8, maxLength: 12 },
} as const;

export type PlanDraft = {
  words: string[];
  nasalWords: string[];
  oralThreshold: string;
  gateThreshold: string;
  dailyMinutes: string;
  balloonHoldSec: string;
  level: Level;
  games: Record<GameId, boolean>;
  gateEnabled: boolean;
  callWords: string[];
};

export type PlanErrors = Partial<Record<keyof PlanDraft, string>>;

export function planToDraft(p: Plan): PlanDraft {
  return {
    words: [...p.words],
    nasalWords: [...p.nasalWords],
    oralThreshold: String(p.oralThreshold),
    gateThreshold: String(p.gateThreshold),
    dailyMinutes: String(p.dailyMinutes),
    balloonHoldSec: String(p.balloonHoldSec),
    level: p.level,
    games: { ...p.games },
    gateEnabled: p.gateEnabled,
    callWords: [...(p.callWords ?? DEFAULT_CALL_WORDS)],
  };
}

function intIn(raw: string, min: number, max: number, unit: string): { value?: number; error?: string } {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return { error: `ใส่จำนวนเต็ม ${min}–${max} ${unit}` };
  const n = Number(t);
  if (n < min || n > max) return { error: `ต้องอยู่ระหว่าง ${min}–${max} ${unit}` };
  return { value: n };
}

export function cleanWord(w: string): string {
  return w.replace(/\s+/g, " ").trim();
}

export function wordError(word: string, existing: string[]): string | null {
  const w = cleanWord(word);
  if (!w) return "พิมพ์คำก่อนเพิ่ม";
  if (w.length > PLAN_LIMITS.words.maxLength) return `คำยาวได้ไม่เกิน ${PLAN_LIMITS.words.maxLength} ตัวอักษร`;
  if (/[0-9<>{}]/.test(w)) return "ใช้ได้เฉพาะตัวอักษร";
  if (existing.includes(w)) return "มีคำนี้แล้ว";
  return null;
}

export function validatePlan(d: PlanDraft): { ok: true; plan: Omit<Plan, "updatedAt"> } | { ok: false; errors: PlanErrors } {
  const errors: PlanErrors = {};
  const L = PLAN_LIMITS;
  const oral = intIn(d.oralThreshold, L.oralThreshold.min, L.oralThreshold.max, "%");
  const gate = intIn(d.gateThreshold, L.gateThreshold.min, L.gateThreshold.max, "%");
  const mins = intIn(d.dailyMinutes, L.dailyMinutes.min, L.dailyMinutes.max, "นาที");
  const hold = intIn(d.balloonHoldSec, L.balloonHoldSec.min, L.balloonHoldSec.max, "วินาที");
  if (oral.error) errors.oralThreshold = oral.error;
  if (gate.error) errors.gateThreshold = gate.error;
  if (mins.error) errors.dailyMinutes = mins.error;
  if (hold.error) errors.balloonHoldSec = hold.error;

  const words = d.words.map(cleanWord).filter(Boolean);
  if (words.length < L.words.min) errors.words = "ต้องมีอย่างน้อย 1 คำ";
  if (words.length > L.words.max) errors.words = `ได้สูงสุด ${L.words.max} คำ`;
  const nasalWords = d.nasalWords.map(cleanWord).filter(Boolean);
  if (d.gateEnabled && nasalWords.length < 1) errors.nasalWords = "เปิดด่านประตูอยู่ ต้องมีคำนาสิกอย่างน้อย 1 คำ";

  if (!d.games.runner && !d.games.balloon && !d.games.frog && !d.games.kick) errors.games = "เปิดอย่างน้อย 1 เกม";
  if (![1, 2, 3].includes(d.level)) errors.level = "เลือกด่าน";
  const callWords = CALL_WORDS.map((w) => w.id).filter((id) => d.callWords.includes(id));
  if (d.games.frog && callWords.length < 1) errors.callWords = "เปิดกบข้ามบึงอยู่ ต้องเลือกคำเรียกเพื่อนอย่างน้อย 1 คำ";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      words,
      nasalWords,
      oralThreshold: oral.value!,
      gateThreshold: gate.value!,
      dailyMinutes: mins.value!,
      balloonHoldSec: hold.value!,
      level: d.level,
      games: { ...d.games },
      gateEnabled: d.gateEnabled,
      callWords,
    },
  };
}

/** The game that "เริ่มเล่น" opens: the mission's first enabled game. */
export function missionGame(p: Plan): GameId | null {
  if (p.games.runner) return "runner";
  if (p.games.balloon) return "balloon";
  if (p.games.frog) return "frog";
  if (p.games.kick) return "kick";
  return null;
}

/** Prompt text for oral-target words. Level 1 shows a prolonged form for words ending in "า". */
export function promptFor(word: string, level: Level): string {
  if (level === 1 && word.endsWith("า")) return `${word}าา`;
  if (level === 3) return `${word} ${word} ${word}`;
  return word;
}

export function promptInstruction(game: GameId, level: Level): string {
  if (game === "frog") return "ฟังคำ แล้วเรียกเพื่อน";
  if (game === "kick") return "พูดคำนี้ แล้วเตะลูกเข้าประตู";
  if (game === "balloon") return "พูดลากเสียงค้างไว้ ให้บอลลูนอยู่ในโซน";
  if (level === 1) return "พูดคำนี้ ลากเสียงให้ยาว";
  if (level === 2) return "พูดคำนี้ หนึ่งครั้ง";
  return "พูดคำนี้ต่อกัน 3 ครั้ง";
}
