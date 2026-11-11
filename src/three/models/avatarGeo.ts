import * as THREE from "three";
import { C } from "../palette";
import { colored, type Part } from "../shapes";

/**
 * ตัวละครหลักที่เด็กเลือกได้ (กระต่าย ลูกหมา ไดโนเสาร์ แมวเหมียว) และชุดแต่งตัว (เสื้อบอล ฮู้ดไดโนเสาร์ ชุดเจ้าหญิง ผ้าคลุมฮีโร่)
 * ไฟล์นี้มีแค่สี ตำแหน่ง และตัวสร้าง geometry: แต่ละชิ้นรวมหลายรูปทรงเป็น geometry เดียวที่มีสีต่อ vertex (เหมือน shapes.colored)
 * → หนึ่ง draw call ต่อชิ้น สร้างครั้งเดียวต่อ canvas ผ่าน kit.geo(key, …) แล้ว dispose พร้อมฉาก
 * พิกัดเดียวกับ Bunny.tsx: ยืนบน y = 0 หันหน้า +Z ลำตัวกลางที่ (0, 0.52, 0) หัวกลางที่ (0, 1.03, 0.03)
 * สี: ไม่ใช้น้ำเงิน (oral) หรือส้ม (nasal) — สีใหม่ทุกสี hue อยู่นอก ~15°–45° และ ~200°–235° (ค่าในวงเล็บ = hue โดยประมาณ)
 * ทอง/เนยของพาเลตต์ใช้เฉพาะของประดับเล็ก ๆ (หนามบนฮู้ด ดาวและขอบผ้าคลุม) เหมือนมงกุฎและผ้าพันคอเดิม
 */

type V3 = [number, number, number];

export type AvatarSpecies = "bunny" | "puppy" | "dino" | "kitty";
/** Species with a moving tail (the bunny's cotton tail is a fixed ball). */
export type Tailed = Exclude<AvatarSpecies, "bunny">;

/** Round-shape detail of the current graphics tier (Kit.seg). */
export interface Seg {
  w: number;
  h: number;
}

/* ---------- colours ---------- */

const PUP = "#eedb9c"; // honey-caramel fur (46°): warm, but kept clear of the nasal orange
export const PUP_DEEP = "#a47466"; // cocoa ears and eye patch (13°)
const DINO = "#9ddcab"; // soft mint-leaf green (133°)
const DINO_LIGHT = "#c6edcd"; // snout (131°)
const DINO_BELLY = "#e2f5d8"; // pale belly (99°)
const DINO_SPIKE = "#72c59a"; // rounded spikes (149°)
const DINO_DEEP = "#4f9a74"; // nostrils (150°)
const KITTY = "#cbc4d8"; // lilac grey (261°)
const KITTY_LIGHT = "#f3f0f8"; // muzzle, belly, paws, tail tip (262°)
const WHISKER = "#867b9c"; // (260°)
const JERSEY = "#88d2e6"; // sky blue (193°), lighter and greener than the oral blue (≈220°)
const HOODIE = "#8fd07c"; // dino-hoodie green (106°)
const HOODIE_DEEP = "#74bb63"; // pocket, cuffs and rib (108°)
const CAPE = "#ec6a72"; // hero red (356°)

export interface AvatarLook {
  /** Head, body and arms. */
  fur: string;
  /** Belly patch. */
  belly: string;
  /** Feet without shoes. */
  paw: string;
}

/** The bunny keeps exactly its original colours. */
export const LOOK: Record<AvatarSpecies, AvatarLook> = {
  bunny: { fur: C.cream, belly: "#fff1f5", paw: C.cream },
  puppy: { fur: PUP, belly: C.cream, paw: C.cream },
  dino: { fur: DINO, belly: DINO_BELLY, paw: DINO },
  kitty: { fur: KITTY, belly: KITTY_LIGHT, paw: KITTY_LIGHT },
};

/* ---------- joints (rig space unless noted) ---------- */

/** Where each tail joins the lower back, its rest pitch, and its pitch under a cape (kept below the cape's hem). */
export const TAIL: Record<Tailed, { at: V3; pitch: number; caped: number }> = {
  puppy: { at: [0, 0.31, -0.32], pitch: -0.85, caped: -1.6 },
  dino: { at: [0, 0.3, -0.24], pitch: 0, caped: 0 },
  kitty: { at: [0, 0.27, -0.29], pitch: 0, caped: -0.65 },
};
/** Ear joints in head space on the +x side (earR in Bunny.tsx); earL mirrors x. */
export const PUPPY_EAR_AT: V3 = [0.3, 0.2, -0.03];
export const KITTY_EAR_AT: V3 = [0.19, 0.235, -0.02];
/** Skirt sways about the waist; the cape hangs from the back of the neck. */
export const SKIRT_PIVOT: V3 = [0, 0.42, 0];
export const CAPE_PIVOT: V3 = [0, 0.9, 0];

/* ---------- building blocks (fresh geometries: colored() merges and then disposes them) ---------- */

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const HEAD_R: V3 = [0.36, 0.33, 0.33];

const ball = (s: Seg, small = false) => (small ? new THREE.SphereGeometry(1, 12, 8) : new THREE.SphereGeometry(1, s.w, s.h));
const ring = (s: Seg, radius: number, tube: number, arc = TAU) => new THREE.TorusGeometry(radius, tube, 8, Math.max(16, s.w + 4), arc);
const cone = (s: Seg, rTop: number, rBottom: number, h: number) => new THREE.CylinderGeometry(rTop, rBottom, h, Math.max(10, s.w - 6));

/** Rounded rod (capsule) from a to b. */
function rod(s: Seg, a: V3, b: V3, r: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a);
  const dir = new THREE.Vector3(...b).sub(from);
  const len = dir.length();
  const g = new THREE.CapsuleGeometry(r, len, 4, Math.max(8, s.w - 10));
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(from.addScaledVector(dir, len / 2), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Lays a part that is thin along its local Y on an ellipsoid (yaw from +Z, pitch up); `lift` moves it along the normal. */
function onEllipsoid(c: V3, r: V3, yaw: number, pitch: number, lift: number): { at: V3; rot: V3 } {
  const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const n = new THREE.Vector3(d.x / r[0], d.y / r[1], d.z / r[2]).normalize();
  const p = new THREE.Vector3(c[0] + r[0] * d.x, c[1] + r[1] * d.y, c[2] + r[2] * d.z).addScaledVector(n, lift);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, n));
  return { at: [p.x, p.y, p.z], rot: [e.x, e.y, e.z] };
}

/** A rounded spike on a centre line: `n` = unit normal (y, z) in the YZ plane, sitting `lift` out along it. */
function spike(s: Seg, at: [number, number], n: [number, number], lift: number, size: V3, color: string): Part {
  return {
    geo: ball(s, Math.max(...size) < 0.09),
    color,
    at: [0, at[0] + n[0] * lift, at[1] + n[1] * lift],
    rot: [Math.atan2(n[1], n[0]), 0, 0],
    scale: size,
  };
}

/* ---------- upper-body shell shared by the jersey, the hoodie and the dress bodice ---------- */

/** The body ellipsoid (0.4 × 0.44 × 0.36) a little bigger, open below the hem (Bunny.tsx drops the belly patch under it). */
const SHELL_AT: V3 = [0, 0.52, 0];
const SHELL_R: V3 = [0.418, 0.457, 0.392];
/** Polar angle where the shell ends (hem at y ≈ 0.33, above the feet). */
const SHELL_CUT = 2.0;
const HEM_Y = SHELL_AT[1] + SHELL_R[1] * Math.cos(SHELL_CUT);
const HEM_RX = SHELL_R[0] * Math.sin(SHELL_CUT);
const SQUASH = SHELL_R[2] / SHELL_R[0];

function shellPart(s: Seg, color: string): Part {
  return { geo: new THREE.SphereGeometry(1, s.w, s.h, 0, TAU, 0, SHELL_CUT), color, at: SHELL_AT, scale: SHELL_R };
}

/** Flat ring around the body at height y (hem, collar, sash); `squash` = depth / width. */
function band(s: Seg, color: string, y: number, radius: number, tube: number, squash = SQUASH): Part {
  return { geo: ring(s, radius, tube), color, at: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1, squash, 1] };
}

/** Spot on the shell's centre line at height y, facing out of the front (+1) or the back (−1), sunk `inset` into it. */
function onShell(y: number, side: 1 | -1, inset: number): { at: V3; rot: V3 } {
  const dy = y - SHELL_AT[1];
  const z = SHELL_R[2] * Math.sqrt(Math.max(0, 1 - (dy / SHELL_R[1]) ** 2));
  const ny = dy / SHELL_R[1] ** 2;
  const nz = z / SHELL_R[2] ** 2;
  const tilt = Math.atan2(ny, nz);
  const k = inset / Math.hypot(ny, nz);
  return side > 0
    ? { at: [0, y - ny * k, z - nz * k], rot: [-tilt, 0, 0] }
    : { at: [0, y - ny * k, -z + nz * k], rot: [tilt, Math.PI, 0] };
}

/** Raised football number "1" (stem + flag), facing +Z in its own frame; flattened like an appliqué. */
function numberOne(s: Seg, at: V3, rot: V3, size: number): Part[] {
  const scale: V3 = [size, size, 0.42];
  return [
    { geo: rod(s, [0.012, -0.085, 0], [0.012, 0.085, 0], 0.03), color: C.white, at, rot, scale },
    { geo: rod(s, [0.012, 0.085, 0], [-0.05, 0.035, 0], 0.025), color: C.white, at, rot, scale },
  ];
}

/* ---------- garments ---------- */

/** Football shirt body: sky-blue shell, white collar and hem, a "1" on the chest and a bigger one on the back. */
export function jerseyTorsoGeo(s: Seg): THREE.BufferGeometry {
  const front = onShell(0.565, 1, 0.004);
  const back = onShell(0.57, -1, 0.006);
  return colored([
    shellPart(s, JERSEY),
    band(s, C.white, 0.83, 0.3, 0.03, 0.94),
    band(s, C.white, HEM_Y, HEM_RX, 0.026),
    ...numberOne(s, front.at, front.rot, 1),
    ...numberOne(s, back.at, back.rot, 1.2),
  ]);
}

/** Short sleeve with a white cuff; origin = the shoulder joint. */
export function jerseySleeveGeo(s: Seg): THREE.BufferGeometry {
  return colored([
    { geo: ball(s), color: JERSEY, at: [0, -0.05, 0], scale: [0.092, 0.1, 0.092] },
    { geo: ring(s, 0.076, 0.017), color: C.white, at: [0, -0.112, 0], rot: [Math.PI / 2, 0, 0] },
  ]);
}

/** Hoodie body: green shell, deeper-green rib and kangaroo pocket, two cream drawstrings. */
export function hoodieTorsoGeo(s: Seg): THREE.BufferGeometry {
  const pocket = onShell(0.43, 1, 0.054);
  const parts: Part[] = [
    shellPart(s, HOODIE),
    band(s, HOODIE_DEEP, HEM_Y, HEM_RX, 0.032),
    // a deep, mostly sunk oval: only a soft raised patch shows and its edges stay on the shell
    { geo: ball(s), color: HOODIE_DEEP, at: pocket.at, rot: pocket.rot, scale: [0.17, 0.075, 0.07] },
  ];
  for (const sx of [-1, 1]) {
    parts.push({ geo: rod(s, [sx * 0.05, 0.79, 0.322], [sx * 0.056, 0.698, 0.368], 0.011), color: C.cream });
    parts.push({ geo: ball(s, true), color: C.cream, at: [sx * 0.057, 0.69, 0.372], scale: 0.018 });
  }
  return colored(parts);
}

/** Long sleeve (the paw still shows) with a rib cuff; origin = the shoulder joint. */
export function hoodieSleeveGeo(s: Seg): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.CapsuleGeometry(0.084, 0.11, 4, Math.max(10, s.w - 8)), color: HOODIE, at: [0, -0.08, 0] },
    { geo: ring(s, 0.072, 0.02), color: HOODIE_DEEP, at: [0, -0.175, 0], rot: [Math.PI / 2, 0, 0] },
  ]);
}

const HOOD_AT: V3 = [0, 0.025, -0.035];
const HOOD_RX = 0.4;
const HOOD_R = 0.375;
/** Half-angle of the face opening around +Z: eyes, cheeks and snouts all stay inside it. */
const HOOD_OPEN = 0.95;
/** Head-space top of the hood (a crown sits here). */
export const HOOD_TOP = HOOD_AT[1] + HOOD_R;
/** [angle from the top toward the back, size] of the hood's soft spikes; the first one gives way to a crown. */
const HOOD_SPIKES: [number, number][] = [
  [0.15, 0.85],
  [0.6, 1],
  [1.05, 1],
  [1.5, 0.85],
];

/** Dino hood in head space: a shell with the face open, a cream rim and `spikes` (0, 3 or 4) butter spikes on top. */
export function hoodGeo(s: Seg, spikes: number): THREE.BufferGeometry {
  const shell = new THREE.SphereGeometry(1, s.w, s.h, 0, TAU, HOOD_OPEN, Math.PI - HOOD_OPEN);
  shell.rotateX(Math.PI / 2); // the hole at the sphere's top pole turns to face +Z
  const rim = 0.315;
  const open = Math.sin(HOOD_OPEN);
  const parts: Part[] = [
    { geo: shell, color: HOODIE, at: HOOD_AT, scale: [HOOD_RX, HOOD_R, HOOD_R] },
    {
      geo: ring(s, rim, 0.034),
      color: C.cream,
      at: [0, HOOD_AT[1], HOOD_AT[2] + HOOD_R * Math.cos(HOOD_OPEN)],
      scale: [(HOOD_RX * open) / rim, (HOOD_R * open) / rim, 1],
    },
  ];
  for (const [a, k] of HOOD_SPIKES.slice(HOOD_SPIKES.length - spikes)) {
    parts.push(spike(s, [HOOD_AT[1] + HOOD_R * Math.cos(a), HOOD_AT[2] - HOOD_R * Math.sin(a)], [Math.cos(a), -Math.sin(a)], 0.02, [0.032 * k, 0.072 * k, 0.058 * k], C.butter));
  }
  return colored(parts);
}

/** Dress bodice (pastel-pink shell) with a raspberry sash and a bow at the front of the waist. */
export function dressTopGeo(s: Seg): THREE.BufferGeometry {
  const z = 0.402;
  const parts: Part[] = [
    shellPart(s, C.pinkSoft),
    band(s, C.raspberry, 0.4, 0.405, 0.03, 0.935),
    { geo: ball(s, true), color: C.raspberry, at: [0, 0.405, z + 0.01], scale: [0.03, 0.03, 0.024] },
  ];
  for (const sx of [-1, 1]) {
    parts.push({ geo: ball(s, true), color: C.raspberry, at: [sx * 0.064, 0.41, z], rot: [0, 0, sx * 0.35], scale: [0.066, 0.04, 0.026] });
    parts.push({ geo: rod(s, [sx * 0.016, 0.39, z], [sx * 0.048, 0.33, z + 0.006], 0.015), color: C.raspberry });
  }
  return colored(parts);
}

/** Bell profile [radius, y] from the rolled hem up to the waist (rig space); the top tucks into the body. */
const SKIRT_PROFILE: [number, number][] = [
  [0.42, 0.235],
  [0.465, 0.225],
  [0.487, 0.245],
  [0.477, 0.285],
  [0.452, 0.33],
  [0.425, 0.37],
  [0.404, 0.4],
  [0.385, 0.425],
  [0.34, 0.455],
  [0.28, 0.47],
];
/** Skirt depth / width, like the body. */
const SKIRT_DEPTH = 0.9;

/** Flared princess skirt with a white lace hem, around SKIRT_PIVOT. The hem stops above the feet. */
export function skirtGeo(s: Seg): THREE.BufferGeometry {
  const y0 = SKIRT_PIVOT[1];
  const lathe = new THREE.LatheGeometry(
    SKIRT_PROFILE.map(([r, y]) => new THREE.Vector2(r, y - y0)),
    Math.max(24, s.w + 8),
  );
  return colored([
    { geo: lathe, color: C.pinkSoft, scale: [1, 1, SKIRT_DEPTH] },
    band(s, C.white, 0.232 - y0, 0.474, 0.017, SKIRT_DEPTH),
  ]);
}

/** Cape profile [radius, y] around CAPE_PIVOT: tucked under the head at the top, clear of every shirt and tail below. */
const CAPE_PROFILE: [number, number][] = [
  [0.5, -0.52],
  [0.49, -0.44],
  [0.465, -0.34],
  [0.43, -0.24],
  [0.38, -0.14],
  [0.31, -0.06],
  [0.23, 0],
];
/** How far around the back the cape wraps, and its stretch in x (the shoulders are wider than deep). */
const CAPE_SPAN = Math.PI * 0.8;
const CAPE_WIDE = 1.15;

/** Hero cape: red cloth with a gold hem and a gold star made of rods, all in one piece around CAPE_PIVOT. */
export function capeGeo(s: Seg): THREE.BufferGeometry {
  const cloth = new THREE.LatheGeometry(
    CAPE_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    Math.max(16, s.w),
    Math.PI - CAPE_SPAN / 2,
    CAPE_SPAN,
  );
  const hem = ring(s, 0.5, 0.017, CAPE_SPAN);
  hem.rotateZ(-Math.PI / 2 - CAPE_SPAN / 2); // centre the arc on the back…
  hem.rotateX(Math.PI / 2); // …and lay it flat
  // star on the middle of the back, tipped to face back-and-up like the cloth there (radius 0.4405, slope 0.35 at y −0.27)
  const star: V3 = [0, -0.27, -0.4425];
  const rot: V3 = [Math.atan(0.35), Math.PI, 0];
  const flat: V3 = [1, 1, 0.4];
  const parts: Part[] = [
    { geo: cloth, color: CAPE, scale: [CAPE_WIDE, 1, 1] },
    { geo: hem, color: C.gold, at: [0, -0.514, 0], scale: [CAPE_WIDE, 1, 1] },
    { geo: ball(s, true), color: C.gold, at: star, rot, scale: [0.05, 0.05, 0.05 * flat[2]] },
  ];
  for (let k = 0; k < 5; k++) {
    // five soft cone points around a round middle (a cartoon star, nothing sharp)
    const a = (k / 5) * TAU;
    const point = cone(s, 0.012, 0.045, 0.1);
    point.translate(0, 0.075, 0);
    point.rotateZ(-a);
    parts.push({ geo: point, color: C.gold, at: star, rot, scale: flat });
  }
  return colored(parts);
}

/** Gold cord and button tying the cape at the front of the neck (rig space). */
export function capeTieGeo(s: Seg): THREE.BufferGeometry {
  const cord = ring(s, 0.335, 0.016, Math.PI + 0.5);
  cord.rotateZ(-0.25);
  cord.rotateX(Math.PI / 2); // front half of a ring, ends tucked toward the cape
  return colored([
    { geo: cord, color: C.gold, at: [0, 0.8, 0], scale: [1, 1, 0.94] },
    { geo: ball(s, true), color: C.gold, at: [0, 0.8, 0.321], scale: 0.036 },
  ]);
}

/* ---------- species details (head space for faces, joint space for ears and tails) ---------- */

/** Short round snout with a dark nose, and a cocoa patch around the left eye (a thin decal: the eye still shows). */
export function puppyFaceGeo(s: Seg): THREE.BufferGeometry {
  const patch = onEllipsoid([0, 0, 0], HEAD_R, 0.42, 0.13, -0.01);
  return colored([
    { geo: ball(s), color: C.cream, at: [0, -0.07, 0.255], scale: [0.13, 0.095, 0.11] },
    { geo: ball(s, true), color: C.ink, at: [0, -0.03, 0.356], scale: [0.046, 0.033, 0.03] },
    { geo: ball(s), color: PUP_DEEP, at: patch.at, rot: patch.rot, scale: [0.09, 0.012, 0.088] },
  ]);
}

/** Small wagging tail along +Y with a cream tip (long enough to clear the round body). */
export function puppyTailGeo(s: Seg): THREE.BufferGeometry {
  return colored([
    { geo: rod(s, [0, 0, 0], [0, 0.17, 0], 0.042), color: PUP },
    { geo: ball(s, true), color: C.cream, at: [0, 0.195, 0], scale: 0.05 },
  ]);
}

/** Rounded snout below the eyes with two tiny nostrils (no teeth, nothing sharp). */
export function dinoFaceGeo(s: Seg): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: ball(s), color: DINO_LIGHT, at: [0, -0.095, 0.25], scale: [0.15, 0.09, 0.115] }];
  for (const sx of [-1, 1]) parts.push({ geo: ball(s, true), color: DINO_DEEP, at: [sx * 0.042, -0.07, 0.355], scale: [0.017, 0.013, 0.012] });
  return colored(parts);
}

/** [angle from the top of the head toward the back, size] of the head spikes. */
const DINO_CREST: [number, number][] = [
  [-0.15, 0.8],
  [0.4, 0.95],
  [0.95, 1.05],
  [1.5, 0.95],
];
/** Spike angle from which the crest still shows under a cap / a crown (the ones further forward would clash). */
export const CREST_UNDER_CAP = 1.45;
export const CREST_UNDER_CROWN = 0.9;

/** Head spikes (head space) from angle `from` backward. */
export function dinoCrestGeo(s: Seg, from: number): THREE.BufferGeometry {
  const r = HEAD_R[1]; // the head is round in its YZ section
  return colored(
    DINO_CREST.filter(([a]) => a >= from).map(([a, k]) =>
      spike(s, [r * Math.cos(a), -r * Math.sin(a)], [Math.cos(a), -Math.sin(a)], 0.02, [0.03 * k, 0.066 * k, 0.056 * k], DINO_SPIKE),
    ),
  );
}

/** [angle on the body's centre line from the top toward the back, size] of the back spikes. */
const DINO_BACK: [number, number][] = [
  [1.05, 1],
  [1.45, 1.1],
  [1.85, 0.9],
];

/** Back spikes (rig space) on the body ellipsoid's centre line. */
export function dinoBackGeo(s: Seg): THREE.BufferGeometry {
  return colored(
    DINO_BACK.map(([a, k]) => {
      const ny = Math.cos(a) / 0.44;
      const nz = -Math.sin(a) / 0.36;
      const l = Math.hypot(ny, nz);
      return spike(s, [0.52 + 0.44 * Math.cos(a), -0.36 * Math.sin(a)], [ny / l, nz / l], 0.022, [0.036 * k, 0.082 * k, 0.072 * k], DINO_SPIKE);
    }),
  );
}

/** Short thick tail going back and down to just above the ground, with two small spikes on top. */
export function dinoTailGeo(s: Seg): THREE.BufferGeometry {
  const dir = new THREE.Vector3(0, -0.2, -0.42).normalize();
  const len = 0.37;
  const taper = new THREE.CylinderGeometry(0.07, 0.145, len, Math.max(12, s.w - 4));
  taper.translate(0, len / 2, 0);
  taper.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
  const tip = dir.clone().multiplyScalar(len);
  const up: [number, number] = [-dir.z, dir.y]; // (y, z) normal on top of the tail
  const parts: Part[] = [
    { geo: ball(s), color: DINO, scale: 0.145 },
    { geo: taper, color: DINO },
    { geo: ball(s), color: DINO, at: [tip.x, tip.y, tip.z], scale: 0.07 },
  ];
  for (const [t, k] of [
    [0.32, 1],
    [0.66, 0.85],
  ] as const) {
    const c = dir.clone().multiplyScalar(len * t);
    parts.push(spike(s, [c.y, c.z], up, 0.145 - 0.075 * t + 0.012, [0.026 * k, 0.056 * k, 0.05 * k], DINO_SPIKE));
  }
  return colored(parts);
}

/** Pink nose over two muzzle puffs, and two thin whiskers on each side (they reach past the cheeks). */
export function kittyFaceGeo(s: Seg): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: ball(s, true), color: C.pink, at: [0, -0.014, 0.327], scale: [0.036, 0.026, 0.026] }];
  for (const sx of [-1, 1]) {
    parts.push({ geo: ball(s, true), color: KITTY_LIGHT, at: [sx * 0.042, -0.058, 0.3], scale: [0.05, 0.04, 0.035] });
    parts.push({ geo: rod(s, [sx * 0.095, -0.045, 0.335], [sx * 0.4, -0.02, 0.235], 0.006), color: WHISKER });
    parts.push({ geo: rod(s, [sx * 0.095, -0.07, 0.33], [sx * 0.39, -0.1, 0.23], 0.006), color: WHISKER });
  }
  return colored(parts);
}

/** Pointy ear (cone, flattened front to back) with a pink inside; origin = its joint, base just inside the head. */
export function kittyEarGeo(s: Seg): THREE.BufferGeometry {
  return colored([
    { geo: cone(s, 0.012, 0.1, 0.21), color: KITTY, at: [0, 0.095, 0], scale: [1, 1, 0.6] },
    { geo: cone(s, 0.008, 0.06, 0.135), color: C.pinkSoft, at: [0, 0.08, 0.035], rot: [-0.2, 0, 0], scale: [1, 1, 0.35] },
  ]);
}

/** Points along the kitty's tail: back from the joint, then a soft curl up and over. */
const KITTY_CURL: V3[] = [
  [0, 0, 0],
  [0, 0.015, -0.12],
  [0, 0.07, -0.24],
  [0, 0.18, -0.315],
  [0, 0.3, -0.325],
  [0, 0.38, -0.27],
];

/** Tail going back from the joint, then curling up with a light tip. */
export function kittyTailGeo(s: Seg): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let i = 1; i < KITTY_CURL.length; i++) parts.push({ geo: rod(s, KITTY_CURL[i - 1], KITTY_CURL[i], 0.046 - 0.0016 * i), color: KITTY });
  const tip = KITTY_CURL[KITTY_CURL.length - 1];
  parts.push({ geo: ball(s, true), color: KITTY_LIGHT, at: tip, scale: 0.045 });
  return colored(parts);
}
