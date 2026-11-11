import type { HapticKind } from "../lib/haptics";
import type { BalloonEvent } from "./balloon";
import type { CallEvent } from "./call";
import type { GateEvent } from "./gate";
import type { KickEvent } from "./kick";
import type { RouteEvent } from "./route";

/**
 * Which game events may buzz (optional vibration, see lib/haptics) — one buzz per real event, only once the voice
 * segment has closed (the game's feedback phase), never for silence, unusable signal, retries, nudges or skips.
 * The key (round token + event + index) makes a repeated call for the same event a no-op.
 * Nothing here reads loudness or nasal/oral values: the pattern is fixed by the kind of event.
 */
export interface Cue {
  kind: HapticKind;
  key: string;
}

/** กบข้ามบึง: the friend heard a usable call (the first time for that friend; more calls to it do not buzz again). */
export function callCue(ev: CallEvent, round: string): Cue | null {
  return ev.type === "heard" && ev.first ? { kind: "usable", key: `call:${round}:heard:${ev.index}` } : null;
}

/** ยิงจุดโทษ: one buzz per ball, at the goal (a usable word is always a goal; the kick itself stays quiet so one word buzzes once). */
export function kickCue(ev: KickEvent, round: string): Cue | null {
  return ev.type === "goal" ? { kind: "reward", key: `kick:${round}:goal:${ev.shot}` } : null;
}

/**
 * วิ่ง: the bunny sets off on a usable word (usable), and reaching the destination by voice is the reward —
 * the last word's set-off stays quiet so that word buzzes once. A skipped last leg ends the run without a buzz.
 * `lastHeard` = the last leg's word was heard (the run to the destination was the child's).
 */
export function routeCue(ev: RouteEvent, round: string, legs: number, lastHeard: boolean): Cue | null {
  if (ev.type === "leave") return ev.to < legs ? { kind: "usable", key: `route:${round}:leave:${ev.to}` } : null;
  if (ev.type === "finish") return lastHeard ? { kind: "reward", key: `route:${round}:finish` } : null;
  return null;
}

/** บอลลูน: a balloon reached its pin (the game rests then and does not listen). */
export function balloonCue(ev: BalloonEvent, round: string): Cue | null {
  return ev.type === "balloon-complete" ? { kind: "reward", key: `balloon:${round}:delivered:${ev.index}` } : null;
}

/** ประตู: the door opened (attempt events never buzz: whether the door moved depends on the nasal target). */
export function gateCue(ev: GateEvent, round: string): Cue | null {
  return ev.type === "open" ? { kind: "reward", key: `gate:${round}:open` } : null;
}
