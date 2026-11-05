import { ROUTE_LEGS } from "../logic/route";
import type { Session } from "./schema";

/** One stat card on the kid's result: a short label for the coloured band and the value in the card. */
export interface ResultCard {
  label: string;
  value: string;
}

/**
 * "What you did" this round, in the words of its game. It counts events the device can detect
 * (heard, delivered, run with a voice, door opened) — never a share of "correct" speech, which this prototype cannot know.
 */
export function roundDid(s: Session): ResultCard {
  if (s.call) return { label: "เพื่อนที่ได้ยิน", value: `${s.call.heard}/${s.call.target} ตัว` };
  if (s.game === "balloon" && s.balloon) return { label: "ส่งถึง", value: `${s.balloon.completed}/${s.balloon.target} ลูก` };
  // a door round (alone, or after a route — its stars then include the door's) shows the door
  if (s.gate) return { label: "ประตู", value: s.gate.opened ? "เปิดแล้ว" : "ยังไม่เปิด" };
  if (s.game === "runner") return { label: "วิ่งด้วยเสียง", value: `${s.stars}/${ROUTE_LEGS} ช่วง` };
  return { label: "ครั้งที่พูด", value: `${s.attempts} ครั้ง` };
}
