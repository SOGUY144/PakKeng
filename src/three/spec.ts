import type { RefObject } from "react";
import type { BalloonGame } from "../logic/balloon";
import type { CallGame } from "../logic/call";
import type { GateGame } from "../logic/gate";
import type { KickMatch } from "../logic/kick";
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
  /** Character the child picked on the island ("bunny" | "puppy" | "dino" | "kitty"); absent = bunny. */
  species?: string;
  /** Route the child picked on the map (id in src/data/routes.ts): its flags and destination. */
  route: string;
}

export interface GateSpec extends GameWorld<GateGame> {
  kind: "gate";
  outfit: string;
  species?: string;
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
  /** What the character wears and which character it is (picked on the island). */
  outfit?: string;
  species?: string;
}

/** The pond of the call-a-friend level (adapted from กบข้ามบึง). */
export interface FrogSpec extends GameWorld<CallGame> {
  kind: "frog";
  /** Friends in round order as a stable string, e.g. "crab,dog,fish". */
  friends: string;
  /** HTML speech bubble the scene keeps above the friend being called. */
  bubbleRef: RefObject<HTMLElement | null>;
}

/** The penalty-kick pitch (ยิงจุดโทษ). */
export interface KickSpec extends GameWorld<KickMatch> {
  kind: "kick";
  /** Unlocked collectibles worn by the kicker, e.g. "cap,scarf". */
  outfit: string;
  species?: string;
  /** The pet that comes along (shown on the touchline); "" = none. */
  buddy?: string;
  /** The team the child plays against (id in src/data/teams.ts): its goalie, colours and crowd. */
  team: string;
}

/**
 * เกาะของฉัน: ตัวละครที่เลือก (ชนิด + ชุด) สัตว์ที่พาไปด้วย ไข่ และแปลงผัก — ทุกอย่างมาจากรางวัลที่คำนวณจากรอบที่บันทึก
 * (src/data/rewards.ts) ส่งเป็นค่า primitive: เปลี่ยนเมื่อเด็กเลือก/ฟัก/ปลูก/เก็บ ไม่ใช่ทุกเฟรม
 */
export interface IslandSpec extends WorldCommon {
  kind: "island";
  species: string;
  outfit: string;
  /** Pet that walks with the character ("" = none). */
  buddy: string;
  /** Other pets the child has, comma separated (they idle around the island). */
  pets: string;
  /** "kind:crack:ready" of the egg being warmed, or "" when there is none. */
  egg: string;
  /** Beds left to right as "kind:stage" or "" for an empty bed, comma separated, e.g. "carrot:1,,sunflower:3". */
  beds: string;
  /** Which part of the island the child is looking at (camera framing). */
  focus: "me" | "pets" | "garden";
  /** Increment to play: the egg hatching / a plant being picked (index) / the character cheering after a change. */
  hatchSeq: number;
  pickSeq: number;
  pickBed: number;
  cheerSeq: number;
}

export interface CelebrateSpec extends WorldCommon {
  kind: "celebrate";
  game: "runner" | "balloon" | "frog" | "kick";
  outfit: string;
  species?: string;
}

export type WorldSpec = RunnerSpec | GateSpec | BalloonSpec | FrogSpec | KickSpec | IslandSpec | CelebrateSpec;
