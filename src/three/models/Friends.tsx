import { useFrame } from "@react-three/fiber";
import { useRef, type ReactElement, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { bump, damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";

type V3 = [number, number, number];
type GroupRef = RefObject<THREE.Group | null>;

export type FriendKind = "crab" | "dog" | "fish" | "bird" | "turtle";
// part of this module's public API (scenes pick friends from it); editing this file just reloads instead of hot-swapping
// oxlint-disable-next-line react/only-export-components
export const FRIEND_KINDS: FriendKind[] = ["crab", "dog", "fish", "bird", "turtle"];

export interface FriendPose {
  /** The child is speaking right now: perk up (eyes a bit wider, ears/antennae/crest up, slight lean forward). */
  listening: boolean;
  /** Incremented by the scene each time this friend "hears" the child: play one short (~0.8 s) happy bounce/wiggle/wave. */
  happy: number;
  /** Incremented when a call could not be used (too quiet, device trouble): one short (~0.8 s) gentle head tilt, curious, never sad. */
  asking: number;
  /** Reduced motion: no idle bob/breathing and no gesture motion — a calm static friendly pose. */
  reduced: boolean;
}

/*
 * สีเฉพาะของเพื่อนสัตว์ (พาสเทล) — ไม่มีน้ำเงิน (oral) หรือส้ม (nasal):
 * hue ทุกสีอยู่นอกช่วง ~15°–45° และ ~200°–235° (ค่าในวงเล็บ = hue โดยประมาณ)
 */
const CRAB_SHELL = "#f7788c"; // coral pink (351°)
const CRAB_BODY = "#ffa7b3"; // light coral pink (352°)
const DOG_FUR = "#f2e8c4"; // light sand, low saturation (47°)
const DOG_SPOT = "#946660"; // cocoa ears / patches (7°)
const FISH = "#cdbaf6"; // lilac (259°)
const BIRD = "#ffe680"; // butter yellow (48°)
const BIRD_LIGHT = "#fff6cf"; // pale butter belly (49°)
const BIRD_WING = "#f8dd6a"; // a shade deeper for wings / feathers (49°)
const SHELL = "#74c06a"; // turtle shell green (113°)
const SHELL_PLATE = "#a9dc8c"; // lighter shell plates (98°)
const SHELL_RIM = "#e3efb0"; // pale lime rim and belly (71°)

const NO_ROT: V3 = [0, 0, 0];
const SIDES = [-1, 1] as const;
const HAPPY_S = 0.8;
const ASK_S = 0.8;
const smooth = THREE.MathUtils.smoothstep;

/** Per-animal size of the happy hop and of the forward lean while listening. */
const TUNE: Record<FriendKind, { hop: number; lean: number }> = {
  crab: { hop: 0.07, lean: 0.07 },
  dog: { hop: 0.11, lean: 0.1 },
  fish: { hop: 0.14, lean: 0.08 },
  bird: { hop: 0.13, lean: 0.12 },
  turtle: { hop: 0.06, lean: 0.05 },
};

/** Animated parts every friend may have (unused ones stay null). Each ref'd group rests at identity; its parent holds the rest pose. */
interface Rig {
  head: GroupRef;
  eyes: GroupRef;
  left: GroupRef;
  right: GroupRef;
  tail: GroupRef;
  top: GroupRef;
}

/** z of the front (+Z) surface of an ellipsoid (centre c, radii r) at (x, y), pulled in by `inset`. */
function fz(c: V3, r: V3, x: number, y: number, inset: number): number {
  const k = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2;
  return c[2] + r[2] * Math.sqrt(Math.max(0, k)) - inset;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Lays a flat part (thin along its local Y) on an ellipsoid: direction = yaw from +Z and pitch up; `lift` moves it along the normal. */
function onSurface(c: V3, r: V3, yaw: number, pitch: number, lift: number): { at: V3; rot: V3 } {
  const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const n = new THREE.Vector3(d.x / r[0], d.y / r[1], d.z / r[2]).normalize();
  const p = new THREE.Vector3(c[0] + r[0] * d.x, c[1] + r[1] * d.y, c[2] + r[2] * d.z).addScaledVector(n, lift);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, n));
  return { at: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] };
}

function Part({ at, s, color, rot = NO_ROT }: { at: V3; s: number | V3; color: string; rot?: V3 }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} rotation={rot} />;
}

function Rod({ at, r, len, color, rot = NO_ROT }: { at: V3; r: number; len: number; color: string; rot?: V3 }) {
  const kit = useKit();
  return <mesh geometry={kit.capsule(r, len)} material={kit.clay(color)} position={at} rotation={rot} />;
}

/** Ink smile: the lower `arc` of a thin torus, tipped back by `tilt` so it lies on the face. */
function Smile({ at, radius, tilt, arc = Math.PI * 0.8, tube = 0.013 }: { at: V3; radius: number; tilt: number; arc?: number; tube?: number }) {
  const kit = useKit();
  return <mesh geometry={kit.torus(radius, tube, arc)} material={kit.clay(C.ink)} position={at} rotation={[tilt, 0, Math.PI + (Math.PI - arc) / 2]} />;
}

function Cheeks({ x, y, z, yaw, color = C.blush }: { x: number; y: number; z: number; yaw: number; color?: string }) {
  return (
    <>
      <Part at={[-x, y, z]} s={[0.052, 0.033, 0.023]} color={color} rot={[0, -yaw, 0]} />
      <Part at={[x, y, z]} s={[0.052, 0.033, 0.023]} color={color} rot={[0, yaw, 0]} />
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

/** Two ink eyes, each with a small white highlight (light from the upper right). `eyes` scales about the eye line (blink, widen). */
function InkEyes({ eyes, at, dx, size }: { eyes: GroupRef; at: V3; dx: number; size: V3 }) {
  const [a, b, c] = size;
  const hl = a * 0.34;
  return (
    <Joint at={at} inner={eyes}>
      <Part at={[-dx, 0, 0]} s={size} color={C.ink} />
      <Part at={[dx, 0, 0]} s={size} color={C.ink} />
      <Part at={[-dx + a * 0.32, b * 0.4, c * 0.72]} s={hl} color={C.white} />
      <Part at={[dx + a * 0.32, b * 0.4, c * 0.72]} s={hl} color={C.white} />
    </Joint>
  );
}

/* ---------- ปู: กระดองชมพูปะการัง ตาบนก้าน ก้ามมนสองข้าง ขาสามคู่ (25 ชิ้น) ---------- */

const CRAB_C: V3 = [0, 0.27, 0];
const CRAB_R: V3 = [0.3, 0.19, 0.25];
/** [z, foot splay] for the three legs on each side. */
const CRAB_LEGS: [number, number][] = [
  [0.1, 0.45],
  [-0.02, 0],
  [-0.13, -0.45],
];

function Crab({ r }: { r: Rig }) {
  const kit = useKit();
  return (
    <>
      <Part at={CRAB_C} s={CRAB_R} color={CRAB_BODY} />
      {/* deeper-pink top shell over the lighter body: its rim reads as a crab shell from every side */}
      <mesh geometry={kit.dome()} material={kit.clay(CRAB_SHELL)} position={[0, 0.29, 0]} scale={[0.315, 0.185, 0.265]} />
      {SIDES.flatMap((sd) =>
        CRAB_LEGS.map(([z, splay]) => (
          <Rod key={`${sd}|${z}`} at={[sd * 0.3, 0.092, z]} r={0.03} len={0.15} color={CRAB_SHELL} rot={[0, -sd * splay, sd * 0.87]} />
        )),
      )}
      <Cheeks x={0.17} y={0.25} z={fz(CRAB_C, CRAB_R, 0.17, 0.25, 0.012)} yaw={0.53} color={C.raspberry} />
      <Smile at={[0, 0.245, 0.25]} radius={0.05} tilt={0.35} tube={0.014} />
      {/* rounded pincers held up beside the face (palm + one finger = a soft "V", nothing sharp) */}
      {SIDES.map((sd) => (
        <Joint key={sd} at={[sd * 0.25, 0.26, 0.1]} rot={[0.25, 0, 0]} inner={sd < 0 ? r.left : r.right}>
          <Rod at={[sd * 0.033, 0.07, 0]} r={0.042} len={0.07} color={CRAB_SHELL} rot={[0, 0, -sd * 0.44]} />
          <Part at={[sd * 0.085, 0.19, 0]} s={[0.088, 0.115, 0.08]} color={CRAB_SHELL} rot={[0, 0, -sd * 0.3]} />
          <Part at={[sd * 0.012, 0.235, 0]} s={[0.046, 0.075, 0.052]} color={CRAB_SHELL} rot={[0, 0, sd * 0.5]} />
        </Joint>
      ))}
      {/* eye stalks = the crab's "antennae": they rise while listening and tilt when asking */}
      <Joint at={[0, 0.4, 0.06]} inner={r.top}>
        {SIDES.map((sd) => (
          <Rod key={sd} at={[sd * 0.095, 0.13, 0.02]} r={0.028} len={0.14} color={CRAB_SHELL} rot={[0, 0, -sd * 0.12]} />
        ))}
        <Joint at={[0, 0.27, 0.02]} inner={r.eyes}>
          {SIDES.map((sd) => (
            <group key={sd}>
              <mesh geometry={kit.sphere()} material={kit.clay(C.white)} position={[sd * 0.1, 0, 0]} scale={0.075} />
              <Part at={[sd * 0.1, 0.002, 0.06]} s={[0.046, 0.054, 0.03]} color={C.ink} />
              <Part at={[sd * 0.1 + 0.015, 0.023, 0.083]} s={0.016} color={C.white} />
            </group>
          ))}
        </Joint>
      </Joint>
    </>
  );
}

/* ---------- หมา: ลูกหมานั่ง ขนสีทรายอ่อน หูตกสีโกโก้ ปลอกคอชมพู หางกระดิก (24 ชิ้น) ---------- */

const DOG_C: V3 = [0, 0.24, -0.03];
const DOG_R: V3 = [0.25, 0.24, 0.23];
const DOG_HEAD_C: V3 = [0, 0.64, 0.03];
const DOG_HEAD_R: V3 = [0.25, 0.215, 0.215];
const DOG_SADDLE = onSurface(DOG_C, DOG_R, Math.PI + 0.3, 0.32, -0.012);

function Dog({ r }: { r: Rig }) {
  const kit = useKit();
  return (
    <>
      <Part at={DOG_C} s={DOG_R} color={DOG_FUR} />
      <Part at={[0, 0.27, 0.11]} s={[0.15, 0.16, 0.11]} color={C.cream} />
      {SIDES.map((sd) => (
        <group key={sd}>
          <Rod at={[sd * 0.1, 0.12, 0.14]} r={0.055} len={0.13} color={DOG_FUR} />
          <Part at={[sd * 0.18, 0.1, 0]} s={[0.1, 0.1, 0.16]} color={DOG_FUR} />
        </group>
      ))}
      <Part at={DOG_SADDLE.at} s={[0.11, 0.03, 0.095]} color={DOG_SPOT} rot={DOG_SADDLE.rot} />
      <mesh geometry={kit.torus(0.14, 0.03)} material={kit.clay(C.raspberry)} position={[0, 0.445, -0.01]} rotation={[Math.PI / 2, 0, 0]} />
      <Part at={[0, 0.415, 0.16]} s={0.036} color={BIRD} />
      <Joint at={[0, 0.15, -0.22]} rot={[-0.75, 0, 0]} inner={r.tail}>
        <Rod at={[0, 0.12, 0]} r={0.042} len={0.16} color={DOG_FUR} />
        <Part at={[0, 0.24, 0]} s={0.055} color={DOG_SPOT} />
      </Joint>
      <Hinge at={[0, 0.5, 0.03]} inner={r.head}>
        <Part at={DOG_HEAD_C} s={DOG_HEAD_R} color={DOG_FUR} />
        <Part at={[0, 0.565, 0.195]} s={[0.115, 0.08, 0.085]} color={C.cream} />
        <Part at={[0, 0.605, 0.26]} s={[0.045, 0.032, 0.03]} color={C.ink} />
        <Smile at={[0, 0.575, 0.28]} radius={0.04} tilt={0.15} arc={Math.PI * 0.75} tube={0.012} />
        {/* cocoa patch around one eye (behind the eye, in front of the head) */}
        <Part at={[0.105, 0.68, 0.18]} s={[0.085, 0.085, 0.055]} color={DOG_SPOT} rot={[0, 0.35, 0]} />
        <InkEyes eyes={r.eyes} at={[0, 0.67, fz(DOG_HEAD_C, DOG_HEAD_R, 0.1, 0.67, 0.008)]} dx={0.1} size={[0.048, 0.058, 0.034]} />
        <Cheeks x={0.165} y={0.575} z={fz(DOG_HEAD_C, DOG_HEAD_R, 0.165, 0.575, 0.008)} yaw={0.6} />
        {/* floppy ears hang from the top of the head; they lift outward while listening */}
        {SIDES.map((sd) => (
          <Joint key={sd} at={[sd * 0.2, 0.75, 0.02]} rot={[0, 0, sd * 0.3]} inner={sd < 0 ? r.left : r.right}>
            <Part at={[0, -0.11, 0]} s={[0.075, 0.15, 0.055]} color={DOG_SPOT} />
          </Joint>
        ))}
      </Hinge>
    </>
  );
}

/* ---------- ปลา: ปลาม่วงอ่อนโผล่จากน้ำ ครีบชมพู หางงอขึ้นด้านหลัง (18 ชิ้น) ---------- */

const FISH_C: V3 = [0, 0.3, 0];
const FISH_R: V3 = [0.27, 0.3, 0.26];
const FISH_SPOTS = (
  [
    [Math.PI, 0.5],
    [Math.PI - 0.55, 0.22],
    [Math.PI + 0.55, 0.22],
  ] as const
).map(([yaw, pitch]) => onSurface(FISH_C, FISH_R, yaw, pitch, -0.008));

function Fish({ r }: { r: Rig }) {
  return (
    // the whole fish tilts about its middle (asking); the rig bobs it at the water line
    <Hinge at={[0, 0.28, 0]} inner={r.head}>
      <Part at={FISH_C} s={FISH_R} color={FISH} />
      <Part at={[0, 0.15, 0.1]} s={[0.2, 0.15, 0.17]} color={C.lilacLight} />
      {FISH_SPOTS.map((p, i) => (
        <Part key={i} at={p.at} s={[0.05, 0.018, 0.05]} color={C.pink} rot={p.rot} />
      ))}
      <InkEyes eyes={r.eyes} at={[0, 0.38, fz(FISH_C, FISH_R, 0.1, 0.38, 0.01)]} dx={0.1} size={[0.055, 0.066, 0.038]} />
      <Cheeks x={0.17} y={0.29} z={fz(FISH_C, FISH_R, 0.17, 0.29, 0.008)} yaw={0.55} />
      <Smile at={[0, 0.31, 0.2605]} radius={0.045} tilt={0.05} />
      {SIDES.map((sd) => (
        <Joint key={sd} at={[sd * 0.24, 0.24, 0.06]} rot={[0, sd * 0.3, -sd * 0.4]} inner={sd < 0 ? r.left : r.right}>
          <Part at={[sd * 0.08, 0, 0]} s={[0.1, 0.06, 0.025]} color={C.pink} />
        </Joint>
      ))}
      {/* the body arches under the water and the tail pops up behind it, flicked to one side */}
      <Joint at={[0, 0.0, -0.3]} rot={[-0.25, 0, 0.25]} inner={r.tail}>
        <Part at={[0, 0.11, 0]} s={[0.075, 0.16, 0.068]} color={FISH} />
        {SIDES.map((sd) => (
          <Part key={sd} at={[sd * 0.072, 0.36, 0]} s={[0.066, 0.145, 0.03]} color={C.pink} rot={[0, 0, -sd * 0.6]} />
        ))}
      </Joint>
      <Joint at={[0, 0.57, -0.07]} rot={[-0.5, 0, 0]} inner={r.top}>
        <Part at={[0, 0.06, 0]} s={[0.026, 0.085, 0.14]} color={C.pink} />
      </Joint>
    </Hinge>
  );
}

/* ---------- นก: นกกลมสีเหลืองเนย จะงอยปากชมพู หงอน ปีก หางพัด (20 ชิ้น) ---------- */

const BIRD_C: V3 = [0, 0.34, 0];
const BIRD_R: V3 = [0.3, 0.31, 0.28];

function Bird({ r }: { r: Rig }) {
  return (
    <>
      {SIDES.map((sd) => (
        <Part key={sd} at={[sd * 0.09, 0.035, 0.07]} s={[0.07, 0.045, 0.09]} color={C.raspberry} />
      ))}
      {/* round body = head: the whole ball tilts for the curious "hm?" */}
      <Hinge at={BIRD_C} inner={r.head}>
        <Part at={BIRD_C} s={BIRD_R} color={BIRD} />
        <Part at={[0, 0.26, 0.13]} s={[0.21, 0.2, 0.16]} color={BIRD_LIGHT} />
        <InkEyes eyes={r.eyes} at={[0, 0.43, fz(BIRD_C, BIRD_R, 0.11, 0.43, 0.009)]} dx={0.11} size={[0.05, 0.062, 0.036]} />
        {/* two-part beak, lower half a little open = a smiling beak */}
        <Part at={[0, 0.365, fz(BIRD_C, BIRD_R, 0, 0.365, -0.005)]} s={[0.062, 0.036, 0.075]} color={C.pink} rot={[0.15, 0, 0]} />
        <Part at={[0, 0.322, fz(BIRD_C, BIRD_R, 0, 0.322, 0.005)]} s={[0.045, 0.026, 0.055]} color={C.raspberry} rot={[-0.1, 0, 0]} />
        <Cheeks x={0.19} y={0.33} z={fz(BIRD_C, BIRD_R, 0.19, 0.33, 0.009)} yaw={0.6} />
        <Joint at={[0, 0.62, 0.03]} inner={r.top}>
          <Part at={[-0.04, 0.07, 0]} s={[0.03, 0.08, 0.025]} color={BIRD_WING} rot={[0, 0, 0.45]} />
          <Part at={[0, 0.085, 0.005]} s={[0.032, 0.09, 0.026]} color={C.pink} />
          <Part at={[0.04, 0.07, 0]} s={[0.03, 0.08, 0.025]} color={BIRD_WING} rot={[0, 0, -0.45]} />
        </Joint>
        {SIDES.map((sd) => (
          <Joint key={sd} at={[sd * 0.27, 0.37, -0.02]} rot={[0, 0, sd * 0.15]} inner={sd < 0 ? r.left : r.right}>
            <Part at={[sd * 0.012, -0.08, -0.02]} s={[0.05, 0.15, 0.13]} color={BIRD_WING} />
          </Joint>
        ))}
        {/* tail fan points up and back so it shows clearly from behind */}
        <Joint at={[0, 0.25, -0.22]} rot={[-0.6, 0, 0]} inner={r.tail}>
          <Part at={[-0.06, 0.11, 0]} s={[0.048, 0.135, 0.024]} color={BIRD_WING} rot={[0, 0, 0.4]} />
          <Part at={[0, 0.13, 0]} s={[0.052, 0.15, 0.026]} color={C.pink} />
          <Part at={[0.06, 0.11, 0]} s={[0.048, 0.135, 0.024]} color={BIRD_WING} rot={[0, 0, -0.4]} />
        </Joint>
      </Hinge>
    </>
  );
}

/* ---------- เต่า: กระดองเขียวมีลายแผ่น ขอบกระดองสีอ่อน ผิวมิ้นต์ หัวโต (24 ชิ้น) ---------- */

const SHELL_C: V3 = [0, 0.12, -0.06];
const SHELL_R: V3 = [0.39, 0.34, 0.37];
const TURTLE_HEAD_C: V3 = [0, 0.41, 0.34];
const TURTLE_HEAD_R: V3 = [0.17, 0.155, 0.16];
const TURTLE_PLATES: { at: V3; rot: V3; s: V3 }[] = [
  { ...onSurface(SHELL_C, SHELL_R, 0, Math.PI / 2, -0.012), s: [0.12, 0.028, 0.12] },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ ...onSurface(SHELL_C, SHELL_R, (i * Math.PI) / 3, 0.6, -0.01), s: [0.1, 0.025, 0.09] as V3 })),
];

function Turtle({ r }: { r: Rig }) {
  const kit = useKit();
  return (
    <>
      <Part at={[0, 0.11, -0.06]} s={[0.34, 0.075, 0.33]} color={SHELL_RIM} />
      <mesh geometry={kit.dome()} material={kit.clay(SHELL)} position={SHELL_C} scale={SHELL_R} />
      <mesh
        geometry={kit.torus(0.39, 0.042)}
        material={kit.clay(SHELL_RIM)}
        position={[0, 0.125, -0.06]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, SHELL_R[2] / SHELL_R[0], 1]}
      />
      {TURTLE_PLATES.map((p, i) => (
        <Part key={i} at={p.at} s={p.s} color={SHELL_PLATE} rot={p.rot} />
      ))}
      {SIDES.map((sd) => (
        <group key={sd}>
          <Joint at={[sd * 0.17, 0.08, 0.15]} inner={sd < 0 ? r.left : r.right}>
            <Part at={[sd * 0.08, -0.012, 0.03]} s={[0.085, 0.065, 0.1]} color={C.mint} rot={[0, sd * 0.4, 0]} />
          </Joint>
          <Part at={[sd * 0.24, 0.065, -0.25]} s={[0.08, 0.062, 0.095]} color={C.mint} rot={[0, -sd * 0.4, 0]} />
        </group>
      ))}
      <Joint at={[0, 0.09, -0.38]} inner={r.tail}>
        <Part at={[0, 0, -0.05]} s={[0.05, 0.04, 0.085]} color={C.mint} rot={[0.3, 0, 0]} />
      </Joint>
      {/* head on a short neck: stretches out of the shell while listening */}
      <Hinge at={[0, 0.22, 0.24]} inner={r.head}>
        <Rod at={[0, 0.305, 0.28]} r={0.07} len={0.1} color={C.mint} rot={[0.44, 0, 0]} />
        <Part at={TURTLE_HEAD_C} s={TURTLE_HEAD_R} color={C.mint} />
        <InkEyes eyes={r.eyes} at={[0, 0.44, fz(TURTLE_HEAD_C, TURTLE_HEAD_R, 0.075, 0.44, 0.008)]} dx={0.075} size={[0.042, 0.052, 0.03]} />
        <Cheeks x={0.12} y={0.38} z={fz(TURTLE_HEAD_C, TURTLE_HEAD_R, 0.12, 0.38, 0.008)} yaw={0.6} />
        <Smile at={[0, 0.39, 0.4975]} radius={0.04} tilt={0.2} />
      </Hinge>
    </>
  );
}

function Body({ kind, r }: { kind: FriendKind; r: Rig }) {
  switch (kind) {
    case "crab":
      return <Crab r={r} />;
    case "dog":
      return <Dog r={r} />;
    case "fish":
      return <Fish r={r} />;
    case "bird":
      return <Bird r={r} />;
    case "turtle":
      return <Turtle r={r} />;
  }
}

/**
 * เพื่อนสัตว์ห้าตัวของเกม “เรียกเพื่อน” (ปู หมา ปลา นก เต่า) ปั้นแบบของเล่นดินปั้นเหมือนกบ:
 * ตาโตมีจุดแสง แก้มชมพู ยิ้มเล็ก ๆ — หันหน้า +Z ยืนบน y = 0 ขนาดราว 0.9 (ปลาโผล่จากผิวน้ำที่ y = 0)
 * ท่า: หายใจ/กะพริบตา, ตั้งใจฟังตอนเด็กพูด (ตาโตขึ้น หู/ก้านตา/หงอนตั้ง เอนมาข้างหน้า),
 * ดีใจสั้น ๆ เมื่อได้ยิน (กระโดด ส่าย โบก), เอียงหัวสงสัยเมื่อเสียงใช้ไม่ได้ — ไม่มีท่าเศร้าหรือน่ากลัว
 * โหมดลดการเคลื่อนไหว: ไม่มีการหายใจ/ลอย/ท่าทาง เหลือเพียงตาโตและหูตั้งตอนฟัง
 * ฉากเป็นผู้หมุนตัวทั้งตัว (rotation.y ของกลุ่มนอกสุด) ไฟล์นี้ขยับเฉพาะชิ้นข้างใน
 */
export function Friend({ kind, pose }: { kind: FriendKind; pose: RefObject<FriendPose> }): ReactElement {
  const rig = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const st = useRef({
    ready: false,
    t: 0,
    wag: 0,
    listen: 0,
    blink: 0,
    blinkNext: 2,
    happyT: -1,
    happySeen: 0,
    happyQ: false,
    askT: -1,
    askSeen: 0,
    askQ: false,
    side: 1,
  });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const p = pose.current;
    const s = st.current;
    if (!s.ready) {
      // first frame: random phase so friends side by side never move in step; counts from before mount are not replayed
      s.ready = true;
      s.t = Math.random() * 4;
      s.blinkNext = 1 + Math.random() * 2.5;
      s.happySeen = p.happy;
      s.askSeen = p.asking;
    }
    const motion = p.reduced ? 0 : 1;
    s.t += dt;
    s.listen = damp(s.listen, p.listening ? 1 : 0, 9, dt);
    const L = s.listen;
    s.wag += dt * (4.5 + 5 * L);

    // one-shot gestures; a call that lands mid-gesture plays right after it (never cuts it off)
    if (p.happy !== s.happySeen) {
      s.happySeen = p.happy;
      if (s.happyT < 0) s.happyT = 0;
      else s.happyQ = true;
    }
    if (p.asking !== s.askSeen) {
      s.askSeen = p.asking;
      if (s.askT < 0) {
        s.askT = 0;
        s.side = -s.side;
      } else s.askQ = true;
    }
    if (s.happyT >= 0) {
      s.happyT += dt;
      if (s.happyT >= HAPPY_S) {
        s.happyT = s.happyQ ? 0 : -1;
        s.happyQ = false;
      }
    }
    if (s.askT >= 0) {
      s.askT += dt;
      if (s.askT >= ASK_S) {
        s.askT = s.askQ ? 0 : -1;
        if (s.askQ) s.side = -s.side;
        s.askQ = false;
      }
    }
    const hT = Math.max(0, s.happyT);
    const hu = s.happyT >= 0 ? hT / HAPPY_S : 1;
    const hEnv = s.happyT >= 0 ? smooth(hu, 0, 0.12) * (1 - smooth(hu, 0.72, 1)) * motion : 0;
    const hop = hu > 0.15 && hu < 0.65 ? Math.sin((Math.PI * (hu - 0.15)) / 0.5) * motion : 0;
    const squash = (hu < 0.15 ? bump(hu / 0.15) * 0.6 : hu > 0.65 && hu < 0.85 ? bump((hu - 0.65) / 0.2) : 0) * motion;
    const au = s.askT >= 0 ? s.askT / ASK_S : 1;
    const aEnv = s.askT >= 0 ? smooth(au, 0, 0.28) * (1 - smooth(au, 0.68, 1)) * motion : 0;
    const side = s.side;

    if (motion) {
      s.blinkNext -= dt;
      if (s.blinkNext <= 0) {
        s.blink = 0.13;
        s.blinkNext = 2.2 + Math.random() * 2.8;
      }
      s.blink -= dt;
    } else s.blink = 0;

    // whole body: breathing, happy hop with squash & stretch, forward lean while listening (body motion only without reduced motion)
    const tune = TUNE[kind];
    const lm = L * motion;
    const breathe = Math.sin(s.t * 2.2) * 0.016 * motion;
    const g = rig.current;
    if (g) {
      const sy = 1 + breathe - 0.12 * squash + 0.06 * hop;
      const sxz = 1 - breathe * 0.5 + 0.08 * squash - 0.025 * hop;
      g.scale.set(sxz, sy, sxz);
      g.position.set(0, hop * tune.hop, 0);
      g.rotation.set(tune.lean * lm, 0, 0);
    }
    // eyes: a bit wider while listening, a happy squint during the bounce, blink
    if (eyes.current) eyes.current.scale.set(1 + 0.08 * L, (s.blink > 0 ? 0.12 : 1) * (1 + 0.16 * L) * (1 - 0.3 * hEnv), 1);

    // paired parts (claws, ears, fins, wings, front legs): `raise` lifts them up/outward, mirrored left and right
    let raiseL = 0;
    let raiseR = 0;
    let fwd = 0;
    const hd = head.current;
    const tl = tail.current;
    const tp = top.current;
    switch (kind) {
      case "crab": {
        const shimmy = Math.sin(hT * 15) * hEnv; // happy little sideways crab dance
        if (g) {
          g.position.x = shimmy * 0.04;
          g.rotation.z = Math.sin(s.t * 1.3) * 0.025 * motion + shimmy * 0.06 + side * 0.07 * aEnv;
        }
        const idle = Math.sin(s.t * 1.7) * 0.06 * motion;
        const wave = Math.sin(hT * 16) * 0.4 * hEnv;
        raiseL = 0.12 * L + 0.4 * hEnv + wave + idle + (side > 0 ? 0.3 : 0) * aEnv;
        raiseR = 0.12 * L + 0.4 * hEnv - wave - idle + (side < 0 ? 0.3 : 0) * aEnv;
        fwd = 0.2 * L;
        if (tp) {
          tp.position.y = 0.035 * L;
          tp.rotation.set(0.12 * L, 0, side * 0.35 * aEnv + Math.sin(hT * 12) * 0.14 * hEnv + Math.sin(s.t * 1.1) * 0.03 * motion);
        }
        break;
      }
      case "dog": {
        // ears perk while listening; in the curious tilt the ear on the high side lifts
        const flap = Math.sin(hT * 18) * 0.3 * hEnv;
        const twitch = Math.sin(s.t * 1.6) * 0.03 * motion;
        raiseL = 0.6 * L + 0.2 * hEnv + flap + twitch + (side < 0 ? 0.5 : 0.08) * aEnv;
        raiseR = 0.6 * L + 0.2 * hEnv - flap + twitch + (side > 0 ? 0.5 : 0.08) * aEnv;
        if (tl) tl.rotation.set(0.35 * L, 0, Math.sin(s.wag) * (0.28 + 0.14 * L) * motion + Math.sin(hT * 26) * 0.4 * hEnv);
        if (hd) hd.rotation.set(-0.1 * lm, 0, side * 0.34 * aEnv + Math.sin(s.t * 0.9) * 0.03 * motion);
        break;
      }
      case "fish": {
        if (g) {
          g.position.y = (Math.sin(s.t * 1.9) * 0.022 + 0.05 * L) * motion + hop * tune.hop;
          g.rotation.z = Math.sin(s.t * 1.4) * 0.035 * motion + Math.sin(hT * 16) * 0.12 * hEnv;
        }
        if (hd) hd.rotation.set(0, 0, side * 0.26 * aEnv);
        const paddle = Math.sin(s.t * 3) * 0.15 * motion;
        const flap = Math.sin(hT * 22) * 0.45 * hEnv;
        raiseL = 0.3 * L + paddle + 0.3 * hEnv + flap;
        raiseR = 0.3 * L - paddle + 0.3 * hEnv + flap;
        if (tl) tl.rotation.set(0, 0, Math.sin(s.t * 2.3) * 0.16 * motion + Math.sin(hT * 18) * 0.45 * hEnv);
        if (tp) {
          tp.rotation.set(0.3 * L, 0, 0);
          tp.scale.set(1, 1 + 0.2 * L, 1);
        }
        break;
      }
      case "bird": {
        if (hd) hd.rotation.set(-0.08 * lm, 0, side * 0.3 * aEnv + Math.sin(s.t * 1.1) * 0.025 * motion);
        const flapW = (0.5 - 0.5 * Math.cos(hT * 28)) * 0.95 * hEnv;
        raiseL = 0.15 * L + flapW + Math.sin(s.t * 2.2) * 0.03 * motion;
        raiseR = raiseL;
        if (tl) tl.rotation.set(0.2 * L + Math.sin(s.t * 1.8) * 0.06 * motion + Math.sin(hT * 20) * 0.25 * hEnv, 0, 0);
        if (tp) {
          tp.scale.set(1 + 0.12 * L, 1 + 0.4 * L, 1);
          tp.rotation.set(0, 0, Math.sin(hT * 16) * 0.2 * hEnv - side * 0.15 * aEnv);
        }
        break;
      }
      case "turtle": {
        if (hd) {
          hd.position.set(0, 0.03 * L, 0.05 * L);
          hd.rotation.set(-0.12 * L + Math.sin(s.t * 1.5) * 0.035 * motion - Math.sin(hT * 14) * 0.15 * hEnv, 0, side * 0.34 * aEnv);
        }
        const paddle = Math.sin(hT * 18) * 0.35 * hEnv;
        raiseL = 0.08 * L + 0.35 * hEnv + paddle;
        raiseR = 0.08 * L + 0.35 * hEnv - paddle;
        if (tl) tl.rotation.set(0, Math.sin(s.t * 2.6) * 0.2 * motion + Math.sin(hT * 22) * 0.5 * hEnv, 0);
        break;
      }
    }
    left.current?.rotation.set(fwd, 0, -raiseL);
    right.current?.rotation.set(fwd, 0, raiseR);
  });

  const parts: Rig = { head, eyes, left, right, tail, top };
  return (
    <group>
      <group ref={rig}>
        <Body kind={kind} r={parts} />
      </group>
    </group>
  );
}
