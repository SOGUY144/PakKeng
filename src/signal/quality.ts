import type { DeviceReading } from "./types";

/**
 * ตรวจคุณภาพสัญญาณต่อหนึ่งค่าที่อุปกรณ์ส่งมา — แยกจากการตรวจพบเสียงและจากเกม
 * ค่าเหล่านี้เป็นค่าตั้งต้นของต้นแบบ ต้องวัดใหม่กับแผ่นกั้นและไมค์ INMP441 คู่จริง (DECISIONS.md)
 */
export const QUALITY_DEFAULTS = {
  /** ช่องที่ระดับเท่านี้หรือต่ำกว่า = ไม่มีสัญญาณ (ไมค์หลุด / สาย I2S ขาด) — ไมค์ที่ทำงานมีเสียงรบกวนพื้นสูงกว่านี้ */
  deadDb: -96,
  /** ช่วงพูดที่ดังที่สุดยังไม่ถึงระดับนี้ = เบาเกินกว่าจะใช้ค่า */
  quietDb: -45,
  /** ระดับนี้ขึ้นไป (หรือ clip = true) = สัญญาณล้น */
  clipDb: -1,
};

export type ChannelState = "ok" | "nasal-missing" | "oral-missing" | "both-missing";

export interface FrameQuality {
  /** อุปกรณ์ส่งระดับเสียงทั้งสองช่องมา ถ้า false จะตรวจเสียงเบา/ล้น/ช่องหายไม่ได้ */
  known: boolean;
  /** ระดับของช่องที่ดังกว่า (dBFS) หรือ null เมื่อไม่ทราบ/เงียบสนิท */
  levelDb: number | null;
  /** ระดับรายช่อง (dBFS) สำหรับหน้าผู้ดูแล — null เมื่อไม่ทราบหรือเงียบสนิท */
  nasalDb: number | null;
  oralDb: number | null;
  clip: boolean;
  channels: ChannelState | "unknown";
}

export const UNKNOWN_QUALITY: FrameQuality = { known: false, levelDb: null, nasalDb: null, oralDb: null, clip: false, channels: "unknown" };

const finiteOrNull = (v: number) => (Number.isFinite(v) ? v : null);

export function frameQuality(r: DeviceReading, q = QUALITY_DEFAULTS): FrameQuality {
  if (r.nasalDb === undefined || r.oralDb === undefined) return UNKNOWN_QUALITY;
  const nasalDead = !(r.nasalDb > q.deadDb);
  const oralDead = !(r.oralDb > q.deadDb);
  const channels: ChannelState = nasalDead && oralDead ? "both-missing" : nasalDead ? "nasal-missing" : oralDead ? "oral-missing" : "ok";
  const level = Math.max(r.nasalDb, r.oralDb);
  return {
    known: true,
    levelDb: finiteOrNull(level),
    nasalDb: finiteOrNull(r.nasalDb),
    oralDb: finiteOrNull(r.oralDb),
    clip: r.clip === true || level >= q.clipDb,
    channels,
  };
}

/** ข้อความสำหรับผู้ใหญ่เมื่อช่องไมค์ไม่มีสัญญาณ */
export const CHANNEL_TEXT: Record<Exclude<ChannelState, "ok">, string> = {
  "nasal-missing": "ไมค์บน (ช่องจมูก) ไม่มีสัญญาณ",
  "oral-missing": "ไมค์ล่าง (ช่องปาก) ไม่มีสัญญาณ",
  "both-missing": "ไมค์ทั้งสองช่องไม่มีสัญญาณ",
};
