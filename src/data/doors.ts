/**
 * ประตูของด่าน “เปิดประตู” — เด็กเลือกบานเอง แต่ละบานมีสี ลาย (ตราบนสลัก) และสิ่งที่รออยู่ข้างหลังต่างกัน
 * สีบานเลี่ยงน้ำเงิน (ค่าด้านปาก) และส้ม (ค่าด้านจมูก) ที่สงวนไว้ให้ความหมายของสัญญาณ
 * ภาพ 2D (components/DoorArt.tsx) และฉาก 3D (three/models/Gate.tsx, three/worlds/GateWorld.tsx) ใช้สีชุดเดียวกันนี้
 * การเลือกบานเปลี่ยนแค่ภาพและปลายทาง — คำ เกณฑ์ และวิธีเปิด มาจากแผนของนักแก้ไขการพูดเหมือนกันทุกบาน
 */
export type DoorId = "flower" | "star" | "shell";

/** What waits behind a door, seen through the doorway once it opens. */
export interface DoorPlace {
  /** Short Thai name the child sees ("สวนดอกไม้"). */
  name: string;
  /** Sky from the top of the doorway down to the horizon, and the ground. */
  skyTop: string;
  skyLow: string;
  ground: string;
  /** Light that spills out of the doorway as it opens. */
  light: string;
}

export interface Door {
  id: DoorId;
  /** Full name, saved with the round and shown to adults ("ประตูดอกไม้"). */
  name: string;
  /** Name on the picker button ("ดอกไม้"). */
  short: string;
  /** Leaf planks (main / lighter), bands and bolt brackets (deep), and the arch fill above the doorway (soft). */
  leaf: string;
  leafLight: string;
  leafDeep: string;
  soft: string;
  /** The pattern on the lock and on each leaf (ลายกุญแจ) and its detail colour. */
  emblem: string;
  emblemDeep: string;
  behind: DoorPlace;
}

export const DOORS: Door[] = [
  {
    id: "flower",
    name: "ประตูดอกไม้",
    short: "ดอกไม้",
    leaf: "#ee8db0",
    leafLight: "#f6b2ca",
    leafDeep: "#c9638b",
    soft: "#fbd9e6",
    emblem: "#ffffff",
    emblemDeep: "#ffd877",
    behind: { name: "สวนดอกไม้", skyTop: "#fff6df", skyLow: "#ffe2ed", ground: "#b3de8d", light: "#fff2c9" },
  },
  {
    id: "star",
    name: "ประตูดาว",
    short: "ดาว",
    leaf: "#9a73d2",
    leafLight: "#b898e6",
    leafDeep: "#7552ae",
    soft: "#e4d8f6",
    emblem: "#ffd877",
    emblemDeep: "#e3ae2c",
    behind: { name: "ฟ้าเต็มดาว", skyTop: "#241740", skyLow: "#5d4795", ground: "#45386f", light: "#e9e0ff" },
  },
  {
    id: "shell",
    name: "ประตูเปลือกหอย",
    short: "เปลือกหอย",
    leaf: "#55b5a2",
    leafLight: "#86cfbf",
    leafDeep: "#3a8f7f",
    soft: "#d3efe7",
    emblem: "#ffd6df",
    emblemDeep: "#e897ab",
    behind: { name: "ชายหาด", skyTop: "#fff1d8", skyLow: "#e4f5ee", ground: "#f6e2b3", light: "#e9fbf4" },
  },
];

/** Beads around the lock: one lights up per 1/LOCK_BEADS of the door's progress (2D, 3D and the progress pill). */
export const LOCK_BEADS = 12;

/** Sea behind the shell door (sea green, kept apart from the oral blue). */
export const BEACH_SEA = "#7ccab7";

export function doorById(id: string | null | undefined): Door | undefined {
  return DOORS.find((d) => d.id === id);
}
