import type { HapticKind } from "../lib/haptics";
import type { BalloonEvent } from "./balloon";
import type { CallEvent } from "./call";
import type { GateEvent } from "./gate";
import type { KickEvent } from "./kick";
import type { PlaneEvent } from "./plane";
import type { BakeryEvent } from "./bakery";
import type { RouteEvent } from "./route";
import type { TowerEvent } from "./tower";
import type { TrainEvent } from "./train";

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

/**
 * หอคอยเมฆ: one buzz per floor jumped on a usable word, when the avatar lands (the jump and the landing are the same
 * word, so it buzzes once) — the top is the reward instead of the floor buzz, never both. The skip lift never buzzes.
 */
export function towerCue(ev: TowerEvent, round: string): Cue | null {
  if (ev.type !== "land") return null;
  return ev.top ? { kind: "reward", key: `tower:${round}:top` } : { kind: "usable", key: `tower:${round}:land:${ev.floor}` };
}

/**
 * รถไฟส่งของ: one buzz per leg ridden on a usable word, when the train pulls in (the departure and the arrival are the
 * same word, so it buzzes once) — the delivery at the receiver is the reward instead of the stop buzz, never both.
 * A coasted (skipped) leg never buzzes.
 */
export function trainCue(ev: TrainEvent, round: string): Cue | null {
  if (ev.type !== "arrive") return null;
  return ev.last ? { kind: "reward", key: `train:${round}:deliver` } : { kind: "usable", key: `train:${round}:arrive:${ev.stop}` };
}

/** นักบินฟองสบู่: one buzz per cloud popped or hail rolled past (a near miss never buzzes: it depends on the target). */
export function planeCue(ev: PlaneEvent, round: string): Cue | null {
  if (ev.type === "hit" || ev.type === "dodge") return { kind: "reward", key: `plane:${round}:${ev.type}:${ev.encounter}` };
  return null;
}

/** ร้านขนม: a topping lands on a usable word (quiet tap), a customer eats the finished cake (reward). */
export function bakeryCue(ev: BakeryEvent, round: string): Cue | null {
  if (ev.type === "drop") return { kind: "usable", key: `bakery:${round}:drop:${ev.customer}:${ev.topping}` };
  if (ev.type === "eat") return { kind: "reward", key: `bakery:${round}:eat:${ev.customer}` };
  return null;
}
