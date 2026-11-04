/**
 * ทางแยกของเกมวิ่ง — เด็กเลือกทางบนแผนที่ แต่ละทางมีจุดแวะและปลายทางของตัวเอง
 * ชื่อจุดแวะแสดงเป็นข้อความ HTML เท่านั้น (ในฉาก 3D เป็นธงสีของเส้นทาง ไม่วางตัวอักษรไทยบนวัตถุที่ขยับ)
 * สีธงเลี่ยงน้ำเงิน/ส้มซึ่งสงวนไว้สื่อค่าด้านปาก/ด้านจมูก
 */
export type RouteId = "flower" | "mushroom";

export interface Route {
  id: RouteId;
  /** Name on the map, e.g. "ทางดอกไม้". */
  name: string;
  /** Where the route ends. */
  destination: string;
  /** Stops before the destination, in order (a round uses as many as it has legs − 1). */
  stops: string[];
  /** Flag colour of this route (map, scene, side strip). */
  flag: string;
  flagDeep: string;
}

export const ROUTES: Route[] = [
  {
    id: "flower",
    name: "ทางดอกไม้",
    destination: "ชิงช้าสวรรค์",
    stops: ["ซุ้มกุหลาบ", "สะพานไม้", "บ่อบัว", "ทุ่งทานตะวัน", "รั้วดอกไม้", "ม้าหมุน", "ร้านไอติม"],
    flag: "#ff8fb4",
    flagDeep: "#e0638e",
  },
  {
    id: "mushroom",
    name: "ทางป่าเห็ด",
    destination: "บ้านเห็ด",
    stops: ["ตอไม้", "เห็ดแดง", "ก้อนหินใหญ่", "ลำธารเล็ก", "ต้นไม้ยักษ์", "โพรงกระรอก", "รังนก"],
    flag: "#b9a0f0",
    flagDeep: "#8f74d6",
  },
];

export function routeById(id: string | null | undefined): Route {
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

/** Names of the points a round of `legs` legs reaches, in order; the last one is the destination. */
export function routePoints(route: Route, legs: number): string[] {
  return [...route.stops.slice(0, Math.max(0, legs - 1)), route.destination];
}
