import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { teamById } from "../../data/teams";
import { CHEER_MS, FLIGHT_MS, type KickMatch, type ShotStyle } from "../../logic/kick";
import { bump, CALM, clamp01, damp, easeInOutSine, easeOutCubic, frameDt, lerp, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import {
  BALL_R,
  CORNER_X,
  CornerFlag,
  GOAL_H,
  Goal,
  NET_BOTTOM_D,
  NET_TOP_D,
  Pitch,
  SoccerBall,
  Stands,
  Trophy,
  type CrowdDrive,
  type NetDrive,
} from "../models/Football";
import { Friend, type FriendKind, type FriendPose } from "../models/Friends";
import { Pet, type PetKind } from "../models/Pets";
import { petDrive } from "../models/petDrives";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { KickSpec } from "../spec";

type V3 = [number, number, number];

/* ---------- Layout (the goal line is z = 0; the camera looks down −z from behind the kicker) ---------- */

/** Penalty spot (ball centre). Closer than a real pitch, so the goal stays big on a phone. */
const SPOT = new THREE.Vector3(0, BALL_R, 3.0);
/**
 * The kicker waits a few steps back and to one side ([0] = left, [1] = right) and runs up diagonally to plant beside
 * the ball. The side is chosen per shot (Shot.from) so that, seen from the camera, the kicker never stands in front of
 * the keeper's dive.
 */
const STARTS = [new THREE.Vector3(-1.25, 0, 4.15), new THREE.Vector3(1.25, 0, 4.15)];
const PLANTS = STARTS.map((s) => new THREE.Vector3(SPOT.x, 0, SPOT.z).addScaledVector(new THREE.Vector3(s.x - SPOT.x, 0, s.z - SPOT.z).normalize(), 0.5));
const sideIndex = (side: number) => (side < 0 ? 0 : 1);
const KICKER_SCALE = 0.9;
/** Turned towards the camera to celebrate with the child. */
const FACE_CAMERA = 0.25;
/** The last steps to the ball; keeping up with the voice run-up; walking to the start for the next ball (world units / s). */
const DASH_SPEED = 3.2;
const CHARGE_SPEED = 2.6;
const WALK_SPEED = 1.7;
/** Walking over to the other side, the kicker goes round behind the ball at this depth (stays below the goal on screen). */
const CROSS_Z = 4.45;
const KEEPER_Z = 0.42;
const TROPHY_AT = new THREE.Vector3(0.62, 0, 3.55);
/** The child's own pet watches from the touchline, left of the left run-up start. */
const BUDDY_AT: V3 = [-2.05, 0, 3.35];
const FLIGHT_S = FLIGHT_MS / 1000;
const CHEER_S = CHEER_MS / 1000;
/** The keeper reacts a moment after the foot meets the ball (s). */
const REACT_S = 0.05;
/** A new ball pops onto the spot (s). */
const POP_S = 0.45;
/** How far the net bulges back where the ball hits it (reduced motion: less). */
const NET_PUSH = 0.3;
const NET_PUSH_CALM = 0.17;

interface Shot {
  /** Where the ball meets the back of the net. */
  x: number;
  y: number;
  /** Height of the curve's control point (a chip goes high) and its sideways bend. */
  lift: number;
  curl: number;
  /** Way the keeper dives: +1 = right (+x), −1 = left, 0 = jumps straight up a moment too late (chip). */
  dive: -1 | 0 | 1;
  /** Side the kicker runs up from: the one that keeps the keeper's dive in view from the camera (behind, to the right). */
  from: -1 | 1;
}

/** Each style lands in its own spot; the keeper always goes the other way (a usable word is always a goal). */
const SHOTS: Record<ShotStyle, Shot> = {
  "low-left": { x: -1.3, y: 0.3, lift: 0.4, curl: -0.3, dive: 1, from: -1 },
  "high-right": { x: 1.25, y: 1.12, lift: 1.05, curl: 0.3, dive: -1, from: 1 },
  chip: { x: 0.1, y: 0.85, lift: 3.4, curl: 0.05, dive: 0, from: -1 },
  "low-right": { x: 1.32, y: 0.3, lift: 0.35, curl: 0.3, dive: -1, from: 1 },
  "top-left": { x: -1.28, y: 1.15, lift: 1.1, curl: -0.35, dive: 1, from: -1 },
};

/** z of the back net at height y (it slopes from the ground up to the top of the frame). */
const netZ = (y: number) => -NET_BOTTOM_D + (NET_BOTTOM_D - NET_TOP_D) * clamp01(y / GOAL_H);
/** Where a ball comes to rest at the bottom of the net. */
const REST_Z = netZ(BALL_R) + BALL_R + 0.02;

/** The net where the ball hit it, s after the hit (0 … 1): a quick push back, then a soft wobble that dies out. */
function netBulge(t: number): number {
  if (t < 0 || t > 1.4) return 0;
  if (t < 0.08) return Math.sin((t / 0.08) * (Math.PI / 2));
  const u = t - 0.08;
  return Math.exp(-u * 4) * Math.cos(u * 9);
}

/** Keeper size per friend, and its shape for rolling over (body centre height, half-width, top of the head; model units). */
const KEEPER: Record<FriendKind, { s: number; cy: number; half: number; top: number }> = {
  crab: { s: 1.3, cy: 0.27, half: 0.32, top: 0.74 },
  dog: { s: 1.2, cy: 0.38, half: 0.27, top: 0.86 },
  bird: { s: 1.25, cy: 0.34, half: 0.3, top: 0.8 },
  turtle: { s: 1.4, cy: 0.2, half: 0.4, top: 0.58 },
  fish: { s: 1.2, cy: 0.3, half: 0.27, top: 0.8 },
};

/* ---------- Camera: TV view from behind and to the right of the kicker ---------- */

interface View {
  target: V3;
  dir: V3;
  width: number;
  height: number;
}
/** Phone portrait: the width (goal + kicker) sets the distance; the stands and trees fill the space above. */
const VIEW_TALL: View = { target: [-0.2, 1.6, 1.6], dir: [0.22, 0.3, 1], width: 5.3, height: 6.9 };
/** Wide stage: the height (kicker's feet … top of the chip) sets the distance. */
const VIEW_WIDE: View = { target: [-0.35, 0.55, 1.6], dir: [0.24, 0.36, 1], width: 7.3, height: 4.15 };
/** A long lens (TV look): the kicker in front and the goal behind keep similar sizes. */
const FOV = 26;

/** Blend of the two framings by stage shape (checked from 320×560 to 1400×600: kicker, ball, goal and dives stay in view). */
function kickView(aspect: number): View {
  const k = THREE.MathUtils.smoothstep(aspect, 0.75, 1.8);
  const mix = (a: V3, b: V3): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  return {
    target: mix(VIEW_TALL.target, VIEW_WIDE.target),
    dir: mix(VIEW_TALL.dir, VIEW_WIDE.dir),
    width: lerp(VIEW_TALL.width, VIEW_WIDE.width, k),
    height: lerp(VIEW_TALL.height, VIEW_WIDE.height, k),
  };
}

/** Trees behind the stand, far hills, a few clouds (same every visit; half of it on the low tier). */
function decor(low: boolean) {
  const r = seeded(53);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const half = <T,>(list: T[]): T[] => (low ? list.filter((_, i) => i % 2 === 0) : list);
  return {
    trees: half(Array.from({ length: 12 }, (_, i): Placement => ({ x: -11 + i * 2 + rnd(-0.5, 0.5), z: rnd(-7.2, -9.4), s: rnd(1.5, 2.1), ry: rnd(0, 6) }))),
    hills: [
      { x: -10, y: -0.6, z: -18, s: 5 },
      { x: 1, y: -0.7, z: -21, s: 6.5 },
      { x: 11, y: -0.6, z: -17.5, s: 4.8 },
    ] as Placement[],
    clouds: half([
      { x: -6.5, y: 5.4, z: -14, s: 1.7 },
      { x: 4.8, y: 6.1, z: -16, s: 2 },
      { x: -0.8, y: 4.6, z: -12.5, s: 1.3 },
      { x: 9.5, y: 4.9, z: -13.5, s: 1.5 },
    ] as Placement[]),
  };
}

/* ---------- Scene state (one object, mutated every frame; no React state changes while playing) ---------- */

type BallMode = "spot" | "flight" | "net";

interface KickState {
  game: KickMatch | null;
  /** Last seen cues of the match. */
  shot: number;
  kickSeq: number;
  goalSeq: number;
  askSeq: number;
  t: number;
  /* kicker */
  /** Where the kicker stands (before the small follow-through step after the kick). */
  kpos: THREE.Vector3;
  dashFrom: THREE.Vector3;
  /** Run-up side of the ball being kicked, and the direction of that run-up (for the follow-through). */
  kickSide: number;
  followDir: THREE.Vector3;
  /** Flight progress at which the foot meets the ball (the last steps happen before it). */
  contactK: number;
  /** Seconds since the foot met the ball (−1 = not yet). */
  kickT: number;
  follow: number;
  yaw: number;
  /** Seconds since the goal (−1 = none). */
  cheerT: number;
  hop2: boolean;
  /** Seconds since the round ended (−1 = still playing). */
  doneT: number;
  /* ball */
  ball: BallMode;
  style: ShotStyle;
  /** Flight progress shown: the logic's flightK (runs on by itself if the round is ended mid-flight). */
  fk: number;
  popT: number;
  netT: number;
  netZ: number;
  /** How much the net gives where this ball hit it (Goal: −z / NET_BOTTOM_D). */
  give: number;
  vy: number;
  from: THREE.Vector3;
  ctrl: THREE.Vector3;
  to: THREE.Vector3;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  spin: THREE.Quaternion;
  axis: THREE.Vector3;
  spinRate: number;
  spinKick: number;
  spinTilt: number;
  /* keeper */
  kx: number;
  air: number;
  roll: number;
  pitch: number;
  kyaw: number;
  squash: number;
  dizzy: number;
  diveSide: -1 | 0 | 1;
  diveX0: number;
  landX: number;
}

function freshState(): KickState {
  return {
    game: null,
    shot: 0,
    kickSeq: 0,
    goalSeq: 0,
    askSeq: 0,
    t: 0,
    kpos: STARTS[0].clone(),
    dashFrom: new THREE.Vector3(),
    kickSide: -1,
    followDir: new THREE.Vector3(1, 0, 0),
    contactK: 0.1,
    kickT: -1,
    follow: 0,
    yaw: Math.atan2(SPOT.x - STARTS[0].x, SPOT.z - STARTS[0].z),
    cheerT: -1,
    hop2: false,
    doneT: -1,
    ball: "spot",
    style: "low-left",
    fk: 0,
    popT: -1,
    netT: 0,
    netZ: REST_Z,
    give: 1,
    vy: 0,
    from: new THREE.Vector3(),
    ctrl: new THREE.Vector3(),
    to: new THREE.Vector3(),
    pos: SPOT.clone(),
    prev: SPOT.clone(),
    spin: new THREE.Quaternion(),
    axis: new THREE.Vector3(1, 0, 0),
    spinRate: 0,
    spinKick: 0,
    spinTilt: 0,
    kx: 0,
    air: 0,
    roll: 0,
    pitch: 0,
    kyaw: 0,
    squash: 0,
    dizzy: 0,
    diveSide: 1,
    diveX0: 0,
    landX: 0,
  };
}

/** New match or restart: everyone back in place at once. */
function resetState(w: KickState, g: KickMatch): void {
  w.game = g;
  w.shot = g.shot;
  w.kickSeq = g.kickSeq;
  w.goalSeq = g.goalSeq;
  w.askSeq = g.call.state.askSeq;
  const i = sideIndex(SHOTS[g.style].from);
  w.kpos.lerpVectors(STARTS[i], PLANTS[i], g.phase === "aim" ? g.runup : 1);
  w.kickSide = SHOTS[g.style].from;
  w.kickT = -1;
  w.follow = 0;
  w.yaw = g.done ? FACE_CAMERA : Math.atan2(SPOT.x - w.kpos.x, SPOT.z - w.kpos.z);
  w.cheerT = -1;
  w.hop2 = false;
  w.doneT = g.done ? 0 : -1;
  w.ball = "spot";
  w.fk = 0;
  w.popT = -1;
  w.pos.copy(SPOT);
  w.prev.copy(SPOT);
  w.spin.identity();
  w.spinRate = 0;
  w.kx = 0;
  w.air = 0;
  w.roll = 0;
  w.pitch = 0;
  w.kyaw = 0;
  w.squash = 0;
  w.dizzy = 0;
  w.diveX0 = 0;
  w.landX = 0;
}

/** A usable word: plan the last steps, the ball's curve for this shot style and the keeper's dive. */
function startKick(w: KickState, style: ShotStyle): void {
  const shot = SHOTS[style];
  w.style = style;
  w.ball = "flight";
  w.fk = 0;
  w.popT = -1;
  w.kickT = -1;
  const i = sideIndex(shot.from);
  w.kickSide = shot.from;
  w.dashFrom.copy(w.kpos);
  w.followDir.subVectors(PLANTS[i], STARTS[i]).normalize();
  // the last steps take as long as the distance left needs (a short word leaves a longer dash), within limits
  w.contactK = THREE.MathUtils.clamp(w.kpos.distanceTo(PLANTS[i]) / DASH_SPEED, 0.14, 0.45) / FLIGHT_S;
  w.from.copy(SPOT);
  w.to.set(shot.x, shot.y, netZ(shot.y) + BALL_R);
  w.ctrl.set((SPOT.x + shot.x) / 2 + shot.curl, shot.lift, (SPOT.z + w.to.z) / 2);
  w.spinKick = style === "chip" ? -7 : 16;
  w.spinTilt = shot.curl * 1.2;
  w.diveSide = shot.dive;
  w.diveX0 = w.kx;
}

function quadBezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u;
  return out.set(v * v * a.x + 2 * u * v * c.x + u * u * b.x, v * v * a.y + 2 * u * v * c.y + u * u * b.y, v * v * a.z + 2 * u * v * c.z + u * u * b.z);
}

/** Frame-rate independent turn towards an angle, the short way round. */
function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * (1 - Math.exp(-lambda * dt));
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const u = t - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

function fire(ref: RefObject<BurstFire>, x: number, y: number, z: number): void {
  ref.current = { seq: ref.current.seq + 1, x, y, z };
}

const scratch = new THREE.Object3D();

/**
 * ฉากยิงจุดโทษ 3D: มุมกล้องแบบถ่ายทอดสด จากด้านหลังเยื้องขวาของนักเตะ (กระต่าย) มองไปที่ประตู ผู้รักษาประตูคือเพื่อนสัตว์ของทีมที่เด็กเลือก
 * - ทุกอย่างอ่านจาก KickMatch ทุกเฟรม (ไม่มี React render ระหว่างเล่น): เด็กพูด → กระต่ายวิ่งเข้าหาลูกตาม runup ·
 *   ได้คำที่ใช้ได้ (kickSeq) → ก้าวสุดท้ายถึงลูกพอดีตอนลูกออก ลูกโค้งเข้าตาข่ายตาม style ถึงตาข่ายพอดีที่ flightK = 1 ·
 *   ประตู (goalSeq) → ตาข่ายโป่ง กองเชียร์กระโดดเป็นคลื่น กระต่ายเชียร์หันมาหาเด็ก พลุกระดาษ · ลูกถัดไป (shot) → เดินไปจุดเริ่มวิ่ง
 *   ของลูกนั้น (อ้อมหลังลูก) — วิ่งเข้าจากฝั่งที่ไม่บังท่าพุ่งของผู้รักษาประตูในมุมกล้องนี้ (Shot.from)
 * - ผู้รักษาประตูพุ่งผิดทางแบบตลก ๆ (ลูกโด่งข้ามหัว = กระโดดช้าไปนิด) ลงพื้นนุ่ม ๆ แล้วนั่งมึนยิ้ม — ไม่มีท่าเศร้า ไม่มีลูกพลาด
 *   เสียงที่ใช้ไม่ได้ (askSeq) = เอียงหัวสงสัย · วงแหวนใต้กระต่าย = เกมกำลังฟัง (ทอง = มีเสียงเข้ามา) หายไประหว่างลูกลอย/ฉลอง
 * - ลดการเคลื่อนไหว: กล้องอยู่กับที่เสมอ ท่าโยก/ท่าพุ่งเล็กลงและช้าลง ประกายน้อยลง แต่ลูกยังลอยเข้าประตูเหมือนเดิม
 */
/**
 * สัตว์เลี้ยงของเด็กดูอยู่ข้างสนาม: ระหว่างเด็กพูดจะกระโดดลุ้น · ทุกประตูกระโดดดีใจหนึ่งครั้ง · จบรอบดีใจอีกครั้ง
 * อ่านค่าจาก KickMatch เท่านั้น (เริ่มรอบใหม่ไม่เล่นท่าของรอบเก่าซ้ำ)
 */
function KickBuddy({ kind, gameRef, reduced }: { kind: PetKind; gameRef: KickSpec["gameRef"]; reduced: boolean }) {
  const drive = useRef(petDrive({ reduced }));
  const seen = useRef<{ game: unknown; goal: number; done: boolean }>({ game: null, goal: 0, done: false });
  useFrame(() => {
    const g = gameRef.current;
    const d = drive.current;
    d.reduced = reduced;
    if (!g) return;
    const s = seen.current;
    if (s.game !== g) {
      seen.current = { game: g, goal: g.goalSeq, done: g.done };
      return;
    }
    d.speed = g.charging ? 0.8 : 0;
    if (g.goalSeq !== s.goal) {
      s.goal = g.goalSeq;
      d.cheer += 1;
    }
    if (g.done && !s.done) {
      s.done = true;
      d.cheer += 1;
    }
  });
  return (
    <group position={BUDDY_AT} rotation-y={0.35}>
      <Pet kind={kind} drive={drive} />
      <BlobShadow size={[0.5, 0.42]} />
    </group>
  );
}

export function KickWorld({ gameRef, frameRef, outfit, species, buddy, reduced, tier, team: teamId }: KickSpec) {
  const kit = useKit();
  const team = teamById(teamId);
  const keeperKind: FriendKind = team.goalie;
  const tune = KEEPER[keeperKind];
  const low = tier === "low";
  const L = useMemo(() => decor(low), [low]);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const view = useMemo(() => kickView(width / Math.max(1, height)), [width, height]);
  const geo = useMemo(
    () => ({
      tree: kit.geo("tree", S.tree),
      hill: kit.geo("hill", S.hill),
      cloud: kit.geo("cloud", S.cloud),
      star: kit.geo("sparkle", S.sparkle),
    }),
    [kit],
  );

  const bunny = useRef(bunnyDrive({ reduced }));
  const keeperPose = useRef<FriendPose>({ listening: false, happy: 0, asking: 0, reduced });
  const crowd = useRef<CrowdDrive>({ cheer: 0, excite: 0, party: false, reduced });
  const net = useRef<NetDrive>({ x: 0, y: 0, push: 0 });
  const kicker = useRef<THREE.Group>(null);
  const kickerBody = useRef<THREE.Group>(null);
  const kickerShadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ball = useRef<THREE.Mesh>(null);
  const ballShadow = useRef<THREE.Mesh>(null);
  const keeper = useRef<THREE.Group>(null);
  const keeperShadow = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.InstancedMesh>(null);
  const trophy = useRef<THREE.Group>(null);
  const trophyShadow = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.creamShade })), [kit]);
  const ringIdle = useMemo(() => new THREE.Color(C.creamShade), []);
  const ringLive = useMemo(() => new THREE.Color(C.gold), []);
  const fireGold = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const fireTeam = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const firePink = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const st = useRef(freshState());
  const tmp = useMemo(() => ({ kp: new THREE.Vector3(), want: new THREE.Vector3(), prev: new THREE.Vector3(), step: new THREE.Vector3(), dq: new THREE.Quaternion() }), []);

  // the keeper turns about its middle: heading outermost, then leaning back, then rolling sideways
  useLayoutEffect(() => {
    keeper.current?.rotation.set(0, 0, 0, "YXZ");
  }, [keeperKind]);

  // nothing of the celebration shows before it happens
  useLayoutEffect(() => {
    const m = stars.current;
    if (m) {
      scratch.scale.setScalar(0);
      scratch.updateMatrix();
      for (let i = 0; i < 3; i++) m.setMatrixAt(i, scratch.matrix);
      m.instanceMatrix.needsUpdate = true;
      m.visible = false;
    }
    if (trophyShadow.current) trophyShadow.current.visible = false;
  }, []);

  /** The ball meets the net: it bulges, everybody celebrates (the logic's goal cue, or a ball still flying when the round ended). */
  const score = () => {
    const w = st.current;
    w.ball = "net";
    w.netT = 0;
    w.netZ = w.to.z;
    w.give = clamp01(-netZ(w.to.y) / NET_BOTTOM_D);
    w.vy = 0;
    w.pos.copy(w.to);
    w.cheerT = 0;
    w.hop2 = false;
    net.current.x = w.to.x;
    net.current.y = w.to.y;
    crowd.current.cheer += 1;
    bunny.current.cheer += 1;
    keeperPose.current.happy += 1;
    const y = w.to.y + 0.35;
    const z = w.to.z + 0.45;
    fire(fireGold, w.to.x, y, z);
    if (!reduced) {
      fire(fireTeam, w.to.x - 0.15, y + 0.1, z);
      fire(firePink, w.to.x + 0.15, y, z);
    }
  };

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const f = frameRef.current;
    const call = g.call.state;
    const amp = reduced ? CALM.amp : 1;
    const w = st.current;
    w.t += dt;
    if (w.game !== g) resetState(w, g);

    /* ---- cues from the match: the scene only shows what the logic decided ---- */
    if (g.shot !== w.shot) {
      w.shot = g.shot;
      if (!g.done) {
        // next ball (after the celebration, or a skipped one): a fresh ball pops onto the spot
        w.ball = "spot";
        w.popT = 0;
        w.fk = 0;
        w.kickT = -1;
        w.cheerT = -1;
      }
    }
    if (g.kickSeq !== w.kickSeq) {
      w.kickSeq = g.kickSeq;
      startKick(w, g.style);
    }
    if (g.goalSeq !== w.goalSeq) {
      w.goalSeq = g.goalSeq;
      if (w.ball !== "net") score();
    }
    if (call.askSeq !== w.askSeq) {
      // an attempt that could not be used: the keeper tilts its head, curious (nothing else changes)
      w.askSeq = call.askSeq;
      keeperPose.current.asking += 1;
    }
    if (w.ball === "flight") {
      // the flight follows the logic; if the round is ended mid-flight the ball still lands (its word was usable)
      w.fk = g.phase === "flight" ? g.flightK : Math.min(1, w.fk + dt / FLIGHT_S);
      if (g.phase !== "flight" && w.fk >= 1) score();
    }
    if (g.done && w.doneT < 0) {
      w.doneT = 0;
      keeperPose.current.happy += 1;
      fire(fireGold, TROPHY_AT.x, 0.9, TROPHY_AT.z);
      if (!reduced) fire(fireTeam, TROPHY_AT.x, 1.0, TROPHY_AT.z);
    }

    /* ---- kicker: on the run-up line of this ball's side (start … planted beside the ball) ---- */
    tmp.prev.copy(w.kpos);
    const dashing = w.ball === "flight" && w.kickT < 0;
    if (dashing) {
      // the last steps, timed so the foot meets the ball just as it leaves the spot
      const k = w.contactK > 0 ? clamp01(w.fk / w.contactK) : 1;
      w.kpos.lerpVectors(w.dashFrom, PLANTS[sideIndex(w.kickSide)], k);
      if (k >= 1) w.kickT = 0;
    } else if (g.phase === "aim") {
      // where the logic's runup puts the kicker: it runs there on the child's voice (never further), and walks over to
      // the start for a new ball (crossing behind the ball when the next one is taken from the other side)
      const i = sideIndex(SHOTS[g.style].from);
      const want = tmp.want.lerpVectors(STARTS[i], PLANTS[i], g.runup);
      // changing sides on foot: first step back towards the camera, so the walk never passes in front of the goal
      // (aims past the line it must reach, so it never zig-zags once it is far enough back)
      if (!g.charging && w.kpos.x * want.x < 0 && w.kpos.z < CROSS_Z - 0.35) want.set(w.kpos.x * 0.6, 0, CROSS_Z);
      const gap = w.kpos.distanceTo(want);
      if (gap > 1e-4) w.kpos.lerp(want, Math.min(1, ((g.charging ? CHARGE_SPEED : WALK_SPEED) * dt) / gap));
    }
    const moved = tmp.step.subVectors(w.kpos, tmp.prev);
    const walking = !dashing && !g.charging && moved.length() > 0.15 * dt;
    if (w.kickT >= 0) w.kickT += dt;
    w.follow = damp(w.follow, w.kickT >= 0 ? 1 : 0, 5, dt);
    const kp = tmp.kp.copy(w.kpos).addScaledVector(w.followDir, 0.14 * w.follow);

    const b = bunny.current;
    b.reduced = reduced;
    b.boost = false;
    if (w.cheerT >= 0) {
      w.cheerT += dt;
      if (!w.hop2 && !reduced && w.cheerT > 0.75) {
        w.hop2 = true;
        b.cheer += 1;
      }
    }
    if (dashing) {
      b.pose = "run";
      b.speed = 1.5;
    } else if (g.charging) {
      // running on the voice (on the spot once the run-up is nearly done)
      b.pose = "run";
      b.speed = 0.95;
    } else if (walking) {
      b.pose = "run";
      b.speed = 0.4;
    } else {
      b.pose = w.doneT >= 0 || w.cheerT > 0.95 ? "wave" : "stand";
      b.speed = 0;
    }
    let face = Math.atan2(SPOT.x - kp.x, SPOT.z - kp.z);
    if (walking) face = Math.atan2(moved.x, moved.z);
    else if (w.cheerT >= 0 || w.doneT >= 0) face = FACE_CAMERA;
    else if (w.kickT >= 0) face = Math.atan2(w.pos.x - kp.x, w.pos.z - kp.z); // watches the ball fly
    w.yaw = dampAngle(w.yaw, face, walking ? 9 : 6, dt);
    const kr = kicker.current;
    if (kr) {
      kr.position.set(kp.x, 0, kp.z);
      kr.rotation.y = w.yaw;
    }
    const kb = kickerBody.current;
    if (kb) {
      // the kick itself (the bunny has no kick pose): a small hop, a lean into the ball and a twist
      const kt = w.kickT >= 0 ? w.kickT : 9;
      kb.position.y = bump(kt / 0.42) * 0.13 * (reduced ? 0.6 : 1);
      kb.rotation.set(bump(kt / 0.5) * 0.3 * (reduced ? 0.7 : 1), bump(kt / 0.32) * 0.3 * amp, 0);
    }
    kickerShadow.current?.position.set(kp.x, 0.015, kp.z + 0.03);
    const rg = ring.current;
    if (rg) {
      // listening ring: while the game listens for the word; gold while a voice is coming in; gone while busy
      rg.visible = g.phase === "aim" && call.phase === "turn";
      rg.position.set(kp.x, 0.02, kp.z);
      ringMat.color.copy(call.inAttempt && f.valid ? ringLive : ringIdle);
    }

    /* ---- ball ---- */
    const bp = w.pos;
    w.prev.copy(bp);
    let size = 1;
    let push = 0;
    if (w.ball === "spot") {
      bp.copy(SPOT);
      if (w.popT >= 0) {
        w.popT += dt;
        const p = clamp01(w.popT / POP_S);
        size = p < 0.35 ? p / 0.35 : 1 + Math.sin(((p - 0.35) / 0.65) * Math.PI) * 0.14 * amp;
        if (!reduced) bp.y += (1 - p) * (1 - p) * Math.abs(Math.cos(p * Math.PI * 2.5)) * 0.4;
        if (p >= 1) w.popT = -1;
      }
    } else if (w.ball === "flight") {
      if (w.fk > w.contactK) {
        // after the foot: along the shot's curve, reaching the net exactly at flightK = 1
        const v = (w.fk - w.contactK) / (1 - w.contactK);
        quadBezier(w.from, w.ctrl, w.to, w.style === "chip" ? v : 1 - Math.pow(1 - v, 1.35), bp);
      } else bp.copy(SPOT);
    } else {
      // in the net: the net bulges and the ball rides it back, then drops to the bottom of the net with a small bounce
      w.netT += dt;
      push = (reduced ? NET_PUSH_CALM : NET_PUSH) * netBulge(w.netT);
      if (w.netT > 0.2) {
        w.vy -= 9 * dt;
        bp.y += w.vy * dt;
        if (bp.y <= BALL_R) {
          bp.y = BALL_R;
          w.vy = w.vy < -0.7 ? -w.vy * 0.35 : 0;
        }
        w.netZ = damp(w.netZ, REST_Z, 2.5, dt);
      }
      bp.x = w.to.x;
      bp.z = w.netZ - push * w.give;
      // it leaves just before the next ball is set up (the last ball stays in the net)
      if (g.phase === "cheer" && g.shot < g.shots - 1) size = clamp01((1 - g.cheerK) / 0.14);
    }
    if (w.ball === "flight") {
      if (w.fk > w.contactK) {
        // topspin about the axis across the direction of travel (+ a little sidespin on curled shots; the chip has backspin)
        const dx = bp.x - w.prev.x;
        const dz = bp.z - w.prev.z;
        const len = Math.hypot(dx, dz);
        if (len > 1e-6) w.axis.set(dz / len, w.spinTilt, -dx / len).normalize();
        w.spinRate = w.spinKick;
      } else w.spinRate = 0;
    } else if (w.ball === "net") w.spinRate = damp(w.spinRate, 0, 2.5, dt);
    else w.spinRate = 0;
    net.current.push = push;
    if (w.spinRate !== 0) w.spin.premultiply(tmp.dq.setFromAxisAngle(w.axis, w.spinRate * dt));
    const bm = ball.current;
    if (bm) {
      bm.visible = size > 0.01;
      bm.position.copy(bp);
      bm.quaternion.copy(w.spin);
      bm.scale.setScalar(Math.max(0.001, size));
    }
    const bs = ballShadow.current;
    if (bs) {
      const k = size * (1 - 0.6 * clamp01((bp.y - BALL_R) / 2.2));
      bs.visible = size > 0.05;
      bs.position.set(bp.x, 0.015, bp.z);
      bs.scale.set(0.46 * k, 0.46 * k, 1);
    }

    /* ---- keeper ---- */
    const kpose = keeperPose.current;
    kpose.reduced = reduced;
    kpose.listening = g.charging;
    const tk = w.t * (reduced ? 0.6 : 1);
    // idle: a gentle side-to-side ready sway on the line
    let wx = Math.sin(tk * 1.5) * 0.2 * amp;
    let wAir = 0;
    let wRoll = -Math.sin(tk * 1.5) * 0.05 * amp;
    let wPitch = 0;
    let wYaw = Math.sin(tk * 0.6) * 0.12 * amp;
    let squash = 0;
    let rate = reduced ? 2.5 : 4;
    let scripted = false;
    const waiting = w.ball === "flight" && w.fk <= w.contactK;
    if (g.charging || waiting) {
      // "I'm ready!": bouncy little hops while the kicker runs up
      wx = Math.sin(tk * 3) * 0.1 * amp;
      wAir = Math.abs(Math.sin(tk * 7)) * 0.12 * amp;
      wRoll = 0;
      wYaw = 0;
      rate = 8;
    }
    if (w.ball === "flight" && !waiting) {
      scripted = true;
      const tau = (w.fk - w.contactK) * FLIGHT_S - REACT_S;
      if (w.diveSide !== 0) {
        // a big comical dive the wrong way, a soft landing and a little slide
        const side = w.diveSide;
        const p = clamp01((tau - 0.1) / 0.45);
        const slide = easeOutCubic(clamp01((tau - 0.55) / 0.3));
        w.kx = w.diveX0 + side * (1.0 * easeOutCubic(p) + 0.1 * slide) * (reduced ? 0.85 : 1);
        w.air = bump(p) * 0.42 * (reduced ? 0.6 : 1);
        w.roll = -side * 1.3 * (reduced ? 0.8 : 1) * easeInOutSine(clamp01(p * 1.3));
        w.pitch = damp(w.pitch, 0, 10, dt);
        w.kyaw = damp(w.kyaw, 0, 10, dt);
        squash = tau < 0.1 ? bump(clamp01(tau / 0.1)) * 0.7 : tau > 0.55 && tau < 0.8 ? bump((tau - 0.55) / 0.25) * 0.6 : 0;
      } else {
        // chip: waits on the line, jumps straight up a moment too late and lands on its bottom
        const v = (w.fk - w.contactK) / (1 - w.contactK);
        const j = clamp01((v - 0.64) / 0.36);
        w.kx = damp(w.kx, w.diveX0, 6, dt);
        w.air = bump(j) * 0.5 * (reduced ? 0.6 : 1);
        w.pitch = -0.45 * easeInOutSine(j);
        w.roll = damp(w.roll, 0, 8, dt);
        w.kyaw = damp(w.kyaw, 0, 8, dt);
        squash = j <= 0 ? 0.2 : 0;
      }
      w.landX = w.kx;
    } else if (w.cheerT >= 0 && w.cheerT < CHEER_S) {
      // after the goal: sits up, a little dizzy, and happy for the kicker (never sad)
      const wob = Math.exp(-w.cheerT * 1.3) * amp;
      wx = w.landX;
      wAir = 0;
      wRoll = (w.diveSide !== 0 ? -w.diveSide * 0.42 : 0) + Math.sin(w.cheerT * 7) * 0.1 * wob;
      wPitch = w.diveSide === 0 ? -0.3 : 0;
      wYaw = Math.sin(w.cheerT * 5.2) * 0.3 * wob;
      rate = 3.5;
    }
    if (!scripted) {
      // everything else eases in (nothing jumps); on the way back to the line it hops along
      if (g.phase === "aim") wAir += Math.abs(Math.sin(w.t * 9)) * Math.min(1, Math.abs(wx - w.kx) * 1.5) * 0.12 * amp;
      w.kx = damp(w.kx, wx, rate, dt);
      w.air = damp(w.air, wAir, rate * 1.5, dt);
      w.roll = damp(w.roll, wRoll, rate, dt);
      w.pitch = damp(w.pitch, wPitch, rate, dt);
      w.kyaw = damp(w.kyaw, wYaw, rate, dt);
    }
    w.squash = damp(w.squash, squash, 14, dt);
    // rolling over: the body centre rises/falls so the side of the body (not the feet) rests on the grass
    const theta = Math.min(Math.PI / 2, Math.hypot(w.roll, w.pitch));
    const centre = Math.hypot(tune.cy * tune.s * Math.cos(theta), tune.half * tune.s * Math.sin(theta)) * (1 - 0.15 * w.squash) + w.air;
    const kg = keeper.current;
    if (kg) {
      kg.position.set(w.kx, centre, KEEPER_Z);
      kg.rotation.set(w.pitch, w.kyaw, w.roll);
      kg.scale.set(1 + 0.1 * w.squash, 1 - 0.15 * w.squash, 1 + 0.1 * w.squash);
    }
    const ks = keeperShadow.current;
    if (ks) {
      const k = 1 - Math.min(0.5, w.air * 0.9);
      ks.position.set(w.kx, 0.015, KEEPER_Z + 0.02);
      ks.scale.set((0.7 + 0.55 * Math.abs(Math.sin(w.roll))) * tune.s * k, 0.62 * tune.s * k, 1);
    }
    // dizzy stars circle over its head while it sits up
    w.dizzy = damp(w.dizzy, w.cheerT >= 0 && w.cheerT < CHEER_S ? 1 : 0, 6, dt);
    const sm = stars.current;
    if (sm) {
      sm.visible = w.dizzy > 0.02;
      if (sm.visible) {
        const top = (tune.top - tune.cy) * tune.s;
        const hx = w.kx - Math.sin(w.roll) * top;
        const hy = centre + Math.cos(theta) * top + 0.16;
        const s = 0.065 * w.dizzy;
        for (let i = 0; i < 3; i++) {
          const a = w.t * (reduced ? 2.2 : 4.4) + (i * Math.PI * 2) / 3;
          scratch.position.set(hx + Math.cos(a) * 0.26, hy + Math.sin(a * 2 + i) * 0.03, KEEPER_Z + Math.sin(a) * 0.18);
          scratch.rotation.set(0, a * 2, 0);
          scratch.scale.set(s * 0.8, s * 1.25, s * 0.8);
          scratch.updateMatrix();
          sm.setMatrixAt(i, scratch.matrix);
        }
        sm.instanceMatrix.needsUpdate = true;
      }
    }

    /* ---- crowd, net, trophy ---- */
    const cd = crowd.current;
    cd.reduced = reduced;
    cd.excite = g.charging ? 1 : 0;
    cd.party = w.doneT >= 0;

    const tr = trophy.current;
    const ts = trophyShadow.current;
    if (w.doneT >= 0) {
      // end of the match: a gold cup pops up beside the kicker and turns slowly
      w.doneT += dt;
      const s = Math.max(0.001, easeOutBack(clamp01(w.doneT / 0.7)));
      if (tr) {
        tr.visible = true;
        tr.scale.setScalar(s);
        tr.rotation.y = w.doneT * (reduced ? 0.35 : 0.8);
        tr.position.set(TROPHY_AT.x, 0.06 + Math.sin(w.doneT * 2) * 0.04 * amp, TROPHY_AT.z);
      }
      if (ts) {
        ts.visible = true;
        ts.scale.set(0.62 * s, 0.5 * s, 1);
      }
    } else {
      if (tr) tr.visible = false;
      if (ts) ts.visible = false;
    }
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 26, 64]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-4, 10, 8]} box={7} />
        <FitCamera target={view.target} dir={view.dir} width={view.width} height={view.height} fov={FOV} />

        <Pitch spot={SPOT.z} />
        <Stands color={team.color} deep={team.deep} crowd={crowd} dense={!low} />
        <Field geometry={geo.hill} items={L.hills} receiveShadow={false} />
        <Field geometry={geo.tree} items={L.trees} />
        <Field geometry={geo.cloud} items={L.clouds} receiveShadow={false} />
        <group position={[-CORNER_X, 0, 0]}>
          <CornerFlag color={team.color} reduced={reduced} />
        </group>
        <group position={[CORNER_X, 0, 0]}>
          <CornerFlag color={team.color} reduced={reduced} phase={1.7} />
        </group>
        <Goal net={net} color={team.color} deep={team.deep} shadows={!low} />

        {/* the keeper: the team's friend, turned about its middle so it can dive and roll */}
        <group key={keeperKind} ref={keeper} position={[0, tune.cy * tune.s, KEEPER_Z]}>
          <group position={[0, -tune.cy * tune.s, 0]} scale={tune.s}>
            <Friend kind={keeperKind} pose={keeperPose} />
          </group>
        </group>
        <BlobShadow ref={keeperShadow} at={[0, 0, KEEPER_Z + 0.02]} size={[0.7 * tune.s, 0.62 * tune.s]} materialKey="keeper" opacity={0.8} />
        <instancedMesh ref={stars} args={[geo.star, kit.basic(C.butter), 3]} frustumCulled={false} />

        <SoccerBall ref={ball} />
        <BlobShadow ref={ballShadow} at={[SPOT.x, 0, SPOT.z]} size={[0.46, 0.46]} materialKey="ball" opacity={0.85} />

        <mesh ref={ring} geometry={kit.torus(0.56, 0.032)} material={ringMat} rotation-x={-Math.PI / 2} position={[STARTS[0].x, 0.02, STARTS[0].z]} />
        <group ref={kicker} position={[STARTS[0].x, 0, STARTS[0].z]} rotation-y={Math.atan2(SPOT.x - STARTS[0].x, SPOT.z - STARTS[0].z)}>
          <group ref={kickerBody} scale={KICKER_SCALE}>
            <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
          </group>
        </group>
        <BlobShadow ref={kickerShadow} at={[STARTS[0].x, 0, STARTS[0].z + 0.03]} size={[0.86, 0.68]} />

        {buddy ? <KickBuddy kind={buddy as PetKind} gameRef={gameRef} reduced={reduced} /> : null}

        <group ref={trophy} position={[TROPHY_AT.x, 0.06, TROPHY_AT.z]} visible={false}>
          <Trophy />
        </group>
        <BlobShadow ref={trophyShadow} at={[TROPHY_AT.x, 0, TROPHY_AT.z]} size={[0.62, 0.5]} materialKey="trophy" opacity={0.7} />

        <Burst fire={fireGold} reduced={reduced} max={20} />
        <Burst fire={fireTeam} color={team.color} reduced={reduced} max={14} />
        <Burst fire={firePink} color={C.pink} reduced={reduced} max={12} />
      </group>
    </>
  );
}
