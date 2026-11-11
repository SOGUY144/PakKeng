import type { FriendId } from "./callWords";

/**
 * ทีมที่เด็กเลือกยิงจุดโทษด้วย (เกมยิงจุดโทษ) — ผู้รักษาประตูเป็นเพื่อนสัตว์ตัวเดิมในเกม สีทีมใช้กับประตู ธง และกองเชียร์
 * เป็นทางเลือกเชิงภาพเท่านั้น: ทุกทีมเล่นเหมือนกัน คำที่สัญญาณใช้ได้เข้าประตูทุกลูก
 */
export type TeamId = "turtle" | "crab" | "dog" | "bird";

export interface Team {
  id: TeamId;
  /** Short Thai name the child sees, e.g. "ทีมเต่า". */
  name: string;
  goalie: FriendId;
  /** Team colour (jerseys, flags, scarves) and a deeper shade for trim. */
  color: string;
  deep: string;
}

export const TEAMS: Team[] = [
  { id: "turtle", name: "ทีมเต่า", goalie: "turtle", color: "#8fd3a0", deep: "#3f9a5c" },
  { id: "crab", name: "ทีมปู", goalie: "crab", color: "#ffad9e", deep: "#d9604c" },
  { id: "dog", name: "ทีมหมา", goalie: "dog", color: "#f2cf9b", deep: "#b07a42" },
  { id: "bird", name: "ทีมนก", goalie: "bird", color: "#ffe28a", deep: "#c99a00" },
];

export function teamById(id: string): Team {
  return TEAMS.find((t) => t.id === id) ?? TEAMS[0];
}
