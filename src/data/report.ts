/**
 * รายงานรอบฝึกรายครั้ง (PDF จากหน้าประวัติของแดชบอร์ด) — ข้อมูลล้วน ไม่มี React
 * แสดงเฉพาะสิ่งที่รอบนั้นบันทึกไว้จริง: จำนวนช่วงเสียงที่ตรวจพบ ค่าเฉลี่ยเชิงพรรณนา และผลในเกม
 * ไม่มีคำว่าพูดถูก/ผิด หรือการวินิจฉัย (เครื่องไม่รู้จำคำ และค่ายังไม่ได้ตรวจสอบเทียบ Nasometer)
 */
import { callGroupNasal } from "./callWords";
import { fmtDayMonth, fmtPct } from "./format";
import { roundDid } from "./resultCards";
import { sessionAttempts } from "./rewards";
import type { Session } from "./schema";
import { teamById } from "./teams";
import { towerPathById } from "./towerPaths";
import { cargoById } from "./trainCargo";

export interface ReportRow {
  label: string;
  value: string;
  note?: string;
}

export interface ReportKpis {
  /** Detected speech attempts of the round (oral words, plus nasal words on the door / hail). */
  tries: number;
  /** Attempts with usable signal (what rewards grow on). */
  usable: number;
  /** Share of oral-word attempts that met the round's oral criterion; null when no criterion applies or nothing was said. */
  passRate: number | null;
  /** Mean nasal % on oral words. */
  oralNasal: number | null;
  /** Mean nasal % on nasal words (door, call-a-friend nasal words, hail). */
  nasalNasal: number | null;
}

export function reportKpis(s: Session): ReportKpis {
  const nasalTries = (s.gate?.attempts ?? 0) + (s.plane?.nasalAttempts ?? 0);
  const nasalNasal = s.call ? callGroupNasal(s.call, "nasal").mean : s.gate ? s.gate.meanNasal : s.plane && s.plane.nasalAttempts > 0 ? s.plane.nasalMean : null;
  return {
    tries: s.attempts + nasalTries,
    usable: sessionAttempts(s),
    passRate: s.call || s.attempts === 0 ? null : Math.round((s.passed / s.attempts) * 1000) / 10,
    oralNasal: s.meanNasalOral,
    nasalNasal,
  };
}

const count = (n: number, of: number, unit: string) => `${n}/${of} ${unit}`;

/** What happened in the game of this round, as the round recorded it (skips and early ends are said as they were). */
export function gameRows(s: Session): ReportRow[] {
  const rows: ReportRow[] = [];
  // the flight's mode has its own, fuller row below
  if (s.choice && !(s.game === "plane" && s.choice.kind === "mode")) rows.push({ label: "เด็กเลือก", value: s.choice.label });

  if (s.game === "plane" && s.plane) {
    const p = s.plane;
    rows.push({ label: "แบบบิน", value: p.level === "adventure" ? "บินผจญภัย (ใช้เป้าของครู)" : "บินสบาย (ไม่ตัดสินเสียง)" });
    rows.push({ label: "เมฆ/ลูกเห็บที่ผ่าน", value: count(p.hits, p.total, "ก้อน"), note: "ผ่านเมื่อตรวจพบการพูดที่สัญญาณใช้ได้ (บินผจญภัย: ถึงเป้าของครู)" });
    if (p.drifted > 0) rows.push({ label: "ลอยไปเองหลังลอง 3 ครั้ง", value: `${p.drifted} ก้อน`, note: "ต่ำกว่าเป้า 3 ครั้ง เมฆลอยไปเอง ไม่หักอะไร" });
    if (p.skipped > 0) rows.push({ label: "ข้าม", value: `${p.skipped} ก้อน` });
    if (p.nasalAttempts > 0)
      rows.push({
        label: "คำนาสิก (ลูกเห็บ)",
        value: `ลอง ${p.nasalAttempts} ครั้ง · ถึงเกณฑ์ ${p.nasalPassed} ครั้ง · ออกจมูกเฉลี่ย ${fmtPct(p.nasalMean)}`,
        note: "แยกจากค่าของคำด้านปาก",
      });
  } else if (s.game === "bakery" && s.bakery) {
    const b = s.bakery;
    if (!s.choice) rows.push({ label: "แบบ", value: b.level === "phrase" ? "พูดเป็นวลี" : "คำเดียว" });
    rows.push({ label: "เพื่อนที่อิ่ม", value: count(b.served, b.customers, "ตัว") });
    rows.push({ label: "หน้าขนมที่ใส่", value: `${b.toppings} ชิ้น`, note: "หนึ่งชิ้นต่อการพูดหนึ่งครั้งที่สัญญาณใช้ได้" });
  } else if (s.game === "kick" && s.kick) {
    rows.push({ label: "ยิงเข้าประตู", value: count(s.kick.goals, s.kick.shots, "ลูก") });
    if (!s.choice) rows.push({ label: "ทีมที่เลือก", value: teamById(s.kick.team).name });
  } else if (s.game === "tower" && s.tower) {
    const t = s.tower;
    rows.push({ label: "ชั้นที่กระโดดด้วยเสียง", value: count(t.floors, t.total, "ชั้น") });
    if (t.skipped > 0) rows.push({ label: "ขึ้นลิฟต์เมฆ (ข้าม)", value: `${t.skipped} ชั้น`, note: "ไม่นับเป็นการพูด" });
    if (!s.choice) rows.push({ label: "ทาง", value: towerPathById(t.path).name });
  } else if (s.game === "train" && s.train) {
    const t = s.train;
    rows.push({ label: "ช่วงที่วิ่งด้วยเสียง", value: count(t.legs, t.total, "ช่วง") });
    if (t.coasted > 0) rows.push({ label: "ไหลไปเอง (ข้าม)", value: `${t.coasted} ช่วง`, note: "ไม่นับเป็นการพูด" });
    if (!s.choice) rows.push({ label: "สินค้า", value: cargoById(t.cargo).name });
  } else if (s.game === "balloon" && s.balloon) {
    const b = s.balloon;
    rows.push({ label: "ส่งบอลลูนถึง", value: count(b.completed, b.target, "ลูก") });
    rows.push({ label: "เวลาในโซนเป้า", value: `${Math.round(b.inZoneSec)} วินาที`, note: `แผนตั้งไว้ ${b.holdSec} วินาทีต่อลูก` });
    rows.push({ label: "เวลาที่พูดค้าง", value: `${Math.round(b.speakingSec)} วินาที` });
  } else if (s.call) {
    rows.push({ label: "เพื่อนที่ได้ยิน", value: count(s.call.heard, s.call.target, "ตัว"), note: "ได้ยิน = ตรวจพบการพูดที่สัญญาณใช้ได้ ไม่ใช่การรู้จำคำ" });
  } else {
    const did = roundDid(s);
    rows.push({ label: did.label, value: did.value });
  }

  if (s.gate) {
    const g = s.gate;
    rows.push({
      label: "ด่านประตู (คำนาสิก)",
      value: g.skipped ? "ข้าม" : `ลอง ${g.attempts} ครั้ง · ถึงเกณฑ์ ${g.passed} ครั้ง · ออกจมูกเฉลี่ย ${fmtPct(g.meanNasal)}`,
      note: g.opened ? "ประตูเปิด" : undefined,
    });
  }
  rows.push({ label: "ดาวที่ได้", value: `${s.stars} ดวง` });
  if (s.endedEarly) rows.push({ label: "จบก่อนครบรอบ", value: "ใช่ (กดจบรอบเอง)" });
  return rows;
}

/** This child's rounds up to and including `s`, oldest first, at most `n` (this round last). */
export function trendSessions(all: Session[], s: Session, n = 8): Session[] {
  return all
    .filter((x) => x.childId === s.childId && x.startedAt <= s.startedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .slice(-n);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Document title = the saved PDF's file name: child code and the round's local date and time (never a name). */
export function reportTitle(s: Session): string {
  const d = new Date(s.startedAt);
  return `ปากเก่ง รายงานรอบฝึก ${s.childId} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** "13 พ.ย. 2569" (Buddhist era, as Thai clinic documents write it). */
export function fmtThaiDate(d: Date): string {
  return `${fmtDayMonth(d)} ${d.getFullYear() + 543}`;
}
