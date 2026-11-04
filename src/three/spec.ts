import type { RefObject } from "react";
import type { BalloonGame } from "../logic/balloon";
import type { CallGame } from "../logic/call";
import type { GateGame } from "../logic/gate";
import type { RouteRun } from "../logic/route";
import type { SignalFrame } from "../signal/SignalProcessor";
import type { Tier } from "./gfx";

/**
 * Props ของฉาก 3D แต่ละเกม — ส่งเป็น ref + ค่า primitive เท่านั้น
 * ฉากอ่านสถานะเกมจาก ref ทุกเฟรมเอง หน้าจอที่ render ทุกเฟรมจึงไม่ทำให้ฉาก 3D render ซ้ำ
 * (ตรรกะเกม/การให้คะแนนอยู่ใน src/logic เท่านั้น ฉาก 3D แค่แสดงผล)
 */
interface WorldCommon {
  tier: Tier;
  /** false = paused: the canvas stops rendering. */
  active: boolean;
  reduced: boolean;
}

interface GameWorld<G> extends WorldCommon {
  gameRef: RefObject<G | null>;
  frameRef: RefObject<SignalFrame>;
}

export interface RunnerSpec extends GameWorld<RouteRun> {
  kind: "runner";
  /** Unlocked collectibles worn by the bunny, e.g. "cap,scarf". */
  outfit: string;
  /** Route the child picked on the map (id in src/data/routes.ts): its flags and destination. */
  route: string;
}

export interface GateSpec extends GameWorld<GateGame> {
  kind: "gate";
  outfit: string;
  /** Door the child picked (its pattern and what waits behind it); absent = the classic gate. */
  door?: string;
}

export interface BalloonSpec extends GameWorld<BalloonGame> {
  kind: "balloon";
  threshold: number;
  /** Screen anchor for the HTML zone label (positioned by the scene each frame). */
  labelRef: RefObject<HTMLElement | null>;
  /** Where the child is sending the balloons (its pin and balloon colours); absent = the classic sky. */
  destination?: string;
}

/** The pond of the call-a-friend level (adapted from กบข้ามบึง). */
export interface FrogSpec extends GameWorld<CallGame> {
  kind: "frog";
  /** Friends in round order as a stable string, e.g. "crab,dog,fish". */
  friends: string;
  /** HTML speech bubble the scene keeps above the friend being called. */
  bubbleRef: RefObject<HTMLElement | null>;
}

export interface CelebrateSpec extends WorldCommon {
  kind: "celebrate";
  game: "runner" | "balloon" | "frog";
  outfit: string;
}

export type WorldSpec = RunnerSpec | GateSpec | BalloonSpec | FrogSpec | CelebrateSpec;
