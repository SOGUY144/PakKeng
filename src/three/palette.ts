/**
 * สีของโลก 3D (sRGB) — พาสเทลอุ่นแบบดินปั้น ใช้ชุดเดียวกันทุกเกม
 * น้ำเงิน (oral) และส้ม (nasal) สงวนไว้สำหรับสิ่งที่สื่อค่าด้านปาก/ด้านจมูกเท่านั้น
 * ตัวละครและฉากจึงไม่ใช้สองสีนี้ (สีตัวละครตรงกับภาพ 2D เดิมใน components/Art.tsx)
 */
export const C = {
  oral: "#2563eb",
  oralLight: "#6f9cf6",
  nasal: "#e8692a",
  nasalGlow: "#ffa060",

  ink: "#2b2433",
  white: "#ffffff",
  cream: "#fffaf2",
  creamShade: "#f3e9dc",

  grass: "#a3d47f",
  grassMid: "#8cc86c",
  grassDeep: "#74b358",
  path: "#f5e4c0",
  pathEdge: "#e6cf9f",
  pathLane: "#fbf1da",
  bark: "#a8774f",
  leaf: "#7cc46b",
  leafLight: "#a0da87",
  leafDeep: "#5fa955",
  hill: "#b9dd98",
  hillFar: "#cfe6b4",

  pink: "#ff9cbc",
  pinkSoft: "#ffc9d8",
  blush: "#f6b6d2",
  raspberry: "#ee7aa0",
  lilac: "#dcd0fb",
  lilacLight: "#eee8ff",
  lilacDeep: "#b9a6f2",
  butter: "#ffd877",
  gold: "#f5c542",
  mint: "#a8e3c8",
  teal: "#4fa093",
  tealDeep: "#3d8a7e",

  stone: "#ddd3e6",
  stoneDeep: "#c2b5d4",
  moss: "#8cc66f",
  wood: "#c48d5c",
  woodDeep: "#a26f45",
  wicker: "#d6b48c",
  wickerDeep: "#b8915f",

  frog: "#86d872",
  frogDeep: "#6cc25a",
  frogBelly: "#c4efb0",
  pad: "#72c25c",
  padDeep: "#5aa849",
  water: "#86cdb8",
  waterDeep: "#6bbca5",
  reed: "#93bf62",
  cattail: "#a87a55",
  lotus: "#ffb3c9",

  fog: "#f6efdf",
} as const;
