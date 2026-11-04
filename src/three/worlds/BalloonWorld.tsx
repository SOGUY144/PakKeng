import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tripById, type TripId } from "../../data/trips";
import { BALLOONS_PER_ROUND } from "../../logic/balloon";
import { bump, clamp01, damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Balloon } from "../models/Balloon";
import { Bunny } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, ScrollField, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { BalloonSpec } from "../spec";

type V3 = [number, number, number];

/** Basket height for delivery progress 0..1 (in-zone time so far / the plan's hold time): from the pad up to the pin. */
const BASE_Y = 0.12;
const TOP_Y = 3.6;
const altitude = (p: number) => BASE_Y + clamp01(p) * (TOP_Y - BASE_Y);
/** The route to the destination: dots that light up as the basket passes them, ending under the pin. */
const ROUTE_X = 0.8;
const ROUTE_Z = 0.15;
const DOTS = 12;
const PIN: V3 = [ROUTE_X, TOP_Y + 0.2, ROUTE_Z];
/** Anchor of the destination's name tag: under the porch, clear of the balloon's path and of the balloons tied up above. */
const TAG: V3 = [ROUTE_X + 0.16, TOP_Y - 0.45, 0.3];
/** Delivered balloons stay tied up at the destination: a small bunch above the porch, beside the pin, in front of the house. */
const MOOR: V3[] = [
  [1.2, TOP_Y + 0.55, 0.32],
  [1.55, TOP_Y + 0.85, 0.22],
  [1.02, TOP_Y + 1.0, 0.12],
];
const MOOR_SCALE = 0.4;
const BUNNY_AT: V3 = [-1.35, 0, 0.55];
const SLOTS = BALLOONS_PER_ROUND;
/** One calm breath of the waiting balloon during the rest (seconds). */
const BREATH_S = 4.5;

const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ball = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);

/* Destinations (one vertex-coloured mesh each). The porch / gallery / cloud edge sits at TOP_Y just right of the route. */

function treehouse(): THREE.BufferGeometry {
  const P = TOP_Y;
  const parts: S.Part[] = [
    { geo: cyl(0.17, 0.26, P + 0.5, 12), color: C.bark, at: [2.0, (P + 0.5) / 2, -0.3] },
    { geo: ball(0.2), color: C.bark, at: [1.8, 0.05, -0.15], scale: [1.4, 0.5, 1] },
    { geo: ball(0.2), color: C.bark, at: [2.22, 0.05, -0.2], scale: [1.3, 0.5, 1] },
    { geo: cyl(0.05, 0.07, 1.13, 8), color: C.bark, at: [1.5, P - 0.5, -0.2], rot: [0, 0, Math.PI / 4] },
    // leaves along the trunk, so it reads as a tree from the ground up
    { geo: ball(0.42), color: C.leaf, at: [2.35, 2.1, -0.55] },
    { geo: ball(0.3), color: C.leafLight, at: [1.72, 1.5, -0.5] },
    // porch with a front rail
    { geo: box(1.9, 0.12, 1.15), color: C.wood, at: [1.84, P - 0.06, -0.2] },
    { geo: box(1.9, 0.05, 0.05), color: C.woodDeep, at: [1.84, P + 0.27, 0.34] },
    // the house and the canopy behind it
    { geo: box(0.92, 0.72, 0.72), color: "#f0c48f", at: [2.08, P + 0.36, -0.3] },
    { geo: cone(0.72, 0.52, 4), color: C.raspberry, at: [2.08, P + 0.98, -0.3], rot: [0, Math.PI / 4, 0] },
    { geo: box(0.26, 0.42, 0.03), color: C.woodDeep, at: [1.88, P + 0.21, 0.07] },
    { geo: box(0.22, 0.2, 0.03), color: C.butter, at: [2.31, P + 0.45, 0.07] },
    { geo: ball(0.78), color: C.leaf, at: [2.28, P + 0.95, -0.95] },
    { geo: ball(0.55), color: C.leafLight, at: [1.5, P + 0.7, -0.95] },
    { geo: ball(0.48), color: C.leafDeep, at: [2.74, P + 0.45, -0.75] },
    { geo: ball(0.45), color: C.leafLight, at: [2.02, P + 1.45, -0.85] },
  ];
  for (const x of [0.95, 1.55, 2.15, 2.72]) parts.push({ geo: cyl(0.025, 0.025, 0.28, 6), color: C.woodDeep, at: [x, P + 0.14, 0.34] });
  return S.colored(parts);
}

function lighthouse(): THREE.BufferGeometry {
  const P = TOP_Y;
  const rail = "#5b5068";
  const parts: S.Part[] = [
    { geo: ball(0.7, 12, 8), color: C.stoneDeep, at: [2.0, 0.08, -0.3], scale: [1.25, 0.45, 1] },
    { geo: ball(0.4, 10, 7), color: C.stone, at: [1.35, 0.06, 0.05], scale: [1, 0.5, 0.9] },
    { geo: ball(0.35, 10, 7), color: C.stone, at: [2.7, 0.05, 0.1], scale: [1, 0.5, 0.9] },
  ];
  // the tower: tapering bands, raspberry and cream
  const bands = 7;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * P;
    const y1 = ((i + 1) / bands) * P;
    parts.push({ geo: cyl(0.58 - 0.18 * ((i + 1) / bands), 0.58 - 0.18 * (i / bands), y1 - y0, 20), color: i % 2 ? C.cream : C.raspberry, at: [2.0, (y0 + y1) / 2, -0.3] });
  }
  parts.push(
    { geo: box(0.16, 0.24, 0.03), color: rail, at: [2.0, P * 0.55, 0.18] },
    // gallery (the delivery porch), rail, lamp room, dome
    { geo: cyl(0.92, 0.92, 0.1, 28), color: rail, at: [2.0, P - 0.05, -0.3] },
    { geo: new THREE.TorusGeometry(0.88, 0.025, 6, 32), color: rail, at: [2.0, P + 0.3, -0.3], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.32, 0.34, 0.55, 18), color: C.butter, at: [2.0, P + 0.3, -0.3] },
    { geo: new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: C.raspberry, at: [2.0, P + 0.57, -0.3] },
    { geo: ball(0.07, 8, 6), color: C.gold, at: [2.0, P + 1.0, -0.3] },
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push({ geo: cyl(0.02, 0.02, 0.3, 5), color: rail, at: [2.0 + Math.cos(a) * 0.88, P + 0.15, -0.3 + Math.sin(a) * 0.88] });
  }
  return S.colored(parts);
}

function cloudCastle(): THREE.BufferGeometry {
  const P = TOP_Y;
  const puff = (x: number, y: number, z: number, r: number, color: string = C.white): S.Part => ({ geo: ball(r), color, at: [x, y, z], scale: [1, 0.62, 0.9] });
  return S.colored([
    puff(2.0, P - 0.2, -0.35, 0.95),
    puff(1.42, P - 0.25, -0.1, 0.5),
    puff(2.6, P - 0.22, -0.15, 0.6),
    puff(1.7, P - 0.48, 0.2, 0.48, C.lilacLight),
    puff(2.36, P - 0.5, 0.25, 0.5, C.lilacLight),
    puff(2.78, P - 0.45, -0.5, 0.45, C.lilacLight),
    { geo: box(0.7, 0.8, 0.6), color: C.lilac, at: [2.0, P + 0.4, -0.4] },
    { geo: cone(0.5, 0.5, 4), color: C.lilacDeep, at: [2.0, P + 1.05, -0.4], rot: [0, Math.PI / 4, 0] },
    { geo: cyl(0.17, 0.19, 1.15), color: C.cream, at: [1.5, P + 0.5, -0.25] },
    { geo: cone(0.24, 0.45, 14), color: C.pink, at: [1.5, P + 1.3, -0.25] },
    { geo: cyl(0.17, 0.19, 1.15), color: C.cream, at: [2.5, P + 0.5, -0.25] },
    { geo: cone(0.24, 0.45, 14), color: C.pink, at: [2.5, P + 1.3, -0.25] },
    { geo: box(0.22, 0.32, 0.03), color: C.lilacDeep, at: [2.0, P + 0.16, -0.09] },
    { geo: box(0.08, 0.14, 0.03), color: C.butter, at: [1.5, P + 0.75, -0.07] },
    { geo: box(0.08, 0.14, 0.03), color: C.butter, at: [2.5, P + 0.75, -0.07] },
  ]);
}

/** No destination picked: a small cloud to tie up at. */
function cloudDock(): THREE.BufferGeometry {
  return S.colored([
    { geo: ball(0.6), color: C.white, at: [1.75, TOP_Y - 0.15, -0.3], scale: [1, 0.6, 0.9] },
    { geo: ball(0.42), color: C.white, at: [1.3, TOP_Y - 0.2, -0.1], scale: [1, 0.6, 0.9] },
    { geo: ball(0.45), color: C.lilacLight, at: [2.2, TOP_Y - 0.25, -0.1], scale: [1, 0.6, 0.9] },
  ]);
}

/** Map pin, tip at the origin: where the balloon is delivered. */
function pinShape(): THREE.BufferGeometry {
  return S.colored([
    { geo: cone(0.115, 0.3, 14), color: C.raspberry, at: [0, 0.15, 0], rot: [Math.PI, 0, 0] },
    { geo: ball(0.16, 16, 12), color: C.raspberry, at: [0, 0.36, 0] },
    { geo: ball(0.062, 10, 8), color: C.cream, at: [0, 0.37, 0.125] },
  ]);
}

/** Small warm burner flame (butter yellow, never the orange of nasal values). */
function flameShape(): THREE.BufferGeometry {
  return S.colored([
    { geo: cone(0.07, 0.2, 10), color: C.butter, at: [0, 0.12, 0] },
    { geo: ball(0.068, 10, 8), color: "#fff4c2", at: [0, 0.03, 0] },
  ]);
}

function layout(id: TripId | null) {
  const r = seeded(23);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  // ground decor keeps clear of the pad, the bunny and the foot of the destination
  const free = (p: Placement) =>
    Math.hypot(p.x, p.z) > 0.85 && Math.hypot(p.x - BUNNY_AT[0], p.z - BUNNY_AT[2]) > 0.6 && !(p.x > 0.7 && p.x < 3.3 && p.z < 0.9);
  const scatter = (n: number, s0: number, s1: number): Placement[] =>
    Array.from({ length: n }, () => {
      const left = r() < 0.65;
      return { x: left ? rnd(-4.6, -0.6) : rnd(0.9, 4.6), z: rnd(-2.2, 1.6), s: rnd(s0, s1), ry: rnd(0, 6) };
    }).filter(free);
  const sea = id === "lighthouse";
  const castle = id === "cloud-castle";
  return {
    trees: sea
      ? []
      : ([
          { x: -3.3, z: -1.6, s: 1.25, ry: 1 },
          { x: -4.4, z: -0.2, s: 1.1, ry: 4 },
          { x: 4.2, z: -1.4, s: castle ? 0.9 : 1.05, ry: 2 },
        ] as Placement[]),
    bushes: sea ? [] : scatter(5, 0.7, 1.05),
    rocks: sea ? scatter(6, 0.8, 1.3) : [],
    tufts: sea ? scatter(10, 0.9, 1.3) : [],
    flowersA: sea ? [] : scatter(9, 0.9, 1.3),
    flowersB: sea ? [] : scatter(8, 0.9, 1.3),
    hills: (sea
      ? [{ x: -4.5, y: -0.35, z: -7, s: 3.2 }]
      : [
          { x: -4.5, y: -0.35, z: -7, s: 3.2 },
          { x: 1.5, y: -0.4, z: -8.5, s: 3.8 },
          { x: 6, y: -0.35, z: -7.5, s: 3 },
        ]) as Placement[],
    // clouds drift sideways at fixed heights, behind everything
    clouds: [
      { x: -2.8, y: 1.35, z: -2.6, s: 0.75 },
      { x: 2.7, y: 2.3, z: -3.4, s: 0.95 },
      { x: -2.6, y: 3.3, z: -3.6, s: 0.9 },
      { x: -1.2, y: 5.0, z: -6, s: 1.2 },
      { x: 5.5, y: 3.0, z: -5, s: 1.1 },
    ].map((c) => ({ ...c, x: c.x + 7, ry: 0 })),
  };
}

/**
 * พาบอลลูนไปส่ง 3D: ทุ่งหญ้า (หรือชายหาด) กับจุดหมายที่เด็กเลือก กล้องอยู่กับที่
 * - บอลลูนลูกปัจจุบันลอยจากแท่นขึ้นตาม “ความคืบหน้า” = เวลาในโซนที่สะสมแล้ว / เวลาในแผน (ไม่ใช่ตามค่าเสียงทันที)
 *   จึงลอยขึ้นด้วยความเร็วเดียวกันทุกค่าที่ผ่านเกณฑ์ หยุดพูดแล้วบอลลูนรออยู่ที่เดิม ไม่ตก
 * - ถึงหมุด = ส่งถึง: กระต่ายเชียร์ หมุดเด้ง ประกายสั้น ๆ แล้วพัก (บอลลูนที่ส่งรอที่หมุด ลูกถัดไป “หายใจ” ช้า ๆ บนแท่น)
 * - เปลวไฟเหลืองนวล = เกมได้ยินเสียงที่ใช้ได้ วงแหวนน้ำเงินรอบตะกร้า = เสียงผ่านเกณฑ์ด้านปากของผู้เชี่ยวชาญ (สีน้ำเงินสื่อค่าด้านปาก)
 * - จุดบนทางขึ้นสว่างตามความคืบหน้า บอลลูนที่ส่งแล้วผูกรวมกันที่จุดหมาย ป้ายชื่อจุดหมายเป็น HTML (ไม่ใช่ texture) อยู่กับที่
 */
export function BalloonWorld({ gameRef, frameRef, labelRef, reduced, tier, destination }: BalloonSpec) {
  const kit = useKit();
  const trip = tripById(destination);
  const id = trip?.id ?? null;
  const L = useMemo(() => layout(id), [id]);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const geo = useMemo(
    () => ({
      tree: kit.geo("tree", S.tree),
      bush: kit.geo("bush", S.bush),
      rock: kit.geo("rock", S.rock),
      tuft: kit.geo("tuft", S.grassTuft),
      flowerA: id === "cloud-castle" ? kit.geo("flower-lilac", () => S.flower(C.lilacDeep)) : kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerB: id === "cloud-castle" ? kit.geo("flower-pink", () => S.flower(C.pink)) : kit.geo("flower-white", () => S.flower(C.white)),
      hill: kit.geo("hill", S.hill),
      cloud: kit.geo("cloud", S.cloud),
      ground: kit.geo("ground-40x30", () => new THREE.PlaneGeometry(40, 30)),
      sea: kit.geo("balloon-sea", () => new THREE.CircleGeometry(7, 48)),
      pad: kit.geo("balloon-pad", () => new THREE.CylinderGeometry(0.62, 0.68, 0.12, 28)),
      landmark: kit.geo(`balloon-landmark-${id ?? "cloud"}`, () =>
        id === "treehouse" ? treehouse() : id === "lighthouse" ? lighthouse() : id === "cloud-castle" ? cloudCastle() : cloudDock(),
      ),
      pin: kit.geo("balloon-pin", pinShape),
      flame: kit.geo("balloon-flame", flameShape),
    }),
    [kit, id],
  );
  const shadows = tier !== "low";

  const bunny = useRef(bunnyDrive({ pose: "stand", reduced }));
  const crafts = useRef<(THREE.Group | null)[]>([]);
  const shadow = useRef<THREE.Mesh>(null);
  const shadowMat = useMemo(() => kit.blobMaterial("balloon"), [kit]);
  const flame = useRef<THREE.Mesh>(null);
  const flameMat = useMemo(() => kit.clay(C.white, { vertexColors: true, emissive: "#ffe7a3", emissiveIntensity: 0.55 }), [kit]);
  const zoneRing = useRef<THREE.Mesh>(null);
  const zoneMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.oral, transparent: true, opacity: 0, depthWrite: false })), [kit]);
  const pin = useRef<THREE.Mesh>(null);
  const dots = useRef<THREE.InstancedMesh>(null);
  const dotMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: "#ffffff" })), [kit]);
  const dotColor = useMemo(() => ({ lit: new THREE.Color(C.gold), dim: new THREE.Color("#ddd2ea") }), []);
  const cloudOffset = useRef(0);
  const fire = useRef<BurstFire>({ seq: 0, x: PIN[0], y: PIN[1], z: PIN[2] });
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const st = useRef({
    game: null as unknown,
    completed: 0,
    pos: Array.from({ length: SLOTS }, () => new THREE.Vector3(0, BASE_Y, 0)),
    scale: Array.from({ length: SLOTS }, () => 0),
    zone: 0,
    flame: 0,
    lit: -1,
    pinT: -1,
    t: 0,
    label: "",
    labelW: 0,
    labelFor: 0,
  });

  // route dots: placed once, recoloured as the balloon passes them
  useLayoutEffect(() => {
    const m = dots.current;
    if (!m) return;
    const d = new THREE.Object3D();
    for (let k = 0; k < DOTS; k++) {
      d.position.set(ROUTE_X, altitude((k + 1) / DOTS) + 0.12, ROUTE_Z);
      d.scale.setScalar(k === DOTS - 1 ? 0.075 : 0.05);
      d.updateMatrix();
      m.setMatrixAt(k, d.matrix);
      m.setColorAt(k, dotColor.dim);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [dotColor]);

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    const w = st.current;
    w.t += dt;
    if (!reduced) cloudOffset.current += dt * 0.12;

    const fresh = w.game !== g;
    if (fresh) {
      // new round (restart): everything snaps into place
      w.game = g;
      w.completed = s.completed;
      w.lit = -1;
      w.pinT = -1;
    }
    const n = Math.min(SLOTS, g.cfg.balloonsPerRound);
    const at = s.results.length;
    const resting = g.resting;
    // how far the balloon on the pad has come (the one that just arrived counts as all the way while it waits there)
    const arrived = resting || (s.done && s.results.at(-1) === "delivered");
    const progress = arrived ? 1 : s.done ? 0 : g.cfg.holdMs > 0 ? s.holdMs / g.cfg.holdMs : 0;

    // a balloon reached the pin: the bunny cheers, the pin bounces, a short sparkle
    if (s.completed > w.completed) {
      w.completed = s.completed;
      bunny.current.cheer += 1;
      w.pinT = 0;
      fire.current = { seq: fire.current.seq + 1, x: PIN[0], y: PIN[1] + 0.45, z: PIN[2] };
    }
    bunny.current.reduced = reduced;
    bunny.current.pose = s.done ? "wave" : "stand";

    // the balloon on the pad rises with the progress; the one just delivered waits at the pin during the rest;
    // earlier deliveries are tied up at the destination; skipped ones stay home (fade out)
    let moored = 0;
    for (let i = 0; i < SLOTS; i++) {
      const p = w.pos[i];
      const r = s.results[i];
      let tx = 0;
      let ty = BASE_Y;
      let tz = 0;
      let ts = 0;
      let rate = 2.6;
      let bob = 0;
      if (i < n && r === "delivered") {
        if (resting && i === at - 1) {
          ty = TOP_Y;
          ts = 1;
          bob = 0.03;
        } else {
          const m = MOOR[moored % MOOR.length];
          tx = m[0];
          ty = m[1] + Math.floor(moored / MOOR.length) * 0.35;
          tz = m[2];
          ts = MOOR_SCALE;
          bob = 0.04;
          moored += 1;
        }
      } else if (i < n && r === undefined && i === at && !s.done) {
        ty = altitude(resting ? 0 : progress);
        ts = 1;
        rate = 10;
      }
      if (fresh || reduced) {
        p.set(tx, ty, tz);
        w.scale[i] = ts;
      } else {
        p.x = damp(p.x, tx, rate, dt);
        p.y = damp(p.y, ty, rate, dt);
        p.z = damp(p.z, tz, rate, dt);
        w.scale[i] = damp(w.scale[i], ts, 5, dt);
      }
      const grp = crafts.current[i];
      if (grp) {
        const k = w.scale[i];
        // during the rest the waiting balloon breathes slowly: a calm in-and-out to follow
        const breathe = resting && i === at && !reduced ? 0.94 - 0.06 * Math.cos((w.t * Math.PI * 2) / BREATH_S) : 1;
        const sway = !reduced && i === at && !resting ? Math.sin(w.t * 0.5) * 0.05 : 0;
        grp.visible = k > 0.01;
        grp.scale.setScalar(Math.max(0.001, k * breathe));
        grp.position.set(p.x + sway, p.y + (reduced ? 0 : Math.sin(w.t * 1.3 + i * 2) * bob), p.z);
      }
    }

    // the balloon on the pad casts a soft shadow that shrinks and fades as it rises
    const onPad = !s.done && at < n ? at : -1;
    const sh = shadow.current;
    if (sh) {
      sh.visible = onPad >= 0 && w.scale[onPad] > 0.05;
      if (onPad >= 0) {
        const p = w.pos[onPad];
        const h01 = clamp01((p.y - BASE_Y) / (TOP_Y - BASE_Y));
        const k = (1.25 - 0.7 * h01) * w.scale[onPad];
        sh.position.x = p.x;
        sh.scale.set(k, k * 0.8, 1);
        (sh.material as THREE.MeshBasicMaterial).opacity = 0.95 - 0.65 * h01;
      }
    }

    // flame = the game hears usable voice; blue ring = it meets the expert's oral criterion (both from the logic)
    const flying = !s.done && !resting && at < n ? crafts.current[at] : null;
    const hearing = flying !== null && s.speaking && f.valid;
    w.flame = reduced ? (hearing ? 1 : 0) : damp(w.flame, hearing ? 1 : 0, 12, dt);
    w.zone = damp(w.zone, flying !== null && s.inZone && f.valid ? 1 : 0, 8, dt);
    const fl = flame.current;
    if (fl) {
      fl.visible = flying !== null && w.flame > 0.02;
      if (flying) {
        const flicker = reduced ? 1 : 1 + Math.sin(w.t * 23) * 0.08 + Math.sin(w.t * 37) * 0.05;
        fl.position.set(flying.position.x, flying.position.y + 0.42, flying.position.z);
        fl.scale.set(w.flame, w.flame * flicker, w.flame);
      }
    }
    const zr = zoneRing.current;
    if (zr) {
      zr.visible = flying !== null && w.zone > 0.02;
      if (flying) zr.position.set(flying.position.x, flying.position.y + 0.16, flying.position.z);
      (zr.material as THREE.MeshBasicMaterial).opacity = 0.9 * w.zone;
    }

    // route dots light up to the balloon's height (all of them while it waits at the pin)
    const lit = Math.floor(progress * DOTS + 1e-6);
    const dm = dots.current;
    if (dm && lit !== w.lit) {
      w.lit = lit;
      for (let k = 0; k < DOTS; k++) dm.setColorAt(k, k < lit ? dotColor.lit : dotColor.dim);
      if (dm.instanceColor) dm.instanceColor.needsUpdate = true;
    }

    const pn = pin.current;
    if (pn) {
      let k = 1;
      if (w.pinT >= 0) {
        w.pinT += dt;
        k = 1 + 0.35 * bump(w.pinT / 0.55);
        if (w.pinT >= 0.55) w.pinT = -1;
      }
      pn.scale.setScalar(reduced ? 1 : k);
      pn.position.y = PIN[1] + (reduced ? 0 : Math.sin(w.t * 1.6) * 0.04);
    }

    // keep the HTML name tag under the destination's porch (a fixed spot: nothing moves over it)
    const el = labelRef.current;
    if (el) {
      if (w.labelW === 0 || w.labelFor !== size.width) {
        w.labelW = el.offsetWidth;
        w.labelFor = size.width;
      }
      tmp.set(TAG[0], TAG[1], TAG[2]).project(camera);
      const px = Math.max(8, Math.min(Math.round(((tmp.x + 1) / 2) * size.width), size.width - w.labelW - 8));
      const py = Math.round(((1 - tmp.y) / 2) * size.height);
      const key = `${px},${py}`;
      if (key !== w.label) {
        w.label = key;
        el.style.transform = `translate(${px}px, ${py}px) translateY(-50%)`;
        el.style.visibility = "visible";
      }
    }
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 14, 30]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-4, 9, 7]} box={6} />
        <FitCamera target={[0.25, 2.95, 0]} dir={[0.16, 0.08, 1]} width={5.9} height={7} />

        <mesh geometry={geo.ground} material={kit.clay(id === "lighthouse" ? C.path : C.grass)} rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow />
        {id === "lighthouse" ? (
          <mesh geometry={geo.sea} material={kit.clay(C.water, { roughness: 0.3 })} rotation-x={-Math.PI / 2} position={[6.2, 0.012, -7.6]} receiveShadow />
        ) : null}
        <mesh geometry={geo.pad} material={kit.clay(C.wood)} position={[0, 0.06, 0]} receiveShadow />
        <Field geometry={geo.hill} items={L.hills} receiveShadow={false} />
        {L.trees.length > 0 ? <Field geometry={geo.tree} items={L.trees} castShadow={shadows} /> : null}
        {L.bushes.length > 0 ? <Field geometry={geo.bush} items={L.bushes} /> : null}
        {L.rocks.length > 0 ? <Field geometry={geo.rock} items={L.rocks} castShadow={shadows} /> : null}
        {L.tufts.length > 0 ? <Field geometry={geo.tuft} items={L.tufts} /> : null}
        {L.flowersA.length > 0 ? <Field geometry={geo.flowerA} items={L.flowersA} /> : null}
        {L.flowersB.length > 0 ? <Field geometry={geo.flowerB} items={L.flowersB} /> : null}
        <ScrollField geometry={geo.cloud} items={L.clouds} offset={cloudOffset} span={14} />

        {/* the destination, its pin, and the dotted route up to it */}
        <mesh geometry={geo.landmark} material={kit.clay(C.white, { vertexColors: true })} castShadow={shadows} receiveShadow />
        <mesh ref={pin} geometry={geo.pin} material={kit.clay(C.white, { vertexColors: true })} position={PIN} />
        <instancedMesh ref={dots} args={[kit.sphereLo(), dotMat, DOTS]} />

        {Array.from({ length: SLOTS }, (_, i) => (
          <group key={i} ref={(el) => void (crafts.current[i] = el)} position={[0, BASE_Y, 0]} visible={false}>
            <Balloon reduced={reduced} colors={trip?.balloon} parcel={trip?.gift} />
          </group>
        ))}
        <mesh ref={flame} geometry={geo.flame} material={flameMat} visible={false} />
        <mesh ref={zoneRing} geometry={kit.torus(0.4, 0.028)} material={zoneMat} rotation-x={Math.PI / 2} visible={false} />
        <mesh ref={shadow} geometry={kit.plane()} material={shadowMat} rotation-x={-Math.PI / 2} position={[0, 0.13, 0.05]} renderOrder={2} />

        {/* the bunny sends the balloons off from the ground and cheers when one arrives */}
        <group position={BUNNY_AT} rotation-y={0.45} scale={0.72}>
          <Bunny drive={bunny} />
        </group>
        <BlobShadow at={BUNNY_AT} size={[0.62, 0.52]} />
        <Burst fire={fire} reduced={reduced} max={18} />
      </group>
    </>
  );
}
