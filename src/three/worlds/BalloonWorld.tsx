import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Balloon } from "../models/Balloon";
import { bunnyDrive } from "../models/drives";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, ScrollField, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { BalloonSpec } from "../spec";
import { BALLOON_REST } from "../../logic/balloon";

/** Basket height for a balloon height 0..1 (the logic's value = oral %, resting at BALLOON_REST). */
const BASE_Y = 0.12;
const RISE = 3.95;
const basketY = (h: number) => BASE_Y + ((Math.max(BALLOON_REST, h) - BALLOON_REST) / (1 - BALLOON_REST)) * RISE;
const TOP_Y = basketY(1);
const BAND_TOP = TOP_Y + 2.6;
const POLE_X = -1.95;

function layout() {
  const r = seeded(23);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const ground = (n: number, s0: number, s1: number): Placement[] =>
    Array.from({ length: n }, () => {
      const side = r() < 0.5 ? -1 : 1;
      return { x: side * rnd(1.1, 4.5), z: rnd(-2.2, 1.6), s: rnd(s0, s1), ry: rnd(0, 6) };
    });
  return {
    trees: [
      { x: -3.3, z: -1.6, s: 1.25, ry: 1 },
      { x: 3.1, z: -2.0, s: 1.45, ry: 2 },
      { x: 4.3, z: -0.6, s: 1.0, ry: 3 },
      { x: -4.4, z: -0.2, s: 1.1, ry: 4 },
    ] as Placement[],
    bushes: ground(6, 0.7, 1.1),
    flowersPink: ground(9, 0.9, 1.3),
    flowersWhite: ground(9, 0.9, 1.3),
    flowersLilac: ground(7, 0.9, 1.3),
    hills: [
      { x: -4.5, y: -0.35, z: -7, s: 3.2 },
      { x: 1.5, y: -0.4, z: -8.5, s: 3.8 },
      { x: 6, y: -0.35, z: -7.5, s: 3 },
    ] as Placement[],
    // clouds at fixed heights: they are the height references, so they only drift sideways
    clouds: [
      { x: -2.8, y: 1.35, z: -2.6, s: 0.75 },
      { x: 2.7, y: 2.3, z: -3.2, s: 0.95 },
      { x: -2.6, y: 3.3, z: -3.6, s: 0.9 },
      { x: 2.9, y: 4.4, z: -4, s: 1.05 },
      { x: -1.2, y: 5.3, z: -6, s: 1.2 },
      { x: 5.5, y: 3.4, z: -5, s: 1.1 },
    ].map((c) => ({ ...c, x: c.x + 7, ry: 0 })),
    islands: [{ x: 2.3, y: 5.15, z: -6.5, s: 0.85, ry: 0.6 }] as Placement[],
    sparkle: rnd(0, 1),
  };
}

/**
 * บอลลูน 3D: ทุ่งหญ้า + ท้องฟ้าที่มีความลึก กล้องอยู่กับที่ (ไม่เลื่อนตามบอลลูน)
 * จุดอ้างอิงความสูง: เสาธงขีดระดับด้านซ้าย, เมฆที่ความสูงคงที่, เงาบนพื้นที่เล็กและจางลงเมื่อบอลลูนสูงขึ้น
 * โซนเป้าหมาย = แถบวงกลมสีน้ำเงินโปร่ง (ค่าด้านปาก) เริ่มที่ความสูงของเกณฑ์ครู
 */
export function BalloonWorld({ gameRef, frameRef, threshold, labelRef, reduced, tier }: BalloonSpec) {
  const kit = useKit();
  const L = useMemo(() => layout(), []);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const geo = useMemo(
    () => ({
      tree: kit.geo("tree", S.tree),
      bush: kit.geo("bush", S.bush),
      flowerPink: kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerWhite: kit.geo("flower-white", () => S.flower(C.white)),
      flowerLilac: kit.geo("flower-lilac", () => S.flower(C.lilacDeep)),
      hill: kit.geo("hill", S.hill),
      cloud: kit.geo("cloud", S.cloud),
      island: kit.geo("island", S.island),
      ground: kit.geo("ground-40x30", () => new THREE.PlaneGeometry(40, 30)),
      pad: kit.geo("balloon-pad", () => new THREE.CylinderGeometry(0.62, 0.68, 0.12, 28)),
      band: kit.geo("balloon-band", () => new THREE.CylinderGeometry(1, 1, 1, 40, 1, true)),
      pole: kit.geo("balloon-pole", () => new THREE.CylinderGeometry(0.045, 0.055, 1, 10)),
      flag: kit.geo("balloon-flag", () => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.lineTo(0.34, -0.09);
        s.lineTo(0, -0.18);
        s.closePath();
        return new THREE.ShapeGeometry(s);
      }),
    }),
    [kit],
  );
  const shadows = tier !== "low";
  const thrY = basketY(threshold / 100);

  const bunny = useRef(bunnyDrive({ pose: "ride", reduced }));
  const craft = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const shadowMat = useMemo(() => kit.blobMaterial("balloon"), [kit]);
  const bandMat = useMemo(
    () => kit.own(new THREE.MeshBasicMaterial({ color: C.oral, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })),
    [kit],
  );
  const ringMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.oral })), [kit]);
  const cloudOffset = useRef(0);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 2, z: 0 });
  const seen = useRef<{ game: unknown; completed: number; y: number | null; zone: number; label: string }>({
    game: null,
    completed: 0,
    y: null,
    zone: 0,
    label: "",
  });
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    if (seen.current.game !== g) seen.current = { ...seen.current, game: g, completed: s.completed, y: null };
    if (!reduced) cloudOffset.current += dt * 0.12;

    // height comes from the logic (already smoothed there); this only adds a short visual ease
    const target = basketY(s.height);
    const y = seen.current.y === null ? target : damp(seen.current.y, target, 14, dt);
    seen.current.y = y;
    if (craft.current) {
      craft.current.position.y = y;
      craft.current.position.x = reduced ? 0 : Math.sin(performance.now() / 2000) * 0.05;
    }
    const h01 = (y - BASE_Y) / RISE;
    if (shadow.current) {
      const k = 1.25 - 0.7 * h01;
      shadow.current.scale.set(k, k * 0.8, 1);
      shadowMat.opacity = 0.95 - 0.65 * h01;
    }
    // the target zone glows while the basket is in it (inZone comes from the logic: voiced + valid + ≥ threshold)
    seen.current.zone = damp(seen.current.zone, s.inZone && f.valid ? 1 : 0, 8, dt);
    bandMat.opacity = 0.12 + 0.12 * seen.current.zone;
    ringMat.color.set(seen.current.zone > 0.5 ? C.oral : "#5b86ee");

    bunny.current.reduced = reduced;
    bunny.current.pose = s.done ? "wave" : "ride";
    if (s.completed > seen.current.completed) {
      seen.current.completed = s.completed;
      bunny.current.cheer += 1;
      fire.current = { seq: fire.current.seq + 1, x: 0, y: y + 1.4, z: 0.3 };
    }

    // keep the HTML zone label next to the threshold ring
    const el = labelRef.current;
    if (el) {
      tmp.set(1.08, thrY, 0).project(camera);
      const px = Math.min(Math.round(((tmp.x + 1) / 2) * size.width) + 6, size.width - el.offsetWidth - 8);
      const py = Math.round(((1 - tmp.y) / 2) * size.height);
      const key = `${px},${py}`;
      if (key !== seen.current.label) {
        seen.current.label = key;
        el.style.transform = `translate(${px}px, ${py}px) translateY(-50%)`;
        el.style.visibility = "visible";
      }
    }
  }, -1);

  const marks = [0.25, 0.5, 0.75, 1];
  return (
    <>
      <fog attach="fog" args={[C.fog, 14, 30]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-4, 9, 7]} box={6} />
        <FitCamera target={[0.15, 2.85, 0]} dir={[0.16, 0.08, 1]} width={5.6} height={6.7} />

        <mesh geometry={geo.ground} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow />
        <mesh geometry={geo.pad} material={kit.clay(C.wood)} position={[0, 0.06, 0]} receiveShadow />
        <Field geometry={geo.hill} items={L.hills} receiveShadow={false} />
        <Field geometry={geo.tree} items={L.trees} castShadow={shadows} />
        <Field geometry={geo.bush} items={L.bushes} />
        <Field geometry={geo.flowerPink} items={L.flowersPink} />
        <Field geometry={geo.flowerWhite} items={L.flowersWhite} />
        <Field geometry={geo.flowerLilac} items={L.flowersLilac} />
        <Field geometry={geo.island} items={L.islands} receiveShadow={false} />
        <ScrollField geometry={geo.cloud} items={L.clouds} offset={cloudOffset} span={14} />

        {/* height pole with a flag every 25 %; the threshold mark is the blue ring */}
        <mesh geometry={geo.pole} material={kit.clay(C.cream)} position={[POLE_X, TOP_Y / 2 + 0.1, -0.4]} scale={[1, TOP_Y + 0.2, 1]} castShadow={shadows} />
        <mesh geometry={kit.sphereLo()} material={kit.clay(C.gold)} position={[POLE_X, TOP_Y + 0.25, -0.4]} scale={0.08} />
        {marks.map((m) => (
          <mesh key={m} geometry={geo.flag} material={kit.clay(m === 1 ? C.pink : C.lilacDeep, { doubleSide: true })} position={[POLE_X + 0.04, basketY(m) + 0.09, -0.4]} />
        ))}

        {/* the zone column starts at the teacher's threshold (blue ring) and continues up out of view */}
        <mesh geometry={geo.band} material={bandMat} position={[0, (thrY + BAND_TOP) / 2, 0]} scale={[1.02, BAND_TOP - thrY, 1.02]} />
        <mesh geometry={kit.torus(1.02, 0.035)} material={ringMat} position={[0, thrY, 0]} rotation-x={Math.PI / 2} />

        <group ref={craft} position={[0, BASE_Y, 0]}>
          <Balloon bunny={bunny} outfit="" reduced={reduced} />
        </group>
        <mesh ref={shadow} geometry={kit.plane()} material={shadowMat} rotation-x={-Math.PI / 2} position={[0, 0.13, 0.05]} renderOrder={2} />
        <BlobShadow at={[POLE_X, 0, -0.4]} size={[0.3, 0.3]} />
        <Burst fire={fire} reduced={reduced} max={18} />
      </group>
    </>
  );
}
