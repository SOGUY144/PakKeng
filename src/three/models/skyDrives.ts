/** Shared bits of the bubble-pilot and bakery scenes (kept out of the component files). */

/** Where the pilot sits in the plane (the scene puts the character here, scaled ≈ 0.4). */
export const COCKPIT: [number, number, number] = [-0.05, 0.07, 0];
/** Tip of the plane's nose (bubbles grow here), in the plane's own units. */
export const NOSE_X = 1.12;

export interface MoodDrive {
  /** 0 = grumpy rain cloud, 1 = happy white cloud (the scene eases it). */
  mood: number;
  /** Increment for one happy bounce. */
  bounce: number;
  reduced: boolean;
}

export function moodDrive(p: Partial<MoodDrive> = {}): MoodDrive {
  return { mood: 0, bounce: 0, reduced: false, ...p };
}

/** Overshooting ease for pops (0 → 1 with a little bounce past 1). */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
