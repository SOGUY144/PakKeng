import { ROUTE_LEGS } from "../logic/route";
import type { Session } from "./schema";

/** Which game the round's result speaks for (a door round is the door's lilac, a run is the run's lemon). */
export type ResultKind = "frog" | "balloon" | "runner" | "gate" | "other";

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
  if (doorWasPlayed(s)) return { kind: "gate", label: "ประตู", value: s.gate?.opened ? "เปิดแล้ว" : "ยังไม่เปิด" };
  if (s.game === "runner") return { kind: "runner", label: "วิ่งด้วยเสียง", value: `${voicedLegs(s)}/${ROUTE_LEGS} ช่วง` };
  return { kind: "other", label: "ครั้งที่พูด", value: `${s.attempts} ครั้ง` };
}

/**
 * The 0–3 stars on the kid's result, as got / of (see roundStars). Each game rates what the child did in the scene;
 * the demo oral criterion (`passed`) stays with the adult and never grades the child here.
 */
export function roundRating(s: Session): { got: number; of: number } {
  if (s.call) return { got: s.call.heard, of: s.call.target };
  if (s.game === "balloon" && s.balloon) return { got: s.balloon.completed, of: s.balloon.target };
  // a door on its own: opened or not — but a door that was never tried earns no stars, like a run with no voiced leg
  if (isDoorAlone(s) && s.gate) return { got: s.gate.opened ? 1 : 0, of: s.gate.opened || s.gate.attempts > 0 ? 1 : 0 };
  if (s.game === "runner") {
    const legs = voicedLegs(s);
    return { got: legs, of: legs > 0 ? ROUTE_LEGS : 0 };
  }
  return { got: s.passed, of: s.attempts };
}
