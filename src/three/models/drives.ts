/**
 * “คันบังคับ” ของตัวละคร: ฉาก (world) เขียนค่าเหล่านี้ทุกเฟรมจากสถานะเกม แล้วโมเดลอ่านไปทำท่าทางเอง
 * ไม่มีการ render React ซ้ำระหว่างเล่น
 */
export type BunnyPose = "run" | "stand" | "sing" | "ride" | "wave";

export interface BunnyDrive {
  /** Decorative run speed (0 = standing). */
  speed: number;
  /** Live "passing" cue: leans in, ears swept back. */
  boost: boolean;
  /** Increment to play one short cheer (hop + arms up). */
  cheer: number;
  pose: BunnyPose;
  reduced: boolean;
}

export function bunnyDrive(p: Partial<BunnyDrive> = {}): BunnyDrive {
  return { speed: 0, boost: false, cheer: 0, pose: "stand", reduced: false, ...p };
}

export interface CloudDrive {
  /** 0..1: how close/eager the friendly chaser is (bobs a little faster, never scary). */
  excite: number;
  /** Increment to wave once. */
  wave: number;
  reduced: boolean;
}

export function cloudDrive(p: Partial<CloudDrive> = {}): CloudDrive {
  return { excite: 0, wave: 0, reduced: false, ...p };
}

/** Parse "cap,scarf" into flags. */
export function outfitFlags(outfit: string): { cap: boolean; shoes: boolean; scarf: boolean; crown: boolean } {
  const set = new Set(outfit.split(",").filter(Boolean));
  return { cap: set.has("cap"), shoes: set.has("shoes"), scarf: set.has("scarf"), crown: set.has("crown") };
}
