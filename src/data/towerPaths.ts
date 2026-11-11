/**
 * หอคอยเมฆ: two cloud paths up the same tower — the left side and the right side. They differ only in what the child
 * sees on the way (the sky and the keepsake that lights up on each floor), never in floors, words, timing or rewards,
 * so neither side is a better deal.
 */
export type TowerPathId = "rainbow" | "star";

export interface TowerPath {
  id: TowerPathId;
  /** Which side of the tower the clouds climb (what the picker shows). */
  side: "left" | "right";
  /** Short Thai name the child sees. */
  name: string;
  /** What lights up on each floor the avatar lands on. */
  keepsake: string;
  /** What waits on the top cloud. */
  top: string;
}

export const TOWER_PATHS: TowerPath[] = [
  { id: "rainbow", side: "left", name: "ทางสายรุ้ง", keepsake: "ธงสายรุ้ง", top: "สายรุ้งบนยอดเมฆ" },
  { id: "star", side: "right", name: "ทางดวงดาว", keepsake: "โคมดาว", top: "พระจันทร์ยิ้ม" },
];

export function towerPathById(id: string): TowerPath {
  return TOWER_PATHS.find((p) => p.id === id) ?? TOWER_PATHS[0];
}

/** Height of one floor (world units of the 3D scene; the 2D side stack scales the same layout). */
export const TOWER_RISE = 1.5;
/** Sideways zig-zag of the clouds, floor 0 (the ground cloud) … 5 (the top), for the left-hand path. */
const ZIG = [0, -1.05, 1.0, -1.0, 0.95, 0];

/**
 * Where the cloud of `floor` sits (x across, y up). The right-hand path is the mirror image of the left-hand one, so
 * both climbs are exactly as long and as high — only the side and the view differ.
 */
export function floorSpot(path: TowerPathId, floor: number): { x: number; y: number } {
  const side = path === "star" ? -1 : 1;
  const i = Math.max(0, Math.min(ZIG.length - 1, floor));
  return { x: ZIG[i] * side, y: i * TOWER_RISE };
}
