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

/** What the character visibly wears once the slot rules of outfitFlags are applied. */
export interface OutfitFlags {
  cap: boolean;
  shoes: boolean;
  scarf: boolean;
  /** Sits on top of the head, the cap or the hood. */
  crown: boolean;
  /** Football shirt (sky blue, white trim, number 1). */
  jersey: boolean;
  /** Dino hood over the head; the hoodie's body shows only when it owns the torso (`top === "hoodie"`). */
  hoodie: boolean;
  /** Princess dress: bodice, skirt and bow. */
  dress: boolean;
  /** Hero cape on the back. */
  cape: boolean;
  /** The one garment drawn on the torso. */
  top: "jersey" | "hoodie" | "dress" | null;
}

/**
 * Parse "cap,scarf" into flags. Unknown ids are ignored. Items that want the same slot follow one fixed
 * priority (the later item in each list wins, whatever order the string has):
 *   head:  cap → hoodie            the hood covers the head, so the cap is put away
 *   torso: hoodie → jersey → dress  one shirt at a time; a hoodie that loses the torso keeps its hood
 * shoes, scarf, crown (on top of the cap or hood) and cape combine with everything.
 */
export function outfitFlags(outfit: string): OutfitFlags {
  const set = new Set(
    outfit
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const hoodie = set.has("hoodie");
  const top = set.has("dress") ? "dress" : set.has("jersey") ? "jersey" : hoodie ? "hoodie" : null;
  return {
    cap: set.has("cap") && !hoodie,
    shoes: set.has("shoes"),
    scarf: set.has("scarf"),
    crown: set.has("crown"),
    jersey: top === "jersey",
    hoodie,
    dress: top === "dress",
    cape: set.has("cape"),
    top,
  };
}
