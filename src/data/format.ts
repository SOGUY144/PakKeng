const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days between two dates (local time). */
export function dayDiff(later: Date, earlier: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayDiff(a, b) === 0;
}

export function fmtDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtRange(a: Date, b: Date): string {
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${fmtDayMonth(a)} – ${fmtDayMonth(b)}`;
}

export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} นาที` : `${m} นาที ${r} วินาที`;
}

/** Compact practice time for a small card: "0:58", "10:00". */
export function fmtClock(totalSec: number): string {
  const s = Number.isFinite(totalSec) ? Math.max(0, Math.round(totalSec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? "—" : `${Math.round(n)}%`;
}

export function fmtSec1(ms: number): string {
  return (Math.floor(ms / 100) / 10).toFixed(1);
}
