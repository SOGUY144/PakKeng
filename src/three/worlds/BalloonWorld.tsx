import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tripById, type TripId } from "../../data/trips";
import { BALLOONS_PER_ROUND } from "../../logic/balloon";
import { bump, clamp01, damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Balloon } from "../models/Balloon";
import { BALLOON_TOP_Y, flameShape, pinShape, placeGeometry } from "../models/balloonPlaces";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, ScrollField, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { BalloonSpec } from "../spec";

type V3 = [number, number, number];

/** Basket height for delivery progress 0..1 (in-zone time so far / the plan's hold time): from the pad up to the pin. */
const BASE_Y = 0.12;
const TOP_Y = BALLOON_TOP_Y;
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
export function BalloonWorld({ gameRef, frameRef, labelRef, reduced, tier, destination, outfit = "", species }: BalloonSpec) {
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
        placeGeometry(id),
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
          <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
        </group>
        <BlobShadow at={BUNNY_AT} size={[0.62, 0.52]} />
        <Burst fire={fire} reduced={reduced} max={18} />
      </group>
    </>
  );
}
