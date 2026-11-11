import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, type ReactElement, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CALM, clamp01, easeInOutSine, easeOutCubic, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored, sparkle, type Part } from "../shapes";
import type { PlantDrive, WateringDrive } from "./petDrives";

export type { PlantDrive, WateringDrive } from "./petDrives";

export type PlantKind = "carrot" | "sunflower" | "strawberry" | "starfruit";
// part of this module's public API (scenes pick plants from it); editing this file just reloads instead of hot-swapping
// oxlint-disable-next-line react/only-export-components
export const PLANT_KINDS: PlantKind[] = ["carrot", "sunflower", "strawberry", "starfruit"];

/** Soil surface of GardenPlot above its base: stand plants (y = 0 of Plant) at this height inside the bed. */
export const GARDEN_SOIL_Y = 0.13;

type V3 = [number, number, number];

/*
 * สีสวน (พาสเทลอุ่น) — ไม่ใช้น้ำเงิน (oral) หรือส้ม (nasal): แครอทจึงเป็นแครอทสีม่วง (มีจริง) แทนสีส้ม
 * ดิน/ไม้เป็นน้ำตาลอมชมพูเข้ม ๆ แบบเดียวกับไม้ในฉากอื่น (ค่าในวงเล็บ = hue โดยประมาณ)
 */
const SOIL = "#8f6a5e"; // cocoa soil (15°, dark and soft)
const SOIL_LIGHT = "#a5817a"; // seed mounds, clumps (10°)
const SOIL_DARK = "#7a574d"; // clumps (13°)
const STRAW = "#f2e09e"; // straw (47°)
const CARROT = "#b77fe0"; // purple carrot (275°)
const CARROT_DEEP = "#9a62c4"; // carrot grooves (275°)
const PETAL = "#ffe36e"; // sunflower petals, seeds (48°)
const PETAL_DEEP = "#ffd84f"; // (47°)
const SUN_CENTER = "#8a5f55"; // cocoa sunflower centre (10°)
const BERRY = "#f25c78"; // strawberry red (349°)
const STAR_FRUIT = "#ffe066"; // (48°)
const STAR_GLOW = "#ffd84a"; // (47°)
const HALO = "#fff3b0"; // soft glow around the star fruit (51°)
const BUD = "#fff2a8"; // magic bud (52°)
const DROP = "#8fd8ea"; // water drops, aqua (192°)
const BEE = "#ffe680"; // (48°)
const SEED: Record<PlantKind, string> = { carrot: CARROT, sunflower: "#5f4b52", strawberry: PETAL, starfruit: C.gold };

const UP = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Object3D();

/* ---------- baking helpers: static parts become one vertex-coloured geometry (one draw call, cached in the kit) ---------- */

const ballGeo = () => new THREE.SphereGeometry(1, 10, 7);
const domeGeo = () => new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);

function blob(at: V3, s: number | V3, color: string, rot?: V3): Part {
  return { geo: ballGeo(), color, at, scale: s, rot };
}

/** Capsule from `from` to `to`. */
function rod(from: V3, to: V3, r: number, color: string): Part {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  const m = a.add(b).multiplyScalar(0.5);
  return { geo: new THREE.CapsuleGeometry(r, len, 3, 8), color, at: [m.x, m.y, m.z], rot: [e.x, e.y, e.z] };
}

/** Soft cone, rounded tip: base radius 1 at y = 0 (open), tip at y = 1. */
function softCone(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = (i / 8) * 0.8;
    pts.push(new THREE.Vector2((1 - u) * (1 + 0.3 * u), u));
  }
  for (let i = 1; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push(new THREE.Vector2(0.248 * Math.cos(a), 0.8 + 0.2 * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 14);
}

/** Puffy five-point star facing +Z, radius 1, centred on z = 0. */
function starGeo(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 1 : 0.5;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -0.15);
  return g;
}

/* ---------- แปลงผัก: กระบะดินยกสูง ขอบไม้มน เสามุมหัวกลม ก้อนดินและหญ้าเล็ก ๆ (1 ชิ้น) ---------- */

function plotGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: new RoundedBoxGeometry(1.06, 0.12, 0.66, 2, 0.04), color: SOIL, at: [0, 0.07, 0] },
    blob([0, 0.125, 0], [0.52, 0.02, 0.31], SOIL),
  ];
  for (const sz of [-1, 1]) parts.push({ geo: new RoundedBoxGeometry(1.2, 0.16, 0.08, 2, 0.03), color: C.wood, at: [0, 0.08, sz * 0.36] });
  for (const sx of [-1, 1]) parts.push({ geo: new RoundedBoxGeometry(0.08, 0.15, 0.66, 2, 0.03), color: C.wood, at: [sx * 0.56, 0.075, 0] });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({ geo: new THREE.CylinderGeometry(0.052, 0.058, 0.2, 12), color: C.woodDeep, at: [sx * 0.56, 0.1, sz * 0.36] });
      parts.push(blob([sx * 0.56, 0.2, sz * 0.36], [0.054, 0.03, 0.054], C.woodDeep));
    }
  }
  const clumps: V3[] = [
    [-0.38, 0.2, 0.035],
    [0.41, -0.18, 0.03],
    [-0.12, -0.24, 0.028],
    [0.2, 0.25, 0.03],
    [0.44, 0.17, 0.025],
  ];
  clumps.forEach(([x, z, r], i) => parts.push(blob([x, 0.132, z], [r, r * 0.55, r], i % 2 ? SOIL_DARK : SOIL_LIGHT)));
  for (const [x, z] of [
    [-0.47, -0.25],
    [0.46, 0.26],
  ]) {
    for (let k = 0; k < 3; k++) {
      parts.push({ geo: new THREE.ConeGeometry(0.022, 0.09, 5), color: k === 1 ? C.grassMid : C.grassDeep, at: [x + (k - 1) * 0.03, 0.17, z], rot: [0, 0, (1 - k) * 0.35] });
    }
  }
  return colored(parts);
}

/**
 * กระบะแปลงผักยกสูง ~1.2 × 0.8 (แกน X × Z) ขอบไม้มนสีไม้ ดินนูนนุ่ม ๆ — วางต้นไม้ที่ความสูง GARDEN_SOIL_Y
 * ภายในขอบ (|x| ≤ 0.48, |z| ≤ 0.28) ของนิ่ง ไม่มี useFrame
 */
export function GardenPlot(): ReactElement {
  const kit = useKit();
  return <mesh geometry={kit.geo("garden-plot", plotGeo)} material={kit.clay(C.white, { vertexColors: true })} receiveShadow />;
}

/* ---------- ต้นไม้ 4 ชนิด × 4 ขั้น: 0 เนินเมล็ด · 1 ต้นอ่อน · 2 กำลังโต · 3 พร้อมเก็บ (ผล/ดอกแยกชิ้นให้ลอยเบา ๆ) ---------- */

/** Height of the fruit / flower (sparkles twinkle around it). */
const FRUIT_Y: Record<PlantKind, number> = { carrot: 0.13, sunflower: 0.42, strawberry: 0.09, starfruit: 0.37 };
const STAR_AT: V3 = [-0.01, 0.37, 0.01];

function plantGeo(kind: PlantKind, stage: number): THREE.BufferGeometry {
  const parts: Part[] = [];
  const mound = (s: number) => parts.push({ geo: domeGeo(), color: SOIL_LIGHT, scale: [0.09 * s, 0.045 * s, 0.09 * s] });
  if (stage <= 0) {
    mound(1);
    parts.push(blob([0.005, 0.047, 0.012], [0.02, 0.014, 0.026], SEED[kind], [0.3, 0.4, 0.2]));
    return colored(parts);
  }
  if (stage === 1) {
    const magic = kind === "starfruit";
    mound(0.85);
    parts.push(rod([0, 0.02, 0], [0, 0.1, 0.005], 0.011, magic ? C.teal : C.leafDeep));
    parts.push(blob([-0.032, 0.108, 0.004], [0.036, 0.011, 0.022], magic ? C.mint : C.leaf, [0, 0, -0.45]));
    parts.push(blob([0.032, 0.108, 0.004], [0.036, 0.011, 0.022], magic ? C.lilacDeep : C.leafLight, [0, 0, 0.45]));
    return colored(parts);
  }
  const ready = stage >= 3;
  mound(1);
  switch (kind) {
    case "carrot": {
      // feathery top: six fronds fanning out, each with little leaflets across the stalk
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const tilt = 0.3 + (i % 2) * 0.14;
        const len = 0.15 + (i % 3) * 0.015;
        const dir: V3 = [Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a)];
        const along = (f: number): V3 => [dir[0] * len * f, 0.035 + dir[1] * len * f, dir[2] * len * f];
        const stalk = rod(along(0), along(1), 0.006, C.leafDeep);
        parts.push(stalk);
        for (const f of [0.5, 0.72, 0.94]) parts.push(blob(along(f), [0.032 * (1.2 - f * 0.45), 0.014, 0.009], f > 0.9 ? C.leafLight : C.leaf, stalk.rot));
      }
      if (!ready) parts.push({ geo: domeGeo(), color: CARROT, at: [0, 0.02, 0], scale: [0.035, 0.024, 0.035] });
      break;
    }
    case "sunflower": {
      parts.push(rod([0, 0.02, 0], [0, 0.37, 0.01], 0.016, C.leaf));
      parts.push(blob([-0.066, 0.15, 0.01], [0.07, 0.012, 0.036], C.leaf, [0.15, 0.3, -0.35]));
      parts.push(blob([0.068, 0.23, -0.005], [0.07, 0.012, 0.036], C.leafDeep, [-0.15, -0.3, 0.35]));
      if (!ready) {
        parts.push(blob([0, 0.385, 0.012], [0.045, 0.04, 0.045], C.leafDeep));
        parts.push(blob([0, 0.415, 0.016], [0.026, 0.02, 0.026], PETAL));
      }
      break;
    }
    case "strawberry": {
      // low bush of three-leaf clusters
      const clusters: V3[] = [
        [0.0, 0.075, 0.1],
        [1.3, 0.07, 0.09],
        [2.5, 0.065, 0.105],
        [3.8, 0.075, 0.085],
        [5.05, 0.07, 0.095],
      ];
      for (const [a, rad, h] of clusters) {
        const cx = Math.cos(a) * rad;
        const cz = Math.sin(a) * rad;
        parts.push(rod([cx * 0.25, 0.02, cz * 0.25], [cx, h - 0.01, cz], 0.007, C.leafDeep));
        for (let k = 0; k < 3; k++) {
          const b = a + (k - 1) * 0.75;
          parts.push(blob([cx + Math.cos(b) * 0.028, h + (k === 1 ? 0.01 : 0), cz + Math.sin(b) * 0.028], [0.03, 0.009, 0.026], k === 1 ? C.leafDeep : C.leaf, [0, -b, 0.2]));
        }
      }
      if (!ready) {
        const flowers: V3[] = [
          [-0.06, 0.135, 0.05],
          [0.07, 0.125, 0.04],
        ];
        for (const [x, y, z] of flowers) {
          parts.push(blob([x, y, z], [0.026, 0.009, 0.026], C.white, [-0.5, 0, 0]));
          parts.push(blob([x, y + 0.006, z + 0.006], 0.009, PETAL, [-0.5, 0, 0]));
        }
      }
      break;
    }
    case "starfruit": {
      // magic plant: teal stem with a curl, mint and lilac leaves
      parts.push(rod([0, 0.02, 0], [0.025, 0.17, 0], 0.013, C.teal));
      parts.push(rod([0.025, 0.17, 0], [-0.01, 0.31, 0.01], 0.012, C.teal));
      parts.push(blob([-0.052, 0.12, 0.01], [0.05, 0.011, 0.028], C.mint, [0, 0.2, -0.4]));
      parts.push(blob([0.075, 0.2, 0], [0.05, 0.011, 0.028], C.lilacDeep, [0, -0.2, 0.45]));
      parts.push(blob([-0.05, 0.265, 0.005], [0.04, 0.01, 0.024], C.mint, [0, 0.2, -0.5]));
      parts.push({ geo: new THREE.TorusGeometry(0.022, 0.005, 5, 14, Math.PI * 1.4), color: C.teal, at: [0.05, 0.29, 0], rot: [0, 0, -0.6] });
      if (!ready) parts.push(blob([STAR_AT[0], 0.335, STAR_AT[2]], 0.032, BUD));
      break;
    }
  }
  return colored(parts);
}

/** The ready fruit / flower of a plant (the star fruit is separate: it glows with its own material). */
function fruitGeo(kind: Exclude<PlantKind, "starfruit">): THREE.BufferGeometry {
  const parts: Part[] = [];
  switch (kind) {
    case "carrot": {
      // purple carrot top pushing out of the soil, ready to pull
      parts.push({ geo: softCone(), color: CARROT, at: [0, 0.07, 0], rot: [Math.PI, 0, 0], scale: [0.055, 0.22, 0.055] });
      parts.push({ geo: domeGeo(), color: CARROT, at: [0, 0.068, 0], scale: [0.055, 0.03, 0.055] });
      parts.push({ geo: new THREE.TorusGeometry(0.0495, 0.004, 4, 18), color: CARROT_DEEP, at: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0] });
      parts.push({ geo: new THREE.TorusGeometry(0.0443, 0.004, 4, 18), color: CARROT_DEEP, at: [0, 0.015, 0], rot: [Math.PI / 2, 0, 0] });
      return colored(parts);
    }
    case "sunflower": {
      // smiling sunflower head, built facing +Z, then tipped up a little and lifted onto the stem
      parts.push(blob([0, 0, -0.018], [0.06, 0.06, 0.02], C.leafDeep));
      parts.push(blob([0, 0, 0.004], [0.055, 0.055, 0.024], SUN_CENTER));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push(blob([Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.004], [0.022, 0.048, 0.01], i % 2 ? PETAL_DEEP : PETAL, [0, 0, a - Math.PI / 2]));
      }
      for (const sx of [-1, 1]) {
        parts.push(blob([sx * 0.02, 0.012, 0.026], [0.009, 0.012, 0.006], C.ink));
        parts.push(blob([sx * 0.034, -0.004, 0.022], [0.01, 0.007, 0.004], C.blush));
      }
      parts.push({ geo: new THREE.TorusGeometry(0.017, 0.0045, 4, 12, Math.PI * 0.8), color: C.ink, at: [0, -0.006, 0.026], rot: [0, 0, Math.PI * 1.1] });
      const g = colored(parts);
      g.rotateX(-0.3);
      g.translate(0, 0.41, 0.03);
      g.computeBoundingSphere();
      return g;
    }
    case "strawberry": {
      // three red berries resting on the soil at the front of the bush, with leafy caps and lemon seeds
      const spots: V3[] = [
        [-0.085, 0.045, 0.07],
        [0.09, 0.05, 0.06],
        [0.005, 0.04, 0.105],
      ];
      for (const [x, y, z] of spots) {
        parts.push({ geo: softCone(), color: BERRY, at: [x, y + 0.012, z], rot: [Math.PI, 0, 0], scale: [0.032, 0.058, 0.032] });
        parts.push({ geo: domeGeo(), color: BERRY, at: [x, y + 0.01, z], scale: [0.032, 0.016, 0.032] });
        parts.push(blob([x, y + 0.028, z], [0.026, 0.008, 0.026], C.leafDeep));
        parts.push(blob([x - 0.012, y - 0.002, z + 0.026], 0.0045, PETAL));
        parts.push(blob([x + 0.011, y + 0.004, z + 0.027], 0.0045, PETAL));
        parts.push(blob([x, y - 0.02, z + 0.017], 0.0045, PETAL));
      }
      return colored(parts);
    }
  }
}

/**
 * ต้นไม้ในสวน (แครอทม่วง ทานตะวันยิ้ม สตรอว์เบอร์รี ต้นผลดาววิเศษ) — ยืนบน y = 0 (ผิวดิน) หันหน้า +Z
 * `stage` 0–3: เนินเมล็ด → ต้นอ่อน → กำลังโต → พร้อมเก็บ (ผล/ดอกลอยขึ้นลงเบา ๆ มีประกายวิบวับ; ผลดาวเรืองแสง)
 * เมื่อ stage เพิ่ม: เด้งโตขึ้นสั้น ๆ (เกินแล้วคืน) — reduced: ขยายขึ้นนุ่ม ๆ ไม่เด้ง ขยับเบาลงครึ่งหนึ่ง
 * drive (ไม่บังคับ): wiggle เพิ่ม = ส่ายดีใจหนึ่งครั้ง (เช่น หลังรดน้ำ), reduced
 */
export function Plant({ kind, stage, drive }: { kind: PlantKind; stage: number; drive?: RefObject<PlantDrive> }): ReactElement {
  const kit = useKit();
  const level = Math.max(0, Math.min(3, Math.round(stage)));
  const ready = level === 3;
  const body = kit.geo(`garden-plant|${kind}|${level}`, () => plantGeo(kind, level));
  const fruitKind = kind === "starfruit" ? null : kind;
  const fruit = ready && fruitKind ? kit.geo(`garden-fruit|${fruitKind}`, () => fruitGeo(fruitKind)) : null;
  const mat = kit.clay(C.white, { vertexColors: true });
  const grow = useRef<THREE.Group>(null);
  const fruitRef = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const st = useRef({ ready: false, t: 0, stageSeen: 0, popT: -1, wiggleSeen: 0, wigT: -1 });

  useLayoutEffect(() => {
    const m = sparks.current;
    if (!m) return;
    scratch.position.set(0, 0, 0);
    scratch.scale.setScalar(0);
    scratch.updateMatrix();
    for (let i = 0; i < 3; i++) m.setMatrixAt(i, scratch.matrix);
    m.instanceMatrix.needsUpdate = true;
  }, [ready]);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive?.current;
    const reduced = d?.reduced ?? false;
    const motion = reduced ? CALM.amp : 1;
    const s = st.current;
    if (!s.ready) {
      s.ready = true;
      s.t = Math.random() * 6;
      s.stageSeen = level;
      s.wiggleSeen = d?.wiggle ?? 0;
    }
    s.t += dt;
    if (level !== s.stageSeen) {
      if (level > s.stageSeen) s.popT = 0;
      s.stageSeen = level;
    }
    const wiggle = d?.wiggle ?? 0;
    if (wiggle !== s.wiggleSeen) {
      s.wiggleSeen = wiggle;
      s.wigT = 0;
    }
    // grow pop: springy overshoot (reduced: a soft scale-in without bounce)
    let sc = 1;
    if (s.popT >= 0) {
      s.popT += dt;
      if (reduced) {
        const k = clamp01(s.popT / (0.35 * CALM.slow));
        sc = 0.8 + 0.2 * easeOutCubic(k);
        if (k >= 1) s.popT = -1;
      } else {
        sc = 1 - 0.45 * Math.exp(-7 * s.popT) * Math.cos(14 * s.popT);
        if (s.popT > 0.8) {
          s.popT = -1;
          sc = 1;
        }
      }
    }
    let wig = 0;
    if (s.wigT >= 0) {
      s.wigT += dt / (reduced ? CALM.slow : 1);
      const k = clamp01(s.wigT / 0.6);
      wig = Math.sin(s.wigT * 20) * 0.16 * (1 - k) * motion;
      if (k >= 1) s.wigT = -1;
    }
    const g = grow.current;
    if (g) {
      g.scale.setScalar(sc);
      g.rotation.set(0, 0, (level > 0 ? Math.sin(s.t * 1.3) * 0.025 * motion : 0) + wig);
    }
    if (!ready) return;
    // ready to pick: the fruit bobs, sparkles twinkle around it
    const f = fruitRef.current;
    if (f) {
      f.position.y = Math.sin(s.t * 2.6) * 0.012 * motion;
      if (kind === "sunflower") f.rotation.z = Math.sin(s.t * 1.7) * 0.04 * motion;
      if (kind === "starfruit") f.rotation.y = Math.sin(s.t * 1.2) * 0.5 * motion; // sways, always mostly facing front
    }
    halo.current?.scale.setScalar(0.105 * (1 + Math.sin(s.t * 3) * 0.12 * motion));
    const m = sparks.current;
    if (m) {
      const fy = FRUIT_Y[kind];
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.5;
        const tw = 0.5 + 0.5 * Math.sin(s.t * (reduced ? 1.6 : 3.2) + i * 2.1);
        scratch.position.set(Math.cos(a) * 0.15, fy + 0.05 * Math.sin(i * 1.7), Math.sin(a) * 0.1 + 0.04);
        scratch.rotation.set(0, s.t * motion, 0);
        scratch.scale.setScalar(0.024 * tw * tw * (reduced ? 0.7 : 1));
        scratch.updateMatrix();
        m.setMatrixAt(i, scratch.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <group ref={grow}>
        <mesh geometry={body} material={mat} />
        {ready ? (
          <group ref={fruitRef}>
            {fruit ? <mesh geometry={fruit} material={mat} /> : null}
            {kind === "starfruit" ? (
              <>
                <mesh
                  geometry={kit.geo("garden-star-fruit", starGeo)}
                  material={kit.clay(STAR_FRUIT, { emissive: STAR_GLOW, emissiveIntensity: 0.55, roughness: 0.5 })}
                  position={STAR_AT}
                  scale={0.065}
                />
                <mesh ref={halo} geometry={kit.sphere()} material={kit.basic(HALO, 0.22, true)} position={STAR_AT} scale={0.105} />
              </>
            ) : null}
          </group>
        ) : null}
        {ready ? <instancedMesh ref={sparks} args={[kit.geo("sparkle", sparkle), kit.basic(C.gold), 3]} frustumCulled={false} /> : null}
      </group>
    </group>
  );
}

/* ---------- บัวรดน้ำ: ชมพู ขอบชมพูเข้ม หูหิ้วโค้ง ปากฝักบัว ลายดอกไม้ข้างตัว (1 ชิ้น + หยดน้ำ 1 ชิ้น) ---------- */

/** The can tips forward about its front-bottom edge. */
const CAN_PIVOT_Z = 0.13;
/** Face of the sprinkler rose (can-local, before tipping). */
const ROSE_FACE = new THREE.Vector3(0, 0.278, 0.308);
const POUR_ANGLE = 0.9;
const TILT_S = 0.35;
const HOLD_S = 0.9;
const BACK_S = 0.4;
const DROPS = 10;

function canGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: new THREE.CylinderGeometry(0.12, 0.13, 0.2, 20), color: C.pink, at: [0, 0.1, 0] },
    { geo: new THREE.TorusGeometry(0.128, 0.014, 6, 24), color: C.raspberry, at: [0, 0.008, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.TorusGeometry(0.118, 0.015, 6, 24), color: C.raspberry, at: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: domeGeo(), color: C.pink, at: [0, 0.2, 0], scale: [0.115, 0.045, 0.115] },
    { geo: new THREE.TorusGeometry(0.09, 0.018, 8, 16, Math.PI), color: C.raspberry, at: [0, 0.235, -0.01], rot: [0, Math.PI / 2, 0] },
    rod([0, 0.07, 0.1], [0, 0.25, 0.28], 0.022, C.pink),
    { geo: new THREE.CylinderGeometry(0.045, 0.026, 0.04, 14), color: C.raspberry, at: [0, 0.264, 0.294], rot: [Math.PI / 4, 0, 0] },
  ];
  // a little white flower on the front-right side
  const phi = 0.95;
  const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
  const u = new THREE.Vector3(Math.cos(phi), 0, -Math.sin(phi));
  const c = n.clone().multiplyScalar(0.1245).add(new THREE.Vector3(0, 0.11, 0));
  for (let k = 0; k < 5; k++) {
    const b = (k / 5) * Math.PI * 2 + Math.PI / 2;
    const p = c.clone().addScaledVector(u, Math.cos(b) * 0.024).addScaledVector(UP, Math.sin(b) * 0.024);
    parts.push(blob([p.x, p.y, p.z], [0.015, 0.015, 0.006], C.white, [0, phi, 0]));
  }
  const ctr = c.clone().addScaledVector(n, 0.004);
  parts.push(blob([ctr.x, ctr.y, ctr.z], [0.01, 0.01, 0.006], PETAL, [0, phi, 0]));
  return colored(parts);
}

/**
 * บัวรดน้ำ (สูง ~0.35 ยาว ~0.45 ปากหันไป +Z) — drive.pour เพิ่ม = เอียงไปข้างหน้า รดหยดน้ำสักพัก แล้ววางกลับ
 * หยดน้ำตกลงไปหายที่ระดับ `floor` (y ในพิกัดของบัวรดน้ำ เช่น ผิวดินในแปลง) ราว 0.3–0.6 ข้างหน้าปากฝักบัว
 * reduced: ท่าเดิมช้าลง หยดน้ำน้อยลง
 */
export function WateringCan({ drive, floor = 0 }: { drive?: RefObject<WateringDrive>; floor?: number }): ReactElement {
  const kit = useKit();
  const tilt = useRef<THREE.Group>(null);
  const drops = useRef<THREE.InstancedMesh>(null);
  const simRef = useRef({ p: new Float32Array(DROPS * 3), v: new Float32Array(DROPS * 3), life: new Float32Array(DROPS), tip: new THREE.Vector3() });
  const st = useRef({ ready: false, seen: 0, t: -1, queued: false, next: 0, i: 0, live: false });

  useLayoutEffect(() => {
    const m = drops.current;
    if (!m) return;
    scratch.position.set(0, 0, 0);
    scratch.scale.setScalar(0);
    scratch.updateMatrix();
    for (let i = 0; i < DROPS; i++) m.setMatrixAt(i, scratch.matrix);
    m.instanceMatrix.needsUpdate = true;
    m.visible = false;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive?.current;
    const s = st.current;
    const sim = simRef.current;
    const pour = d?.pour ?? 0;
    if (!s.ready) {
      s.ready = true;
      s.seen = pour;
    }
    const reduced = d?.reduced ?? false;
    const slow = reduced ? CALM.slow : 1;
    if (pour !== s.seen) {
      s.seen = pour;
      if (s.t < 0) s.t = 0;
      else s.queued = true;
    }
    if (s.t < 0 && !s.live) return;
    let ang = 0;
    let pouring = false;
    if (s.t >= 0) {
      s.t += dt / slow;
      const h = s.t;
      if (h < TILT_S) ang = easeInOutSine(h / TILT_S);
      else if (h < TILT_S + HOLD_S) {
        ang = 1;
        pouring = true;
      } else ang = 1 - easeInOutSine((h - TILT_S - HOLD_S) / BACK_S);
      if (h >= TILT_S + HOLD_S + BACK_S) {
        s.t = s.queued ? 0 : -1;
        s.queued = false;
        ang = 0;
      }
    }
    const g = tilt.current;
    if (g) {
      g.rotation.x = ang * POUR_ANGLE;
      g.updateMatrix();
    }
    const m = drops.current;
    if (!m) return;
    if (pouring && g) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = reduced ? 0.2 : 0.085;
        const i = s.i;
        s.i = (i + 1) % DROPS;
        sim.tip.copy(ROSE_FACE).setZ(ROSE_FACE.z - CAN_PIVOT_Z).applyMatrix4(g.matrix);
        const a = Math.PI / 4 - POUR_ANGLE * ang;
        const sp = 0.5 + Math.random() * 0.15;
        sim.p.set([sim.tip.x + (Math.random() - 0.5) * 0.03, sim.tip.y, sim.tip.z], i * 3);
        sim.v.set([(Math.random() - 0.5) * 0.12, Math.sin(a) * sp, Math.cos(a) * sp], i * 3);
        sim.life[i] = 1.4;
      }
    }
    let any = false;
    for (let i = 0; i < DROPS; i++) {
      if (sim.life[i] > 0) {
        sim.life[i] -= dt;
        sim.v[i * 3 + 1] -= 3.2 * dt;
        for (let k = 0; k < 3; k++) sim.p[i * 3 + k] += sim.v[i * 3 + k] * dt;
        if (sim.p[i * 3 + 1] < floor) sim.life[i] = 0;
      }
      if (sim.life[i] > 0) {
        scratch.position.set(sim.p[i * 3], sim.p[i * 3 + 1], sim.p[i * 3 + 2]);
        scratch.scale.set(0.02, 0.03, 0.02);
        any = true;
      } else scratch.scale.setScalar(0);
      scratch.updateMatrix();
      m.setMatrixAt(i, scratch.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.visible = any;
    s.live = any;
  });

  return (
    <group>
      <group ref={tilt} position={[0, 0, CAN_PIVOT_Z]}>
        <mesh geometry={kit.geo("garden-can", canGeo)} material={kit.clay(C.white, { vertexColors: true })} position={[0, 0, -CAN_PIVOT_Z]} />
      </group>
      <instancedMesh ref={drops} args={[kit.sphereLo(), kit.clay(DROP, { roughness: 0.3 }), DROPS]} frustumCulled={false} />
    </group>
  );
}

/* ---------- รั้วไม้สั้น: เสารั้วหัวมน 4 ต้น คานสองเส้น สีครีม (1 ชิ้น) ---------- */

function fenceGeo(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (const y of [0.12, 0.27]) parts.push({ geo: new RoundedBoxGeometry(0.94, 0.05, 0.03, 2, 0.014), color: C.creamShade, at: [0, y, -0.025] });
  for (let i = 0; i < 4; i++) parts.push({ geo: new THREE.CapsuleGeometry(0.05, 0.3, 4, 10), color: C.cream, at: [-0.36 + i * 0.24, 0.18, 0], scale: [1, 1, 0.36] });
  return colored(parts);
}

/** รั้วสั้นยาว ~0.94 ตามแกน X สูง ~0.38 (ต่อกันได้ทุก 0.96) ของนิ่ง */
export function Fence(): ReactElement {
  const kit = useKit();
  return <mesh geometry={kit.geo("garden-fence", fenceGeo)} material={kit.clay(C.white, { vertexColors: true })} />;
}

/* ---------- หุ่นไล่กาใจดี: เสื้อมิ้นต์มีผ้าปะชมพู มือฟาง หน้ากระสอบยิ้ม หมวกฟางคาดชมพู (1 ชิ้น) ---------- */

function scarecrowGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: new THREE.CylinderGeometry(0.035, 0.042, 0.9, 10), color: C.woodDeep, at: [0, 0.45, -0.01] },
    rod([-0.36, 0.63, -0.01], [0.36, 0.63, -0.01], 0.026, C.wood),
    blob([0, 0.55, 0], [0.16, 0.19, 0.11], C.mint),
    rod([-0.1, 0.64, 0], [-0.3, 0.62, 0], 0.055, C.mint),
    rod([0.1, 0.64, 0], [0.3, 0.62, 0], 0.055, C.mint),
    blob([0.06, 0.5, 0.1], [0.04, 0.04, 0.012], C.pink, [0, 0.3, 0.2]),
  ];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = (k - 1) * 0.45;
      parts.push(rod([sx * 0.33, 0.62, 0], [sx * (0.33 + Math.cos(a) * 0.08), 0.62 + Math.sin(a) * 0.08, 0.01], 0.012, STRAW));
    }
  }
  for (let k = 0; k < 3; k++) parts.push(rod([(k - 1) * 0.06, 0.39, 0.02], [(k - 1) * 0.08, 0.32, 0.04], 0.012, STRAW));
  parts.push(blob([0, 0.84, 0], [0.13, 0.13, 0.12], C.wicker));
  for (const sx of [-1, 1]) {
    parts.push(blob([sx * 0.045, 0.865, 0.108], [0.016, 0.02, 0.01], C.ink));
    parts.push(blob([sx * 0.045 + 0.005, 0.872, 0.116], 0.005, C.white));
    parts.push(blob([sx * 0.078, 0.825, 0.096], [0.02, 0.012, 0.008], C.blush, [0, sx * 0.6, 0]));
  }
  parts.push({ geo: new THREE.TorusGeometry(0.03, 0.006, 4, 14, Math.PI * 0.8), color: C.ink, at: [0, 0.832, 0.118], rot: [0.2, 0, Math.PI * 1.1] });
  parts.push({ geo: new THREE.CylinderGeometry(0.21, 0.21, 0.02, 24), color: STRAW, at: [0, 0.94, 0], rot: [0.08, 0, 0.05] });
  parts.push({ geo: new THREE.CylinderGeometry(0.085, 0.105, 0.09, 16), color: STRAW, at: [0, 0.99, 0] });
  parts.push({ geo: new THREE.TorusGeometry(0.103, 0.015, 6, 20), color: C.pink, at: [0, 0.955, 0], rot: [Math.PI / 2, 0, 0] });
  parts.push(blob([0.07, 0.965, 0.07], 0.022, C.white));
  parts.push(blob([0.07, 0.965, 0.088], 0.009, PETAL));
  return colored(parts);
}

/** หุ่นไล่กาใจดี สูง ~1.05 กว้าง ~0.8 หันหน้า +Z — โยกเบา ๆ (reduced = นิ่ง) */
export function Scarecrow({ reduced = false }: { reduced?: boolean }): ReactElement {
  const kit = useKit();
  const sway = useRef<THREE.Mesh>(null);
  const t = useRef(-1);
  useFrame((_, dt) => {
    const m = sway.current;
    if (!m) return;
    if (t.current < 0) t.current = Math.random() * 10;
    t.current += frameDt(dt);
    m.rotation.z = reduced ? 0 : Math.sin(t.current * 0.9) * 0.02;
  });
  return <mesh ref={sway} geometry={kit.geo("garden-scarecrow", scarecrowGeo)} material={kit.clay(C.white, { vertexColors: true })} />;
}

/* ---------- ผึ้งน้อย: ตัวเหลืองลายหมึก ปีกใสกระพือ บินวนช้า ๆ รอบจุดตั้งต้น (9 ชิ้น) ---------- */

const ANTENNA = (() => {
  const from = new THREE.Vector3(0.012, 0.035, 0.045);
  const to = new THREE.Vector3(0.03, 0.075, 0.07);
  const dir = to.clone().sub(from);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  return { mid: from.clone().add(to).multiplyScalar(0.5), len: dir.length(), rot: [e.x, e.y, e.z] as V3 };
})();

/** ผึ้งตัวเล็ก (ยาว ~0.13) บินวนวงรีช้า ๆ รอบจุดที่วาง (รัศมี ~0.3) — reduced: ลอยนิ่งที่จุดนั้น ไม่ขยับ */
export function Bee({ reduced = false }: { reduced?: boolean }): ReactElement {
  const kit = useKit();
  const fly = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Group>(null);
  const wingR = useRef<THREE.Group>(null);
  const t = useRef(-1);
  useFrame((_, dt) => {
    const g = fly.current;
    if (!g) return;
    if (reduced) {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
      wingL.current?.rotation.set(0, 0, 0.35);
      wingR.current?.rotation.set(0, 0, -0.35);
      return;
    }
    if (t.current < 0) t.current = Math.random() * 10;
    t.current += frameDt(dt);
    const tt = t.current;
    const ph = tt * 0.75;
    g.position.set(0.32 * Math.cos(ph), 0.05 * Math.sin(2 * ph) + 0.012 * Math.sin(tt * 7), 0.22 * Math.sin(ph));
    g.rotation.set(0, Math.atan2(-0.32 * Math.sin(ph), 0.22 * Math.cos(ph)), 0.15);
    const flap = 0.35 + 0.45 * Math.sin(tt * 42);
    wingL.current?.rotation.set(0, 0, flap);
    wingR.current?.rotation.set(0, 0, -flap);
  });
  const ink = kit.clay(C.ink);
  return (
    <group ref={fly}>
      <mesh geometry={kit.sphere()} material={kit.clay(BEE)} scale={[0.05, 0.045, 0.065]} />
      <mesh geometry={kit.sphereLo()} material={ink} position={[0, 0, -0.002]} scale={[0.0525, 0.0475, 0.012]} />
      <mesh geometry={kit.sphereLo()} material={ink} position={[0, 0, -0.03]} scale={[0.0455, 0.041, 0.011]} />
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh geometry={kit.sphereLo()} material={ink} position={[sx * 0.02, 0.012, 0.056]} scale={[0.01, 0.013, 0.007]} />
          <mesh
            geometry={kit.capsule(0.0045, Number(ANTENNA.len.toFixed(3)))}
            material={ink}
            position={[sx * ANTENNA.mid.x, ANTENNA.mid.y, ANTENNA.mid.z]}
            rotation={[ANTENNA.rot[0], sx * ANTENNA.rot[1], sx * ANTENNA.rot[2]]}
          />
          <group ref={sx < 0 ? wingL : wingR} position={[sx * 0.015, 0.04, -0.005]}>
            <mesh geometry={kit.sphereLo()} material={kit.clay(C.white, { opacity: 0.7 })} position={[sx * 0.038, 0.012, 0]} scale={[0.042, 0.006, 0.026]} rotation={[0, 0, sx * 0.3]} />
          </group>
        </group>
      ))}
    </group>
  );
}
