import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactElement, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, clamp01, damp, frameDt, lerp } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored, sparkle, type Part } from "../shapes";
import type { EggDrive } from "./petDrives";

export type { EggDrive } from "./petDrives";

export type EggKind = "sky" | "sun" | "leaf" | "star";
// part of this module's public API (scenes pick eggs from it); editing this file just reloads instead of hot-swapping
// oxlint-disable-next-line react/only-export-components
export const EGG_KINDS: EggKind[] = ["sky", "sun", "leaf", "star"];

type V3 = [number, number, number];

/** Egg bottom above the ground (it sits in the nest's hollow). */
const EGG_BASE = 0.04;
const EGG_H = 0.5;
const EGG_R = 0.19;
/** Egg asymmetry: wider below the middle. */
const EGG_K = 0.16;
/** The break runs around the egg as a zigzag: profile angle T0 ± TA, TEETH points. */
const T0 = 1.62;
const TA = 0.13;
const TEETH = 8;
/** Shell thickness shown at the broken edge. */
const SHELL = 0.012;

/** Closed egg in its nest, ground to tip (model units). */
export const EGG_HEIGHT = EGG_BASE + EGG_H;
/** Lowest point of the open shell's zigzag rim above the ground (a pet at the nest centre shows above it). */
export const EGG_RIM_Y = 0.27;

/*
 * สีไข่ (พาสเทล) — ไม่ใช้น้ำเงิน (oral) หรือส้ม (nasal) ตามกติกาสีของแอป:
 * ไข่ฟ้าจึงเป็นฟ้าอมเขียวอ่อน (hue ≈ 188°) และไข่พระอาทิตย์ใช้จุดสีทองแทนจุดสีส้ม
 */
const SKY = "#c3eaf0"; // pale aqua sky (188°)
const SUN = "#ffe98f"; // butter yellow (48°)
const SUN_DOT = C.gold; // golden "sun" dots (44°)
const LEAF = C.mint; // mint (152°)
const STAR = "#d3c3fa"; // lilac (257°)
const STAR_GOLD = "#ffe680"; // lemon stars (48°)
const STRAW = "#f2e09e"; // nest straw (47°)

const SHELL_COLOR: Record<EggKind, string> = { sky: SKY, sun: SUN, leaf: LEAF, star: STAR };

/* ---------- egg surface: a lathe profile p(t), t ∈ [0, π] from the bottom tip to the top tip ---------- */

const eggY = (t: number) => (EGG_H / 2) * (1 - Math.cos(t));
const eggR = (t: number) => EGG_R * Math.sin(t) * (1 + EGG_K * Math.cos(t));

/** Outward unit normal of the profile at t as (radial, y). */
function eggN(t: number): [number, number] {
  const dy = (EGG_H / 2) * Math.sin(t);
  const dr = EGG_R * (Math.cos(t) + EGG_K * Math.cos(2 * t));
  const l = Math.hypot(dy, dr) || 1;
  return [dy / l, -dr / l];
}

/** Triangle wave, period 1: +1 at whole numbers, −1 halfway. */
const tri = (u: number) => 4 * Math.abs(u - Math.floor(u) - 0.5) - 1;
/** Profile angle of the zigzag break at azimuth `th` (th = 0 faces +Z). */
const splitT = (th: number) => T0 + TA * tri((th * TEETH) / (Math.PI * 2));

/** Lowest rim point (local to the egg). */
const RIM_MIN = eggY(T0 - TA);

function indexed(pos: number[], nor: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** One half of the shell (outer skin, inner lining, broken edge band), split along the zigzag. Egg-local: bottom tip at y = 0. */
function shellHalf(top: boolean, segs: number, rows: number): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry; edge: THREE.BufferGeometry } {
  const op: number[] = [];
  const on: number[] = [];
  const ip: number[] = [];
  const inn: number[] = [];
  const ep: number[] = [];
  const en: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const th = (i / segs) * Math.PI * 2;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    const ts = splitT(th);
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const t = top ? ts + (Math.PI - ts) * v : ts * v;
      const r = eggR(t);
      const y = eggY(t);
      const [nr, ny] = eggN(t);
      op.push(r * sn, y, r * cs);
      on.push(nr * sn, ny, nr * cs);
      const ri = r - nr * SHELL;
      ip.push(ri * sn, y - ny * SHELL, ri * cs);
      inn.push(-nr * sn, -ny, -nr * cs);
    }
    // broken edge: outer and inner rim points, facing along the surface (up for the bottom half, down for the top)
    const r = eggR(ts);
    const y = eggY(ts);
    const [nr, ny] = eggN(ts);
    const ri = r - nr * SHELL;
    ep.push(r * sn, y, r * cs, ri * sn, y - ny * SHELL, ri * cs);
    const tr = (top ? 1 : -1) * ny;
    const tyy = (top ? -1 : 1) * nr;
    for (let k = 0; k < 2; k++) en.push(tr * sn, tyy, tr * cs);
  }
  const oi: number[] = [];
  const ii: number[] = [];
  const ei: number[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = (i + 1) * (rows + 1) + j;
      oi.push(a, b, b + 1, a, b + 1, a + 1);
      ii.push(a, b + 1, b, a, a + 1, b + 1);
    }
    const o0 = 2 * i;
    if (top) ei.push(o0, o0 + 3, o0 + 2, o0, o0 + 1, o0 + 3);
    else ei.push(o0, o0 + 2, o0 + 3, o0, o0 + 3, o0 + 1);
  }
  return { outer: indexed(op, on, oi), inner: indexed(ip, inn, ii), edge: indexed(ep, en, ei) };
}

const UP = new THREE.Vector3(0, 1, 0);

/** A spot on the egg skin: position lifted along the normal, rotation with local +Y = normal, +X around the egg; `spin` turns about the normal. */
function onEgg(th: number, t: number, lift: number, spin: number): { at: V3; rot: V3 } {
  const r = eggR(t);
  const [nr, ny] = eggN(t);
  const sn = Math.sin(th);
  const cs = Math.cos(th);
  const n = new THREE.Vector3(nr * sn, ny, nr * cs);
  const u = new THREE.Vector3(cs, 0, -sn);
  const w = new THREE.Vector3().crossVectors(u, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, n, w));
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, spin));
  const e = new THREE.Euler().setFromQuaternion(q);
  return { at: [r * sn + n.x * lift, eggY(t) + n.y * lift, r * cs + n.z * lift], rot: [e.x, e.y, e.z] };
}

/** Pattern piece on the skin: a flat blob (s = width, thickness, height) or a little extruded star. */
interface Deco {
  th: number;
  t: number;
  s: V3;
  color: string;
  spin?: number;
  star?: boolean;
}

/** Bands for the pattern: below the break (hidden by nothing but the nest's rim) and above it. */
const BAND_LO = 1.16;
const BAND_HI = 2.2;

function starShapeGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 1 : 0.48;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2); // extrusion axis → +Y (the skin normal)
  return g;
}

/** Arc length ≈ `d` around the egg at profile angle t, as an azimuth step. */
const around = (t: number, d: number) => d / Math.max(0.05, eggR(t));

function decos(kind: EggKind): Deco[] {
  const out: Deco[] = [];
  switch (kind) {
    case "sky": {
      // white cloud blobs: two small puffs and a bigger one above them
      const cloud = (th: number, t: number) => {
        const d = around(t, 0.03);
        out.push({ th: th - d, t: t - 0.02, s: [0.03, 0.01, 0.024], color: C.white });
        out.push({ th: th + d, t: t - 0.02, s: [0.028, 0.01, 0.022], color: C.white });
        out.push({ th, t: t + 0.075, s: [0.036, 0.011, 0.028], color: C.white });
      };
      [-0.55, 1.15, 2.75, 4.35].forEach((th) => cloud(th, BAND_LO));
      [0.5, 2.6, 4.7].forEach((th) => cloud(th, BAND_HI));
      break;
    }
    case "sun": {
      [0.25, 1.4, 2.6, 3.8, 5.0].forEach((th, i) => {
        const r = i % 2 ? 0.028 : 0.034;
        out.push({ th, t: BAND_LO + (i % 2 ? 0.08 : -0.06), s: [r, 0.01, r], color: SUN_DOT });
      });
      [0.85, 2.05, 3.25, 4.45, 5.65].forEach((th, i) => {
        const r = i % 2 ? 0.026 : 0.031;
        out.push({ th, t: BAND_HI + (i % 2 ? 0.12 : -0.04), s: [r, 0.01, r], color: SUN_DOT });
      });
      out.push({ th: 0, t: 2.95, s: [0.03, 0.01, 0.03], color: SUN_DOT });
      break;
    }
    case "leaf": {
      // little leaf pairs (a "V"), two greens
      const sprig = (th: number, t: number) => {
        const d = around(t, 0.016);
        out.push({ th: th - d, t, s: [0.017, 0.008, 0.042], color: C.leafDeep, spin: 0.55 });
        out.push({ th: th + d, t, s: [0.017, 0.008, 0.042], color: C.leaf, spin: -0.55 });
      };
      [0, 1.55, 3.1, 4.7].forEach((th) => sprig(th, BAND_LO));
      [0.8, 2.9, 5.0].forEach((th) => sprig(th, BAND_HI + 0.04));
      out.push({ th: 0, t: 2.8, s: [0.016, 0.008, 0.038], color: C.leafDeep, spin: 0.4 });
      break;
    }
    case "star": {
      [0.2, 1.75, 3.3, 4.85].forEach((th, i) => {
        out.push({ th, t: BAND_LO + (i % 2 ? 0.06 : -0.05), s: [0.032, 0.024, 0.032], color: i % 2 ? C.white : STAR_GOLD, spin: i * 0.4, star: true });
      });
      [0.95, 2.5, 4.05, 5.6].forEach((th, i) => {
        out.push({ th, t: BAND_HI + (i % 2 ? 0.1 : -0.03), s: [0.028, 0.022, 0.028], color: i % 2 ? STAR_GOLD : C.white, spin: 0.3 + i * 0.5, star: true });
      });
      out.push({ th: 0, t: 2.97, s: [0.03, 0.022, 0.03], color: STAR_GOLD, star: true });
      break;
    }
  }
  // glossy highlight, upper left of the front
  out.push({ th: -0.6, t: 2.42, s: [0.016, 0.005, 0.045], color: C.white, spin: 0.35 });
  return out;
}

/** One half of an egg kind, shell + lining + pattern, as one vertex-coloured geometry. */
function eggHalf(kind: EggKind, top: boolean, low: boolean): THREE.BufferGeometry {
  const { outer, inner, edge } = shellHalf(top, low ? 32 : 64, low ? 7 : 11);
  const parts: Part[] = [
    { geo: outer, color: SHELL_COLOR[kind] },
    { geo: inner, color: C.cream },
    { geo: edge, color: C.cream },
  ];
  for (const d of decos(kind)) {
    if (d.t > T0 !== top) continue; // each piece belongs to the half it sits on (none straddle the break)
    const p = onEgg(d.th, d.t, d.star ? 0 : 0.002, d.spin ?? 0);
    parts.push({ geo: d.star ? starShapeGeo() : new THREE.SphereGeometry(1, 10, 7), color: d.color, at: p.at, rot: p.rot, scale: d.s });
  }
  return colored(parts);
}

/* ---------- cracks: thin ink capsules on the skin, more of the zigzag each step (level 3 = all the way round) ---------- */

type Pt = [number, number];
const zig = (k: number): Pt => [(k * Math.PI) / TEETH, T0 + (k % 2 === 0 ? TA : -TA)];

function crackLines(level: number): Pt[][] {
  const run = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => zig(from + i));
  const up: Pt[] = [zig(0), [0.13, T0 + TA + 0.16], [-0.04, T0 + TA + 0.3]];
  const downL: Pt[] = [zig(-3), [(-3 * Math.PI) / TEETH + 0.14, T0 - TA - 0.15], [(-3 * Math.PI) / TEETH + 0.02, T0 - TA - 0.28]];
  const downR: Pt[] = [zig(3), [(3 * Math.PI) / TEETH - 0.12, T0 - TA - 0.14], [(3 * Math.PI) / TEETH + 0.03, T0 - TA - 0.26]];
  if (level <= 1) return [run(-1, 1), up];
  if (level === 2) return [run(-3, 3), up, downL];
  return [run(0, 2 * TEETH), up, downL, downR];
}

function crackGeo(level: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const line of crackLines(level)) {
    for (let i = 0; i + 1 < line.length; i++) {
      a.fromArray(onEgg(line[i][0], line[i][1], 0.004, 0).at);
      b.fromArray(onEgg(line[i + 1][0], line[i + 1][1], 0.004, 0).at);
      const dir = b.clone().sub(a);
      const len = dir.length();
      e.setFromQuaternion(q.setFromUnitVectors(UP, dir.normalize()));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      parts.push({ geo: new THREE.CapsuleGeometry(0.0065, len, 2, 6), color: C.ink, at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z] });
    }
  }
  return colored(parts);
}

/* ---------- nest: straw bowl with a woven rim and two tucked leaves (one geometry) ---------- */

function nestGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), color: C.wickerDeep, scale: [0.25, 0.075, 0.25] },
    { geo: new THREE.TorusGeometry(0.2, 0.066, 8, 28), color: C.wicker, at: [0, 0.075, 0], rot: [Math.PI / 2, 0, 0] },
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    parts.push({
      geo: new THREE.CapsuleGeometry(0.011, 0.12, 2, 6),
      color: i % 2 ? STRAW : C.wickerDeep,
      at: [Math.cos(a) * 0.205, 0.13, Math.sin(a) * 0.205],
      rot: [0, Math.PI / 2 - a, Math.PI / 2 + (i % 2 ? 0.18 : -0.14)],
    });
  }
  parts.push({ geo: new THREE.SphereGeometry(1, 10, 6), color: C.leaf, at: [-0.2, 0.1, 0.17], scale: [0.05, 0.012, 0.025], rot: [0, 0.7, 0.3] });
  parts.push({ geo: new THREE.SphereGeometry(1, 10, 6), color: C.leafDeep, at: [-0.235, 0.09, 0.12], scale: [0.045, 0.012, 0.022], rot: [0, 1.3, 0.25] });
  return colored(parts);
}

/* ---------- hatch timing (seconds; reduced motion runs 1.5× slower) ---------- */

const SHAKE_S = 0.38;
const FLY_S = 0.7;
const SETTLE_S = 0.25;
/** Pivot of the flying top (≈ its middle), and where it comes to rest on the ground beside the nest (egg-local frame). */
const PIVOT_Y = 0.36;
const LAND: V3 = [0.5, -EGG_BASE + (PIVOT_Y - RIM_MIN) + 0.003, 0.08];
const SPARKS = 8;
const SPARK_COLORS = [C.gold, C.white, C.pink, C.mint].map((c) => new THREE.Color(c));
const scratch = new THREE.Object3D();

/** Top half along its flight: u = 0 on the egg … 1 resting beside the nest (right side up); `settle` = landing squash 0..1. */
function placeTop(g: THREE.Group, u: number, reduced: boolean, settle: number): void {
  const arc = reduced ? 0.14 : 0.38;
  g.position.set(lerp(0, LAND[0], u), lerp(PIVOT_Y, LAND[1], u) + arc * Math.sin(Math.PI * u), lerp(0, LAND[2], u));
  // one full flip in the air (none with reduced motion), a quarter turn to rest at an angle
  g.rotation.set(0, 0.5 * u, reduced ? 0 : -Math.PI * 2 * u);
  g.scale.set(1 + 0.06 * settle, 1 - 0.12 * settle, 1 + 0.06 * settle);
}

/**
 * ไข่ในรัง (สูงราว 0.55): ไข่ฟ้า (เมฆขาว) ไข่พระอาทิตย์ (จุดทอง) ไข่ใบไม้ (ใบไม้คู่) ไข่ดาว (ดาวเล็ก ๆ) — ลายเป็นชิ้นปั้น ไม่ใช้ texture
 * - `crack` 0–3: รอยร้าวหมึกบาง ๆ เพิ่มทีละขั้น (ขั้น 3 = ร้าวรอบตามแนวที่ไข่จะแตก) พร้อมสั่นสั้น ๆ ตอนร้าวเพิ่ม
 * - drive.wobble 0..1: ไข่โยกในรังแรงขึ้นตามค่า เป็นจังหวะ ๆ เหมือนมีอะไรขยับข้างใน
 * - drive.hatch เพิ่ม: สั่น → ฝาบนเด้งหมุนตัวไปตกข้างรัง มีประกายสั้น ๆ แล้วเปลือกล่างเปิดค้างไว้ (ฉากวางสัตว์เลี้ยงเอง)
 * reduced: โยกครึ่งเดียว ไม่เด้งกระโดด ฝาลอยต่ำและช้าลง ไม่หมุนตีลังกา ประกายน้อยลง
 */
export function Egg({ kind, crack, drive }: { kind: EggKind; crack: number; drive: RefObject<EggDrive> }): ReactElement {
  const kit = useKit();
  const low = kit.tier === "low";
  const geo = useMemo(
    () => ({
      nest: kit.geo("egg-nest", nestGeo),
      bottom: kit.geo(`egg-half|${kind}|bottom`, () => eggHalf(kind, false, low)),
      top: kit.geo(`egg-half|${kind}|top`, () => eggHalf(kind, true, low)),
    }),
    [kit, kind, low],
  );
  const level = Math.max(0, Math.min(3, Math.round(crack)));
  const cracks = level > 0 ? kit.geo(`egg-crack|${level}`, () => crackGeo(level)) : null;
  const mat = kit.clay(C.white, { vertexColors: true });
  const rock = useRef<THREE.Group>(null);
  const topRef = useRef<THREE.Group>(null);
  const crackRef = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const simRef = useRef({ p: new Float32Array(SPARKS * 3), v: new Float32Array(SPARKS * 3), life: new Float32Array(SPARKS), size: new Float32Array(SPARKS) });
  const st = useRef({ ready: false, t: 0, w: 0, crackSeen: 0, jigT: -1, hatchSeen: 0, hatchT: -1, popped: false, open: false, sparking: false });

  useLayoutEffect(() => {
    const m = sparks.current;
    if (!m) return;
    scratch.scale.setScalar(0);
    scratch.updateMatrix();
    for (let i = 0; i < SPARKS; i++) {
      m.setMatrixAt(i, scratch.matrix);
      m.setColorAt(i, SPARK_COLORS[i % SPARK_COLORS.length]);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.visible = false;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    const sim = simRef.current;
    if (!s.ready) {
      // first frame: a hatch counted before mount = already open (no replay)
      s.ready = true;
      s.t = Math.random() * 5;
      s.crackSeen = level;
      s.hatchSeen = d.hatch;
      s.open = d.hatch > 0;
    }
    const motion = d.reduced ? CALM.amp : 1;
    const slow = d.reduced ? CALM.slow : 1;
    s.t += dt;
    if (level !== s.crackSeen) {
      if (level > s.crackSeen) s.jigT = 0;
      s.crackSeen = level;
    }
    if (d.hatch !== s.hatchSeen) {
      s.hatchSeen = d.hatch;
      s.open = false;
      s.hatchT = d.hatch > 0 ? 0 : -1;
      s.popped = false;
    }

    // hatch timeline (in un-slowed seconds)
    let shake = 0;
    let squash = 0;
    let flyU = -1;
    let settle = 0;
    if (s.hatchT >= 0) {
      s.hatchT += dt / slow;
      const h = s.hatchT;
      if (h < SHAKE_S) {
        const k = h / SHAKE_S;
        shake = Math.sin(h * 46) * 0.11 * (0.4 + 0.6 * k) * motion;
        squash = 0.07 * k * motion;
      } else {
        flyU = clamp01((h - SHAKE_S) / FLY_S);
        squash = -0.05 * bump((h - SHAKE_S) / 0.25) * motion; // the bottom shell springs up as the top pops
        if (!d.reduced && h > SHAKE_S + FLY_S) settle = bump((h - SHAKE_S - FLY_S) / SETTLE_S);
        if (!s.popped) {
          s.popped = true;
          s.sparking = true;
          const count = d.reduced ? 3 : SPARKS;
          const speed = d.reduced ? CALM.amp : 1;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
            const out = (0.45 + Math.random() * 0.3) * speed;
            sim.p.set([0, EGG_BASE + 0.3, 0], i * 3);
            sim.v.set([Math.cos(a) * out, (0.9 + Math.random() * 0.5) * speed, Math.sin(a) * out * 0.7], i * 3);
            sim.life[i] = 0.75 + Math.random() * 0.25;
            sim.size[i] = 0.035 + Math.random() * 0.025;
          }
        }
        if (h >= SHAKE_S + FLY_S + SETTLE_S) {
          s.hatchT = -1;
          s.open = true;
        }
      }
    }
    const hatching = s.hatchT >= 0;

    // rocking in the nest: bursts that get stronger with wobble; a quick jiggle when a new crack appears
    s.w = damp(s.w, hatching || s.open ? 0 : clamp01(d.wobble), hatching || s.open ? 12 : 4, dt);
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(s.t * (1.7 + 2.3 * s.w)), 2.5);
    const amp = s.w * 0.17 * motion * (0.3 + 0.7 * pulse);
    let jig = 0;
    if (s.jigT >= 0) {
      s.jigT += dt / slow;
      jig = Math.sin(s.jigT * 38) * 0.07 * (1 - clamp01(s.jigT / 0.45)) * motion;
      if (s.jigT >= 0.45) s.jigT = -1;
    }
    const rg = rock.current;
    if (rg) {
      rg.rotation.set(Math.sin(s.t * 7.3 + 1) * amp * 0.35, 0, Math.sin(s.t * 10.5) * amp + jig + shake);
      rg.position.y = EGG_BASE + (d.reduced ? 0 : Math.max(0, Math.sin(s.t * 10.5)) * 0.012 * s.w * s.w * pulse);
      rg.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);
    }
    const tg = topRef.current;
    if (tg) {
      if (s.open) placeTop(tg, 1, d.reduced, 0);
      else if (flyU >= 0) placeTop(tg, flyU, d.reduced, settle);
      else {
        tg.position.set(0, PIVOT_Y, 0);
        tg.rotation.set(0, 0, 0);
        tg.scale.set(1, 1, 1);
      }
    }
    if (crackRef.current) crackRef.current.visible = !s.open && flyU < 0;

    // sparkles from the opening
    const m = sparks.current;
    if (m && s.sparking) {
      let any = false;
      for (let i = 0; i < SPARKS; i++) {
        if (sim.life[i] > 0) {
          sim.life[i] -= dt / slow;
          sim.v[i * 3 + 1] -= 2.6 * (dt / slow);
          for (let k = 0; k < 3; k++) sim.p[i * 3 + k] += sim.v[i * 3 + k] * (dt / slow);
          const sz = sim.size[i] * Math.min(1, sim.life[i] * 3);
          scratch.position.set(sim.p[i * 3], sim.p[i * 3 + 1], sim.p[i * 3 + 2]);
          scratch.rotation.set(0, sim.life[i] * 6, 0);
          scratch.scale.set(sz * 0.7, sz * 1.3, sz * 0.7);
          any = true;
        } else scratch.scale.setScalar(0);
        scratch.updateMatrix();
        m.setMatrixAt(i, scratch.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
      m.visible = any;
      s.sparking = any;
    }
  });

  return (
    <group>
      <mesh geometry={geo.nest} material={mat} receiveShadow />
      <group ref={rock} position={[0, EGG_BASE, 0]}>
        <mesh geometry={geo.bottom} material={mat} />
        {cracks ? <mesh ref={crackRef} geometry={cracks} material={mat} /> : null}
        <group ref={topRef} position={[0, PIVOT_Y, 0]}>
          <mesh geometry={geo.top} material={mat} position={[0, -PIVOT_Y, 0]} />
        </group>
      </group>
      <instancedMesh ref={sparks} args={[kit.geo("sparkle", sparkle), kit.basic(C.white), SPARKS]} frustumCulled={false} />
    </group>
  );
}
