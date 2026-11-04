/**
 * จุดหมายของบอลลูน — เด็กเลือกก่อนเริ่มรอบ “พาบอลลูนไปส่ง”
 * แต่ละที่มีสิ่งก่อสร้างปลายทางที่มีหมุด และสีบอลลูนของตัวเอง โดยเลี่ยงน้ำเงินและส้มล้วน (สงวนไว้สื่อค่าด้านปาก/จมูก)
 * การเลือกเปลี่ยนเฉพาะภาพและชื่อที่เด็กเห็น ไม่เปลี่ยนคำ เกณฑ์ หรือเวลาในแผนของนักแก้ไขการพูด
 */
export type TripId = "treehouse" | "lighthouse" | "cloud-castle";

export interface Trip {
  id: TripId;
  /** Short Thai name the child sees (picker, scene tag, result screen). */
  name: string;
  /** Envelope gores around the balloon, repeating (3D model and 2D pictures). */
  balloon: readonly string[];
  /** The gift parcel each balloon carries in its basket. */
  gift: string;
  /** Text tone of this trip on white (contrast ≥ 4.5 : 1). */
  ink: string;
  /** Sky behind the scene: top, middle, horizon. */
  sky: readonly [string, string, string];
}

export const TRIPS: readonly Trip[] = [
  {
    id: "treehouse",
    name: "บ้านต้นไม้",
    balloon: ["#ee7aa0", "#ffd877"],
    gift: "#a8e3c8",
    ink: "#2f6b3a",
    sky: ["#fff1df", "#fff8ea", "#e6f1d2"],
  },
  {
    id: "lighthouse",
    name: "ประภาคาร",
    balloon: ["#4fa093", "#fffaf2"],
    gift: "#ffd877",
    ink: "#1f5f56",
    sky: ["#fff4e8", "#f5faf2", "#dcefe6"],
  },
  {
    id: "cloud-castle",
    name: "ปราสาทเมฆ",
    balloon: ["#b9a6f2", "#ffc9d8", "#fffaf2"],
    gift: "#ff9cbc",
    ink: "#5a45a8",
    sky: ["#efe8ff", "#fff3ec", "#f6efe0"],
  },
];

export function tripById(id: string | null | undefined): Trip | null {
  return TRIPS.find((t) => t.id === id) ?? null;
}
