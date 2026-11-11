import { useFrame } from "@react-three/fiber";
import { useRef, type ReactElement, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, damp, easeInOutSine, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import type { PetDrive } from "./petDrives";

export type { PetDrive } from "./petDrives";

export type PetKind = "puppy" | "kitten" | "chick" | "dino" | "dragon" | "unicorn";
// part of this module's public API (scenes pick pets from it); editing this file just reloads instead of hot-swapping
// oxlint-disable-next-line react/only-export-components
export const PET_KINDS: PetKind[] = ["puppy", "kitten", "chick", "dino", "dragon", "unicorn"];

type V3 = [number, number, number];
type GroupRef = RefObject<THREE.Group | null>;

/*
 * สีของสัตว์เลี้ยง (พาสเทล) — ไม่มีน้ำเงิน (oral) หรือส้ม (nasal): hue อยู่นอกช่วง ~15°–45° และ ~200°–235°
 * (ค่าในวงเล็บ = hue โดยประมาณ) และไม่ซ้ำสีเพื่อนสัตว์ใน Friends.tsx
 */
const PUP = "#ece6f0"; // soft silver-grey puppy (282°, almost neutral)
const PUP_EAR = "#a99db6"; // mauve-grey ears and tail tip (269°)
const KIT = "#ffd8e4"; // light pink kitten (342°)
const KIT_DEEP = "#f7a3bf"; // tabby stripes, inner ears, tail tip (340°)
const KIT_BLUSH = "#f58bad"; // cheeks a shade deeper than the fur (341°)
const CHICK = "#fff07e"; // lemon chick (53°)
const CHICK_DEEP = "#f9df5a"; // wings, tail, tuft (50°)
const CHICK_LIGHT = "#fff9cf"; // belly (52°)
const DINO = "#9fe3a6"; // fresh mint green (126°)
const DINO_BELLY = "#e7f7c9"; // pale lime belly (81°)
const DINO_SPIKE = "#ffe27a"; // lemon back spikes (47°)
const DRAGON = "#cdb8f6"; // lilac dragon (260°)
const DRAGON_BELLY = "#f4eeff"; // pale lilac belly (260°)
const UNI_MUZZLE = "#ffe1ea"; // pale pink muzzle (343°)
/** Unicorn mane and tail: a pastel rainbow without orange or blue (pink, lemon, mint, aqua 186°, lilac). */
const RAINBOW = [C.pink, "#ffe680", C.mint, "#bfe9ee", C.lilacDeep] as const;

const NO_ROT: V3 = [0, 0, 0];
const SIDES = [-1, 1] as const;
const CHEER_S = 0.9;
const smooth = THREE.MathUtils.smoothstep;

/** Walk-hop height (at speed 1) and whether the pet walks on two feet (waddle) or four legs (trot). */
const TUNE: Record<PetKind, { hop: number; biped: boolean }> = {
  puppy: { hop: 0.07, biped: false },
  kitten: { hop: 0.06, biped: false },
  chick: { hop: 0.05, biped: true },
  dino: { hop: 0.045, biped: true },
  dragon: { hop: 0.06, biped: false },
  unicorn: { hop: 0.065, biped: false },
};

/** Animated parts (unused ones stay null). Each ref'd group rests at identity; its parent holds the rest pose. */
interface Rig {
  head: GroupRef;
  eyes: GroupRef;
  /** Paired parts: ears, wings or arms (left = −X). */
  left: GroupRef;
  right: GroupRef;
  tail: GroupRef;
  /** Four legs: front-left, front-right, back-left, back-right. Two feet: left, right. */
  legs: readonly GroupRef[];
}

/** z of the front (+Z) surface of an ellipsoid (centre c, radii r) at (x, y), pulled in by `inset`. */
function fz(c: V3, r: V3, x: number, y: number, inset: number): number {
  const k = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, k)) - inset;
}

/** Soft cone with a rounded tip: base radius 1 at y = 0 (open, sits inside a body), tip at y = 1. */
function softCone(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = (i / 8) * 0.8;
    pts.push(new THREE.Vector2((1 - u) * (1 + 0.3 * u), u));
  }
  const r0 = 0.2 * 1.24;
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r0 * Math.cos(a), 0.8 + 0.2 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 14);
}

function Ball({ at, s, color, rot = NO_ROT }: { at: V3; s: number | V3; color: string; rot?: V3 }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} rotation={rot} />;
}

function Rod({ at, r, len, color, rot = NO_ROT }: { at: V3; r: number; len: number; color: string; rot?: V3 }) {
  const kit = useKit();
  return <mesh geometry={kit.capsule(r, len)} material={kit.clay(color)} position={at} rotation={rot} />;
}

/** Soft cone scaled to (base radius x, height, base radius z); +Y = tip before `rot`. */
function Cone({ at, s, color, rot = NO_ROT }: { at: V3; s: V3; color: string; rot?: V3 }) {
  const kit = useKit();
  return <mesh geometry={kit.geo("pet-soft-cone", softCone)} material={kit.clay(color)} position={at} scale={s} rotation={rot} />;
}

/** Ink smile: the lower `arc` of a thin torus, tipped back by `tilt` so it lies on the face. */
function Smile({ at, radius, tilt, arc = Math.PI * 0.8, tube = 0.0065 }: { at: V3; radius: number; tilt: number; arc?: number; tube?: number }) {
  const kit = useKit();
  return <mesh geometry={kit.torus(radius, tube, arc)} material={kit.clay(C.ink)} position={at} rotation={[tilt, 0, Math.PI + (Math.PI - arc) / 2]} />;
}

function Cheeks({ x, y, z, yaw, color = C.blush }: { x: number; y: number; z: number; yaw: number; color?: string }) {
  return (
    <>
      {SIDES.map((sd) => (
        <Ball key={sd} at={[sd * x, y, z]} s={[0.03, 0.018, 0.012]} color={color} rot={[0, sd * yaw, 0]} />
      ))}
    </>
  );
}

/** A joint: `inner` moves about `at`; children are in the joint's own frame (rest rotation `rot`). */
function Joint({ at, rot = NO_ROT, inner, children }: { at: V3; rot?: V3; inner: GroupRef; children: ReactNode }) {
  return (
    <group position={at} rotation={rot}>
      <group ref={inner}>{children}</group>
    </group>
  );
}

/** Like Joint, but children keep the parent's coordinates (a head holding many face parts). */
function Hinge({ at, inner, children }: { at: V3; inner: GroupRef; children: ReactNode }) {
  return (
    <group position={at}>
      <group ref={inner}>
        <group position={[-at[0], -at[1], -at[2]]}>{children}</group>
      </group>
    </group>
  );
}

/** Two ink eyes with a white highlight (light from the upper right). `eyes` scales about the eye line (blink, sleep, happy squint). */
function Eyes({ eyes, at, dx, size }: { eyes: GroupRef; at: V3; dx: number; size: V3 }) {
  const [a, b, c] = size;
  return (
    <Joint at={at} inner={eyes}>
      {SIDES.map((sd) => (
        <Ball key={sd} at={[sd * dx, 0, 0]} s={size} color={C.ink} />
      ))}
      {SIDES.map((sd) => (
        <Ball key={`hl${sd}`} at={[sd * dx + a * 0.3, b * 0.38, c * 0.75]} s={a * 0.36} color={C.white} />
      ))}
    </Joint>
  );
}

/** A capsule leg hanging from the hip at `at`, its bottom on the ground (y = 0). */
function Leg({ inner, at, r, len, color }: { inner: GroupRef; at: V3; r: number; len: number; color: string }) {
  return (
    <Joint at={at} inner={inner}>
      <Rod at={[0, len / 2 + r - at[1], 0]} r={r} len={len} color={color} />
    </Joint>
  );
}

function FourLegs({ r, x, front, back, hip, radius, len, color }: { r: Rig; x: number; front: number; back: number; hip: number; radius: number; len: number; color: string }) {
  const spots: [number, number][] = [
    [-x, front],
    [x, front],
    [-x, back],
    [x, back],
  ];
  return (
    <>
      {spots.map(([lx, lz], i) => (
        <Leg key={i} inner={r.legs[i]} at={[lx, hip, lz]} r={radius} len={len} color={color} />
      ))}
    </>
  );
}

/* ---------- ลูกหมา: ก้อนกลมสีเทาเงิน หูตกสีม่วงเทา ลิ้นชมพู ปลอกคอชมพูกระดิ่งทอง (22 ชิ้น) ---------- */

const PUP_HEAD_C: V3 = [0, 0.37, 0.06];
const PUP_HEAD_R: V3 = [0.16, 0.14, 0.14];

function Puppy({ r }: { r: Rig }) {
  const kit = useKit();
  return (
    <>
      <Ball at={[0, 0.17, -0.02]} s={[0.135, 0.115, 0.165]} color={PUP} />
      <FourLegs r={r} x={0.075} front={0.075} back={-0.11} hip={0.11} radius={0.042} len={0.05} color={PUP} />
      <Joint at={[0, 0.22, -0.17]} rot={[-0.7, 0, 0]} inner={r.tail}>
        <Rod at={[0, 0.045, 0]} r={0.024} len={0.05} color={PUP} />
        <Ball at={[0, 0.1, 0]} s={0.032} color={PUP_EAR} />
      </Joint>
      <mesh geometry={kit.torus(0.095, 0.02)} material={kit.clay(C.raspberry)} position={[0, 0.255, 0.03]} rotation={[Math.PI / 2 + 0.3, 0, 0]} />
      <Ball at={[0, 0.205, 0.148]} s={0.022} color={C.gold} />
      <Hinge at={[0, 0.27, 0.04]} inner={r.head}>
        <Ball at={PUP_HEAD_C} s={PUP_HEAD_R} color={PUP} />
        <Ball at={[0, 0.33, 0.175]} s={[0.075, 0.052, 0.05]} color={C.cream} />
        <Ball at={[0, 0.35, 0.222]} s={[0.026, 0.019, 0.018]} color={C.ink} />
        <Smile at={[0, 0.322, 0.222]} radius={0.022} tilt={0.2} />
        <Ball at={[0, 0.3, 0.214]} s={[0.02, 0.024, 0.01]} color={C.pink} rot={[0.3, 0, 0]} />
        <Eyes eyes={r.eyes} at={[0, 0.395, fz(PUP_HEAD_C, PUP_HEAD_R, 0.06, 0.395, 0.006)]} dx={0.06} size={[0.03, 0.037, 0.022]} />
        <Cheeks x={0.105} y={0.335} z={fz(PUP_HEAD_C, PUP_HEAD_R, 0.105, 0.335, 0.006)} yaw={0.6} />
        {/* floppy ears hang from the top of the head; they bounce up with every hop */}
        {SIDES.map((sd) => (
          <Joint key={sd} at={[sd * 0.135, 0.46, 0.03]} rot={[0.1, 0, sd * 0.25]} inner={sd < 0 ? r.left : r.right}>
            <Ball at={[sd * 0.012, -0.075, 0]} s={[0.048, 0.095, 0.032]} color={PUP_EAR} />
          </Joint>
        ))}
      </Hinge>
    </>
  );
}

/* ---------- ลูกแมว: ชมพูอ่อนลายเสือบนหน้าผาก หูตั้งด้านในชมพูเข้ม หนวด ปาก ω หางโค้งตั้ง (25 ชิ้น) ---------- */

const KIT_HEAD_C: V3 = [0, 0.35, 0.05];
const KIT_HEAD_R: V3 = [0.165, 0.13, 0.135];

function Kitten({ r }: { r: Rig }) {
  return (
    <>
      <Ball at={[0, 0.155, -0.02]} s={[0.12, 0.105, 0.15]} color={KIT} />
      <FourLegs r={r} x={0.065} front={0.07} back={-0.1} hip={0.1} radius={0.036} len={0.04} color={KIT} />
      {/* tail stands up behind and curls forward at the tip */}
      <Joint at={[0, 0.18, -0.155]} rot={[-0.35, 0, 0]} inner={r.tail}>
        <Rod at={[0, 0.07, 0]} r={0.024} len={0.1} color={KIT} />
        <Rod at={[0, 0.165, 0.03]} r={0.024} len={0.045} color={KIT_DEEP} rot={[0.9, 0, 0]} />
      </Joint>
      <Hinge at={[0, 0.26, 0.04]} inner={r.head}>
        <Ball at={KIT_HEAD_C} s={KIT_HEAD_R} color={KIT} />
        {SIDES.map((sd) => (
          <Joint key={sd} at={[sd * 0.095, 0.452, 0.03]} rot={[0, 0, -sd * 0.32]} inner={sd < 0 ? r.left : r.right}>
            <Cone at={[0, 0, 0]} s={[0.06, 0.11, 0.035]} color={KIT} />
            <Cone at={[0, 0.005, 0.022]} s={[0.035, 0.075, 0.012]} color={KIT_DEEP} />
          </Joint>
        ))}
        {SIDES.map((sd) => (
          <Ball key={`st${sd}`} at={[sd * 0.032, 0.47, 0.085]} s={[0.013, 0.012, 0.042]} color={KIT_DEEP} rot={[0.26, sd * 0.2, 0]} />
        ))}
        <Eyes eyes={r.eyes} at={[0, 0.36, fz(KIT_HEAD_C, KIT_HEAD_R, 0.065, 0.36, 0.006)]} dx={0.065} size={[0.033, 0.038, 0.022]} />
        <Ball at={[0, 0.325, fz(KIT_HEAD_C, KIT_HEAD_R, 0, 0.325, -0.004)]} s={[0.018, 0.013, 0.012]} color={C.raspberry} />
        {/* "ω" mouth: two small arcs meeting under the nose */}
        {SIDES.map((sd) => (
          <Smile key={`m${sd}`} at={[sd * 0.017, 0.317, 0.178]} radius={0.017} tilt={0.25} arc={Math.PI * 0.85} />
        ))}
        {SIDES.map((sd) => (
          <Rod key={`w${sd}`} at={[sd * 0.165, 0.315, 0.104]} r={0.0045} len={0.065} color={C.ink} rot={[0, sd * 0.3, Math.PI / 2]} />
        ))}
        <Cheeks x={0.112} y={0.33} z={fz(KIT_HEAD_C, KIT_HEAD_R, 0.112, 0.33, 0.006)} yaw={0.65} color={KIT_BLUSH} />
      </Hinge>
    </>
  );
}

/* ---------- ลูกเจี๊ยบ: ก้อนกลมสองชั้นสีเหลืองมะนาว ใส่หมวกเปลือกไข่ ปากชมพู ปีกเล็ก (19 ชิ้น) ---------- */

const CHICK_HEAD_C: V3 = [0, 0.33, 0.015];
const CHICK_HEAD_R: V3 = [0.13, 0.12, 0.12];

function Chick({ r }: { r: Rig }) {
  const kit = useKit();
  return (
    <>
      <Ball at={[0, 0.15, 0]} s={[0.165, 0.145, 0.155]} color={CHICK} />
      <Ball at={[0, 0.13, 0.085]} s={[0.11, 0.095, 0.08]} color={CHICK_LIGHT} />
      {SIDES.map((sd, i) => (
        <Joint key={sd} at={[sd * 0.06, 0.045, 0.03]} inner={r.legs[i]}>
          <Ball at={[0, -0.028, 0.03]} s={[0.04, 0.016, 0.055]} color={C.raspberry} />
        </Joint>
      ))}
      {SIDES.map((sd) => (
        <Joint key={`w${sd}`} at={[sd * 0.155, 0.19, -0.005]} rot={[0, 0, sd * 0.12]} inner={sd < 0 ? r.left : r.right}>
          <Ball at={[sd * 0.012, -0.045, 0]} s={[0.035, 0.07, 0.065]} color={CHICK_DEEP} />
        </Joint>
      ))}
      <Joint at={[0, 0.19, -0.14]} inner={r.tail}>
        <Ball at={[0, 0.015, -0.025]} s={[0.035, 0.028, 0.05]} color={CHICK_DEEP} rot={[-0.7, 0, 0]} />
      </Joint>
      <Hinge at={[0, 0.25, 0.01]} inner={r.head}>
        <Ball at={CHICK_HEAD_C} s={CHICK_HEAD_R} color={CHICK} />
        <Eyes eyes={r.eyes} at={[0, 0.345, fz(CHICK_HEAD_C, CHICK_HEAD_R, 0.052, 0.345, 0.005)]} dx={0.052} size={[0.028, 0.034, 0.02]} />
        <Cone at={[0, 0.315, fz(CHICK_HEAD_C, CHICK_HEAD_R, 0, 0.315, 0.012)]} s={[0.026, 0.045, 0.018]} color={C.pink} rot={[Math.PI / 2, 0, 0]} />
        <Cheeks x={0.085} y={0.31} z={fz(CHICK_HEAD_C, CHICK_HEAD_R, 0.085, 0.31, 0.005)} yaw={0.65} />
        {/* the little egg-shell cap it hatched with, tipped to one side */}
        <group position={[0.025, 0.43, -0.005]} rotation={[-0.12, 0, -0.32]}>
          <mesh geometry={kit.dome()} material={kit.clay(C.white)} scale={[0.085, 0.065, 0.085]} />
          <mesh geometry={kit.torus(0.085, 0.012)} material={kit.clay(C.creamShade)} rotation={[Math.PI / 2, 0, 0]} />
        </group>
        <Ball at={[-0.05, 0.452, 0.03]} s={[0.018, 0.032, 0.018]} color={CHICK_DEEP} rot={[0, 0, 0.5]} />
        <Ball at={[-0.074, 0.44, 0.0]} s={[0.015, 0.026, 0.015]} color={CHICK_DEEP} rot={[0, 0, 0.9]} />
      </Hinge>
    </>
  );
}

/* ---------- ไดโนน้อย: ยืนสองขา สีเขียวมิ้นต์ พุงเหลืองอ่อน หนามมนสีเหลืองตามหลัง แขนจิ๋ว หางยาว (22 ชิ้น) ---------- */

const DINO_HEAD_C: V3 = [0, 0.42, 0.04];
const DINO_HEAD_R: V3 = [0.145, 0.125, 0.14];

function Dino({ r }: { r: Rig }) {
  return (
    <>
      <Ball at={[0, 0.19, -0.01]} s={[0.135, 0.15, 0.13]} color={DINO} />
      <Ball at={[0, 0.17, 0.075]} s={[0.095, 0.11, 0.065]} color={DINO_BELLY} />
      {SIDES.map((sd, i) => (
        <Joint key={sd} at={[sd * 0.075, 0.09, 0]} inner={r.legs[i]}>
          <Ball at={[0, -0.045, 0.025]} s={[0.055, 0.05, 0.07]} color={DINO} />
        </Joint>
      ))}
      {SIDES.map((sd) => (
        <Joint key={`a${sd}`} at={[sd * 0.09, 0.23, 0.075]} rot={[-0.5, 0, sd * 0.35]} inner={sd < 0 ? r.left : r.right}>
          <Rod at={[0, -0.03, 0]} r={0.022} len={0.03} color={DINO} />
        </Joint>
      ))}
      <Cone at={[0, 0.295, -0.092]} s={[0.032, 0.06, 0.032]} color={DINO_SPIKE} rot={[-0.82, 0, 0]} />
      <Cone at={[0, 0.2, -0.133]} s={[0.03, 0.055, 0.03]} color={DINO_SPIKE} rot={[-1.5, 0, 0]} />
      {/* tail rests on the ground behind and sways side to side */}
      <Joint at={[0, 0.12, -0.12]} inner={r.tail}>
        <Ball at={[0, -0.01, -0.07]} s={[0.075, 0.06, 0.1]} color={DINO} />
        <Ball at={[0, -0.04, -0.17]} s={[0.045, 0.04, 0.075]} color={DINO} />
        <Cone at={[0, 0.035, -0.09]} s={[0.026, 0.045, 0.026]} color={DINO_SPIKE} rot={[-0.6, 0, 0]} />
      </Joint>
      <Hinge at={[0, 0.31, 0.02]} inner={r.head}>
        <Ball at={DINO_HEAD_C} s={DINO_HEAD_R} color={DINO} />
        <Ball at={[0, 0.385, 0.15]} s={[0.095, 0.07, 0.07]} color={DINO} />
        <Smile at={[0, 0.375, 0.216]} radius={0.035} tilt={0.1} arc={Math.PI * 0.75} />
        <Eyes eyes={r.eyes} at={[0, 0.445, fz(DINO_HEAD_C, DINO_HEAD_R, 0.062, 0.445, 0.006)]} dx={0.062} size={[0.03, 0.037, 0.022]} />
        <Cheeks x={0.11} y={0.4} z={fz(DINO_HEAD_C, DINO_HEAD_R, 0.11, 0.4, 0.006)} yaw={0.65} />
        <Cone at={[0, 0.53, 0]} s={[0.03, 0.055, 0.03]} color={DINO_SPIKE} rot={[-0.26, 0, 0]} />
        <Cone at={[0, 0.49, -0.065]} s={[0.028, 0.05, 0.028]} color={DINO_SPIKE} rot={[-0.85, 0, 0]} />
      </Hinge>
    </>
  );
}

/* ---------- มังกรน้อย: สี่ขา สีม่วงอ่อน ปีกจิ๋วสีชมพู เขามนสีครีม รูจมูกเล็ก ๆ หางปลายชมพู (25 ชิ้น) ---------- */

const DRAGON_HEAD_C: V3 = [0, 0.37, 0.07];
const DRAGON_HEAD_R: V3 = [0.15, 0.13, 0.13];

function Dragon({ r }: { r: Rig }) {
  return (
    <>
      <Ball at={[0, 0.17, -0.03]} s={[0.135, 0.12, 0.165]} color={DRAGON} />
      <Ball at={[0, 0.15, 0.07]} s={[0.095, 0.085, 0.08]} color={DRAGON_BELLY} />
      <FourLegs r={r} x={0.075} front={0.06} back={-0.12} hip={0.11} radius={0.04} len={0.05} color={DRAGON} />
      {/* tiny round wings on the back, tips up and out */}
      {SIDES.map((sd) => (
        <Joint key={sd} at={[sd * 0.09, 0.265, -0.06]} rot={[-0.25, 0, 0]} inner={sd < 0 ? r.left : r.right}>
          <Ball at={[sd * 0.085, 0.045, 0]} s={[0.095, 0.06, 0.013]} color={C.pink} rot={[0, 0, sd * 0.55]} />
        </Joint>
      ))}
      <Cone at={[0, 0.28, -0.08]} s={[0.025, 0.045, 0.025]} color={C.pink} rot={[-0.23, 0, 0]} />
      <Cone at={[0, 0.248, -0.148]} s={[0.022, 0.04, 0.022]} color={C.pink} rot={[-0.66, 0, 0]} />
      <Joint at={[0, 0.16, -0.18]} inner={r.tail}>
        <Rod at={[0, 0.026, -0.06]} r={0.03} len={0.07} color={DRAGON} rot={[-1.16, 0, 0]} />
        <Cone at={[0, 0.05, -0.115]} s={[0.035, 0.055, 0.022]} color={C.pink} rot={[-1.16, 0, 0]} />
      </Joint>
      <Hinge at={[0, 0.27, 0.05]} inner={r.head}>
        <Ball at={DRAGON_HEAD_C} s={DRAGON_HEAD_R} color={DRAGON} />
        {/* a longer, lower muzzle (not a round pig snout) with tiny nostrils on top */}
        <Ball at={[0, 0.33, 0.17]} s={[0.08, 0.055, 0.075]} color={DRAGON} />
        {SIDES.map((sd) => (
          <Ball key={`n${sd}`} at={[sd * 0.028, 0.36, 0.225]} s={[0.009, 0.006, 0.006]} color={C.ink} />
        ))}
        <Smile at={[0, 0.322, 0.238]} radius={0.032} tilt={0.35} />
        <Eyes eyes={r.eyes} at={[0, 0.395, fz(DRAGON_HEAD_C, DRAGON_HEAD_R, 0.065, 0.395, 0.006)]} dx={0.065} size={[0.032, 0.038, 0.022]} />
        <Cheeks x={0.105} y={0.345} z={fz(DRAGON_HEAD_C, DRAGON_HEAD_R, 0.105, 0.345, 0.006)} yaw={0.65} />
        {SIDES.map((sd) => (
          <Cone key={`h${sd}`} at={[sd * 0.062, 0.475, 0.04]} s={[0.03, 0.08, 0.03]} color={C.cream} rot={[-0.4, 0, -sd * 0.35]} />
        ))}
      </Hinge>
    </>
  );
}

/* ---------- ยูนิคอร์นน้อย: ขาวทั้งตัว เขาทอง แผงคอและหางเป็นลูกกลมสีรุ้ง (ไม่มีส้ม/น้ำเงิน) (25 ชิ้น) ---------- */

const UNI_HEAD_C: V3 = [0, 0.4, 0.1];
const UNI_HEAD_R: V3 = [0.13, 0.125, 0.13];

function Unicorn({ r }: { r: Rig }) {
  return (
    <>
      <Ball at={[0, 0.22, -0.03]} s={[0.125, 0.105, 0.165]} color={C.white} />
      <FourLegs r={r} x={0.07} front={0.06} back={-0.12} hip={0.16} radius={0.036} len={0.1} color={C.white} />
      <Ball at={[0, 0.335, -0.07]} s={0.038} color={RAINBOW[4]} />
      <Joint at={[0, 0.25, -0.185]} inner={r.tail}>
        <Ball at={[0, 0, -0.03]} s={0.04} color={RAINBOW[0]} />
        <Ball at={[0, -0.045, -0.06]} s={0.036} color={RAINBOW[1]} />
        <Ball at={[0, -0.09, -0.07]} s={0.032} color={RAINBOW[2]} />
      </Joint>
      <Hinge at={[0, 0.31, 0.08]} inner={r.head}>
        <Ball at={UNI_HEAD_C} s={UNI_HEAD_R} color={C.white} />
        <Ball at={[0, 0.355, 0.2]} s={[0.085, 0.065, 0.06]} color={UNI_MUZZLE} />
        <Smile at={[0, 0.34, 0.256]} radius={0.028} tilt={0.1} />
        <Eyes eyes={r.eyes} at={[0, 0.42, fz(UNI_HEAD_C, UNI_HEAD_R, 0.06, 0.42, 0.006)]} dx={0.06} size={[0.03, 0.037, 0.022]} />
        <Cheeks x={0.097} y={0.375} z={fz(UNI_HEAD_C, UNI_HEAD_R, 0.097, 0.375, 0.006)} yaw={0.65} />
        {SIDES.map((sd) => (
          <Joint key={sd} at={[sd * 0.075, 0.49, 0.06]} rot={[0, 0, -sd * 0.25]} inner={sd < 0 ? r.left : r.right}>
            <Cone at={[0, 0, 0]} s={[0.03, 0.06, 0.02]} color={C.white} />
          </Joint>
        ))}
        <Cone at={[0, 0.505, 0.14]} s={[0.026, 0.1, 0.026]} color={C.gold} rot={[0.35, 0, 0]} />
        {/* rainbow mane from the forelock over the back of the head */}
        <Ball at={[0, 0.515, 0.085]} s={0.038} color={RAINBOW[0]} />
        <Ball at={[0, 0.5, 0]} s={0.042} color={RAINBOW[1]} />
        <Ball at={[0, 0.455, -0.045]} s={0.042} color={RAINBOW[2]} />
        <Ball at={[0, 0.395, -0.062]} s={0.04} color={RAINBOW[3]} />
      </Hinge>
    </>
  );
}

function Body({ kind, r }: { kind: PetKind; r: Rig }) {
  switch (kind) {
    case "puppy":
      return <Puppy r={r} />;
    case "kitten":
      return <Kitten r={r} />;
    case "chick":
      return <Chick r={r} />;
    case "dino":
      return <Dino r={r} />;
    case "dragon":
      return <Dragon r={r} />;
    case "unicorn":
      return <Unicorn r={r} />;
  }
}

/**
 * สัตว์เลี้ยงตัวจิ๋วที่ฟักจากไข่ (ลูกหมา ลูกแมว ลูกเจี๊ยบ ไดโน มังกร ยูนิคอร์น) เดินตามตัวละครหลัก
 * ปั้นแบบของเล่นดินปั้นชุดเดียวกับเพื่อนสัตว์: ตาหมึกมีจุดแสง แก้มชมพู ยิ้มเล็ก ๆ — ยืนบน y = 0 หันหน้า +Z สูงราว 0.5–0.6
 * ท่า: หายใจ กะพริบตา หันมองรอบ ๆ, เดินกระโดดดึ๋ง ๆ (จังหวะตาม speed), กระโดดหมุนตัวดีใจเมื่อ cheer เพิ่ม,
 * นอน (หลับตา หายใจช้า หมอบ/นั่ง) — มังกรกับยูนิคอร์นน่ารัก ไม่มีท่าน่ากลัว
 * reduced: ทุกท่าขนาดครึ่งเดียว (CALM) กระโดดดีใจช้าลงและไม่หมุนตัว
 * ฉากเป็นผู้หมุน/เลื่อนตัวทั้งตัว (กลุ่มนอกสุด) ไฟล์นี้ขยับเฉพาะชิ้นข้างใน
 */
export function Pet({ kind, drive }: { kind: PetKind; drive: RefObject<PetDrive> }): ReactElement {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const leg0 = useRef<THREE.Group>(null);
  const leg1 = useRef<THREE.Group>(null);
  const leg2 = useRef<THREE.Group>(null);
  const leg3 = useRef<THREE.Group>(null);
  const st = useRef({
    ready: false,
    t: 0,
    phase: 0,
    walk: 0,
    sleep: 0,
    wag: 0,
    blink: 0,
    blinkNext: 2,
    lookNext: 1,
    lookYaw: 0,
    lookPitch: 0,
    yaw: 0,
    pitch: 0,
    cheerT: -1,
    cheerSeen: 0,
    cheerQ: false,
    spinDir: 1,
  });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    if (!s.ready) {
      // first frame: random phase so pets side by side never move in step; cheers from before mount are not replayed
      s.ready = true;
      s.t = Math.random() * 4;
      s.blinkNext = 1 + Math.random() * 2;
      s.lookNext = 0.8 + Math.random() * 1.5;
      s.cheerSeen = d.cheer;
      s.sleep = d.sleep ? 1 : 0;
    }
    const motion = d.reduced ? CALM.amp : 1;
    s.t += dt;
    s.sleep = damp(s.sleep, d.sleep ? 1 : 0, 2.5, dt);
    s.walk = damp(s.walk, d.sleep ? 0 : Math.min(1.6, Math.max(0, d.speed)), 6, dt);
    const W = Math.min(1, s.walk);
    // hop-walk: one hop per half turn of the phase; faster with speed
    s.phase += dt * Math.PI * (2 + 1.4 * s.walk);
    const hp = s.phase % Math.PI;
    const step = Math.sin(s.phase);

    // happy hop (+ spin): crouch → up → land; a cheer that lands mid-hop plays right after it
    if (d.cheer !== s.cheerSeen) {
      s.cheerSeen = d.cheer;
      if (s.cheerT < 0) {
        s.cheerT = 0;
        s.spinDir = -s.spinDir;
      } else s.cheerQ = true;
    }
    const dur = CHEER_S * (d.reduced ? CALM.slow : 1);
    if (s.cheerT >= 0) {
      s.cheerT += dt;
      if (s.cheerT >= dur) {
        s.cheerT = s.cheerQ ? 0 : -1;
        if (s.cheerQ) s.spinDir = -s.spinDir;
        s.cheerQ = false;
      }
    }
    const on = s.cheerT >= 0;
    const cu = on ? s.cheerT / dur : 1;
    const crouch = on && cu < 0.16 ? bump(cu / 0.16) * motion : 0;
    const air = on && cu >= 0.16 && cu < 0.7 ? bump((cu - 0.16) / 0.54) * motion : 0;
    const land = on && cu >= 0.7 && cu < 0.9 ? bump((cu - 0.7) / 0.2) * motion : 0;
    const joy = on ? smooth(cu, 0, 0.1) * (1 - smooth(cu, 0.8, 1)) : 0;
    const spin = on && !d.reduced ? easeInOutSine((cu - 0.16) / 0.54) * Math.PI * 2 * s.spinDir : 0;
    // sleeping pose, briefly lifted while a cheer plays
    const zz = s.sleep * (1 - joy);

    s.blinkNext -= dt;
    if (s.blinkNext <= 0) {
      s.blink = 0.13;
      s.blinkNext = 2.2 + Math.random() * 2.8;
    }
    s.blink -= dt;
    const shut = Math.max(zz, s.blink > 0 ? 1 : 0);
    eyes.current?.scale.set(1, (1 - 0.88 * shut) * (1 - 0.35 * joy * (1 - shut)), 1);

    // look around now and then (less while walking, not while sleeping or cheering)
    s.lookNext -= dt;
    if (s.lookNext <= 0) {
      s.lookNext = 1.4 + Math.random() * 2.6;
      s.lookYaw = (Math.random() * 2 - 1) * 0.55;
      s.lookPitch = (Math.random() * 2 - 1) * 0.12;
    }
    const lookK = (1 - zz) * (1 - 0.7 * W) * (1 - joy) * motion;
    s.yaw = damp(s.yaw, s.lookYaw * lookK, 4, dt);
    s.pitch = damp(s.pitch, s.lookPitch * lookK, 4, dt);

    const tune = TUNE[kind];
    const hop = Math.sin(hp) * tune.hop * W * motion;
    const contact = Math.pow(1 - Math.sin(hp), 6) * W * motion;
    const breathe = ((1 - zz) * Math.sin(s.t * 2.4) * 0.016 + zz * Math.sin(s.t * 1.25) * 0.035) * motion;
    const g = rig.current;
    if (g) {
      const sy = 1 + breathe - 0.07 * contact - 0.14 * crouch - 0.12 * land + 0.06 * air - 0.05 * zz;
      const sxz = 1 - breathe * 0.5 + 0.04 * contact + 0.08 * crouch + 0.08 * land - 0.02 * air + 0.03 * zz;
      g.scale.set(sxz, sy, sxz);
      g.position.set(0, hop + 0.2 * air - (tune.biped ? 0.03 : 0.05) * zz, 0);
      // four legs rock nose-up / nose-down with each hop; two feet waddle side to side
      const pitch = tune.biped ? 0 : -Math.cos(hp) * 0.07 * W * motion;
      const roll = tune.biped ? step * 0.09 * W * motion : 0;
      g.rotation.set(pitch - 0.08 * air, spin, roll);
    }
    head.current?.rotation.set(s.pitch + Math.sin(hp * 2) * 0.04 * W * motion + 0.36 * zz - 0.22 * joy * motion, s.yaw, -s.yaw * 0.3 + 0.14 * zz);

    const legs = [leg0.current, leg1.current, leg2.current, leg3.current];
    if (tune.biped) {
      // alternate feet lift and swing forward; asleep = sitting with feet out front
      for (let i = 0; i < 2; i++) {
        const l = legs[i];
        if (!l) continue;
        const sg = i === 0 ? 1 : -1;
        l.position.y = Math.max(0, sg * step) * 0.035 * W * motion;
        l.rotation.x = -sg * step * 0.35 * W * motion - 1.0 * zz + 0.25 * air;
      }
    } else {
      // trot in diagonal pairs; legs tuck in the happy hop; asleep = lying down, front paws forward
      const swing = step * 0.55 * W * motion;
      for (let i = 0; i < 4; i++) {
        const l = legs[i];
        if (!l) continue;
        const front = i < 2;
        const diag = i === 0 || i === 3 ? 1 : -1;
        l.rotation.x = diag * swing + (front ? -0.6 : 0.6) * air + (front ? -1.25 : 1.15) * zz;
      }
    }

    // paired parts and tail, per animal. Hanging parts (ears, wings, arms): left −raise / right +raise = up and out.
    const L = left.current;
    const R = right.current;
    const tl = tail.current;
    switch (kind) {
      case "puppy": {
        const raise = (0.35 * Math.sin(hp) * W + 0.05 * Math.sin(s.t * 1.7) * (1 - zz)) * motion + 0.7 * air - 0.1 * zz;
        L?.rotation.set(0, 0, -raise);
        R?.rotation.set(0, 0, raise);
        s.wag += dt * (10 + 8 * W + 10 * joy) * (1 - 0.8 * zz);
        tl?.rotation.set(0.25 * zz, 0, Math.sin(s.wag) * (0.35 + 0.15 * W + 0.25 * joy) * motion * (1 - 0.85 * zz));
        break;
      }
      case "kitten": {
        // upright ears: outward = +z on the left; a quick flick now and then
        const flickL = Math.pow(Math.max(0, Math.sin(s.t * 0.83)), 40) * 0.4 * motion * (1 - zz);
        const flickR = Math.pow(Math.max(0, Math.sin(s.t * 0.71 + 2)), 40) * 0.4 * motion * (1 - zz);
        const out = 0.25 * joy * motion;
        L?.rotation.set(-0.4 * zz, 0, out + flickL);
        R?.rotation.set(-0.4 * zz, 0, -out - flickR);
        tl?.rotation.set(Math.sin(s.t * 1.1) * 0.08 * motion + 0.5 * zz, 0, Math.sin(s.t * 1.5) * 0.2 * motion * (1 - zz) + Math.sin(s.t * 14) * 0.2 * joy * motion);
        break;
      }
      case "chick": {
        const raise = (0.5 - 0.5 * Math.cos(s.t * 26)) * 1.1 * joy * motion + (0.5 - 0.5 * Math.cos(s.phase * 2)) * 0.3 * W * motion - 0.05 * zz;
        L?.rotation.set(0, 0, -raise);
        R?.rotation.set(0, 0, raise);
        tl?.rotation.set(-0.35 * joy * motion + Math.sin(s.phase * 2) * 0.2 * W * motion, 0, Math.sin(s.t * 16) * 0.3 * joy * motion);
        break;
      }
      case "dino": {
        // tiny arms wave up in the happy hop and swing with the steps
        const raise = (1.1 + Math.sin(s.t * 18) * 0.25) * joy * motion;
        const swing = step * 0.4 * W * motion;
        L?.rotation.set(swing, 0, -raise);
        R?.rotation.set(-swing, 0, raise);
        tl?.rotation.set(0, step * 0.25 * W * motion + Math.sin(s.t * 1.3) * 0.08 * motion * (1 - zz) + Math.sin(s.t * 14) * 0.25 * joy * motion + 0.45 * zz, 0);
        break;
      }
      case "dragon": {
        // little wings: slow idle flap, quicker while walking, fluttering in the happy hop, folded when asleep
        const flap =
          Math.sin(s.t * 2.4) * 0.12 * motion * (1 - zz) + Math.sin(s.phase * 2) * 0.22 * W * motion + (Math.sin(s.t * 20) * 0.45 + 0.25) * joy * motion - 0.45 * zz;
        L?.rotation.set(0, 0, -flap);
        R?.rotation.set(0, 0, flap);
        tl?.rotation.set(Math.sin(s.t * 12) * 0.12 * joy * motion, Math.sin(s.t * 1.6) * 0.18 * motion * (1 - zz) + step * 0.2 * W * motion + 0.4 * zz, 0);
        break;
      }
      case "unicorn": {
        const out = 0.2 * joy * motion + Math.sin(s.t * 1.3) * 0.05 * motion * (1 - zz);
        L?.rotation.set(-0.35 * zz, 0, out);
        R?.rotation.set(-0.35 * zz, 0, -out);
        tl?.rotation.set(0, 0, Math.sin(s.t * 1.8) * 0.22 * motion * (1 - 0.7 * zz) + Math.sin(s.t * 16) * 0.3 * joy * motion);
        break;
      }
    }
  });

  const parts: Rig = { head, eyes, left, right, tail, legs: [leg0, leg1, leg2, leg3] };
  return (
    <group>
      <group ref={rig}>
        <Body kind={kind} r={parts} />
      </group>
    </group>
  );
}
