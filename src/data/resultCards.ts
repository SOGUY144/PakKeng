import { ROUTE_LEGS } from "../logic/route";
import type { Session } from "./schema";

/** Which game the round's result speaks for (a door round is the door's lilac, a run is the run's lemon). */
export type ResultKind = "frog" | "balloon" | "runner" | "gate" | "kick" | "tower" | "other";

/** One stat card on the kid's result: a short label for the coloured band and the value in the card. */
export interface ResultCard {
  kind: ResultKind;
  label: string;
  value: string;
}

/**
 * A door round played on its own (not after a run). A run whose legs were all skipped also has `attempts === 0`,
 * so the saved route choice tells them apart: a run keeps `choice.kind === "route"` even when the door was skipped.
 */
export function isDoorAlone(s: Session): boolean {
  return s.game === "runner" && s.attempts === 0 && s.gate !== null && s.choice?.kind !== "route";
}

/**
 * The door counts as part of this round only if the child was there: played on its own, opened, or tried.
 * Backing out of the door picker after a run (or skipping the door) saves a gate summary with no attempts —
 * that round is the run.
 */
function doorWasPlayed(s: Session): boolean {
  if (!s.gate) return false;
  return isDoorAlone(s) || s.gate.opened || s.gate.attempts > 0;
}

/** Route legs run with a voice (a run's stars, minus the door's star when the door opened). */
function voicedLegs(s: Session): number {
  return Math.max(0, s.stars - (s.gate?.opened ? 1 : 0));
}

/**
 * "What you did" this round, in the words of its game. It counts events the device can detect
 * (heard, delivered, run with a voice, door opened) — never a share of "correct" speech, which this prototype cannot know.
 */
export function roundDid(s: Session): ResultCard {
  if (s.call) return { kind: "frog", label: "เพื่อนที่ได้ยิน", value: `${s.call.heard}/${s.call.target} ตัว` };
  if (s.game === "balloon" && s.balloon) return { kind: "balloon", label: "ส่งถึง", value: `${s.balloon.completed}/${s.balloon.target} ลูก` };
  if (s.game === "kick" && s.kick) return { kind: "kick", label: "ยิงเข้าประตู", value: `${s.kick.goals}/${s.kick.shots} ลูก` };
  // floors jumped on a usable word (skipped floors rode the cloud lift and are not speech)
  if (s.game === "tower" && s.tower) return { kind: "tower", label: "กระโดดด้วยเสียง", value: `${s.tower.floors}/${s.tower.total} ชั้น` };
  if (doorWasPlayed(s)) return { kind: "gate", label: "ประตู", value: s.gate?.opened ? "เปิดแล้ว" : "ยังไม่เปิด" };
  if (s.game === "runner") return { kind: "runner", label: "วิ่งด้วยเสียง", value: `${voicedLegs(s)}/${ROUTE_LEGS} ช่วง` };
  return { kind: "other", label: "ครั้งที่ลองพูด", value: `${s.attempts} ครั้ง` };
}

/**
 * The 0–3 stars on the kid's result, as got / of (see roundStars). Each game rates what the child did in the scene;
 * the demo oral criterion (`passed`) stays with the adult and never grades the child here.
 */
export function roundRating(s: Session): { got: number; of: number } {
  if (s.call) return { got: s.call.heard, of: s.call.target };
  if (s.game === "balloon" && s.balloon) return { got: s.balloon.completed, of: s.balloon.target };
  // goals by voice out of the balls; a round with no voiced goal earns no stars (like a run with no voiced leg)
  if (s.game === "kick" && s.kick) return { got: s.kick.goals, of: s.kick.goals > 0 ? s.kick.shots : 0 };
  // floors jumped by voice out of the floors; a climb with no voiced jump earns no stars (and is not a failure)
  if (s.game === "tower" && s.tower) return { got: s.tower.floors, of: s.tower.floors > 0 ? s.tower.total : 0 };
  // a door on its own: opened or not — but a door that was never tried earns no stars, like a run with no voiced leg
  if (isDoorAlone(s) && s.gate) return { got: s.gate.opened ? 1 : 0, of: s.gate.opened || s.gate.attempts > 0 ? 1 : 0 };
  if (s.game === "runner") {
    const legs = voicedLegs(s);
    return { got: legs, of: legs > 0 ? ROUTE_LEGS : 0 };
  }
  return { got: s.passed, of: s.attempts };
}

/**
 * The kid's headline for a cloud-tower round. It names what happened in the scene — reaching the top (also when every
 * floor rode the skip lift) or how far the climb got — and counts only floors jumped on a usable word. It never says the
 * child spoke a number of times they did not, and a round with no voiced jump is not told off.
 */
export function towerHeadline(s: Session): { title: string; sub: string } {
  const t = s.tower;
  if (!t) return { title: "จบรอบแล้ว", sub: "" };
  const path = s.choice?.kind === "path" ? s.choice.label : "";
  const reached = t.floors + t.skipped;
  if (reached < t.total) {
    return t.floors > 0
      ? { title: `ปีนได้ ${reached} ชั้น!`, sub: `กระโดดด้วยเสียง ${t.floors} ชั้น · รอบหน้าไปให้ถึงยอดกันนะ` }
      : { title: "จบรอบแล้ว", sub: "รอบหน้ามาปีนหอคอยเมฆกันใหม่นะ" };
  }
  if (t.floors === 0) return { title: "ถึงยอดหอคอยแล้ว", sub: "ลิฟต์เมฆพาขึ้นมา · รอบหน้าลองพูดแล้วกระโดดเองนะ" };
  const how = t.floors === t.total ? `กระโดดด้วยเสียงครบ ${t.total} ชั้น` : `กระโดดด้วยเสียง ${t.floors} ชั้น`;
  return { title: "ถึงยอดหอคอยแล้ว!", sub: path ? `${how} · ${path}` : how };
}
