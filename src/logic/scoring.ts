/**
 * ดาวสรุปรอบ: สะท้อนสัดส่วนครั้งที่ผ่าน “เกณฑ์เดโม” — ไม่ใช่ความถูกต้องของการออกเสียง
 * จบรอบที่มีการพูดอย่างน้อย 1 ครั้งได้อย่างน้อย 1 ดาวเสมอ (ให้รางวัลความพยายาม)
 */
export function roundStars(passed: number, total: number): 0 | 1 | 2 | 3 {
  if (total <= 0) return 0;
  const ratio = passed / total;
  if (ratio >= 0.85) return 3;
  if (ratio >= 0.5) return 2;
  return 1;
}

/** Next rating band, used for the gentle "อีกนิดเดียว" line on the result screen. */
export function nextStarHint(passed: number, total: number): string | null {
  const s = roundStars(passed, total);
  if (s === 0 || s === 3) return null;
  return s === 1 ? "รอบหน้าลองให้ผ่านครึ่งหนึ่ง จะได้ดาวดวงที่ 2" : "อีกนิดเดียวก็ได้ดาวดวงที่ 3";
}
