/**
 * “คันบังคับ” ของสัตว์เลี้ยง ไข่ ต้นไม้ และบัวรดน้ำ (แบบเดียวกับ drives.ts):
 * ฉาก (world) เขียนค่าเหล่านี้ทุกเฟรม แล้วโมเดลอ่านเองใน useFrame เดียว — ไม่มีการ render React ซ้ำระหว่างเล่น
 * ค่าแบบ “ตัวนับ” (cheer, hatch, wiggle, pour): เพิ่มทีละ 1 = เล่นท่านั้นหนึ่งครั้ง (ค่าที่มีก่อนโมเดลถูกสร้างจะไม่ถูกเล่นซ้ำ)
 */

export interface PetDrive {
  /** 0 = idle … ~1 = following the character: the hop-walk gets faster and bouncier with it (above ~1.6 is clamped). */
  speed: number;
  /** Increment to play one happy hop (with a spin unless reduced). A cheer that lands mid-hop plays right after it. */
  cheer: number;
  /** Lies down / sits with eyes closed and slow, deep breathing (ignores speed). A cheer still wakes it for one hop. */
  sleep: boolean;
  /** Reduced motion: the same moves at CALM size, one-shot hops slower, no spins. */
  reduced: boolean;
}

export function petDrive(p: Partial<PetDrive> = {}): PetDrive {
  return { speed: 0, cheer: 0, sleep: false, reduced: false, ...p };
}

export interface EggDrive {
  /** 0..1: how much the egg rocks in its nest (0 = still). */
  wobble: number;
  /**
   * Increment to play the hatch: a short shake, the top pops off and lands beside the nest, a few sparkles;
   * the shell then stays open. Already > 0 when the egg mounts = shown open without replay; set back to 0 = closed again.
   */
  hatch: number;
  reduced: boolean;
}

export function eggDrive(p: Partial<EggDrive> = {}): EggDrive {
  return { wobble: 0, hatch: 0, reduced: false, ...p };
}

export interface PlantDrive {
  /** Increment to play one happy wiggle (e.g. right after watering). */
  wiggle: number;
  /** Reduced motion: stage changes scale in without bounce, smaller bob and sway. */
  reduced: boolean;
}

export function plantDrive(p: Partial<PlantDrive> = {}): PlantDrive {
  return { wiggle: 0, reduced: false, ...p };
}

export interface WateringDrive {
  /** Increment = tilt the can and pour a few water drops in front of it (+Z), then set it back down. */
  pour: number;
  /** Reduced motion: the same pour, slower, fewer drops. */
  reduced: boolean;
}

export function wateringDrive(p: Partial<WateringDrive> = {}): WateringDrive {
  return { pour: 0, reduced: false, ...p };
}
