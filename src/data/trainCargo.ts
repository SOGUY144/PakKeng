import type { FriendId } from "./callWords";

/**
 * รถไฟส่งของ: the child picks one cargo before the round; each cargo has its own receiver waiting at a station at the end
 * of one branch of the track. Both deliveries are exactly as long (the branches are mirror images) — they differ only in
 * what is carried, who receives it and where, never in legs, words, timing or rewards.
 */
export type CargoId = "melon" | "flowers";

export interface Cargo {
  id: CargoId;
  /** Short Thai name of the cargo. */
  name: string;
  /** The friend who receives it (one of the friend models) and its Thai name. */
  receiver: FriendId;
  receiverName: string;
  /** Where the receiver waits. */
  station: string;
  /** Which way the track switch sends the train after the third stop. */
  branch: "left" | "right";
}

export const CARGOS: Cargo[] = [
  { id: "melon", name: "แตงโม", receiver: "turtle", receiverName: "เต่า", station: "ชายหาด", branch: "left" },
  { id: "flowers", name: "ดอกไม้", receiver: "bird", receiverName: "นก", station: "ต้นไม้ใหญ่", branch: "right" },
];

export function cargoById(id: string): Cargo {
  return CARGOS.find((c) => c.id === id) ?? CARGOS[0];
}

/** The depot, the three stops on the main line (the third one is the junction with the track switch). */
const MAIN = [
  { x: 0, z: 0 },
  { x: -1.5, z: -3.6 },
  { x: 1.3, z: -7.2 },
  { x: 0, z: -10.6 },
];
/** The two stations at the ends of the branches (mirror images). */
export const BRANCH_END = { left: { x: -2.5, z: -14 }, right: { x: 2.5, z: -14 } } as const;
export const JUNCTION = MAIN[3];

/**
 * Where stop `stop` is (x across, z away from the 3D camera; the 2D track uses the same layout): 0 = the depot … 3 = the
 * junction, 4 = the receiver's station at the end of this cargo's branch.
 */
export function stopSpot(cargo: CargoId, stop: number): { x: number; z: number } {
  if (stop <= 0) return MAIN[0];
  if (stop < MAIN.length) return MAIN[stop];
  return BRANCH_END[cargoById(cargo).branch];
}
