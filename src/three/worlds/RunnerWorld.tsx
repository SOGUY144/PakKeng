import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny } from "../models/Bunny";
import { CloudPal } from "../models/CloudPal";
import { bunnyDrive, cloudDrive } from "../models/drives";
import { C } from "../palette";
import { BlobShadow, Burst, Dust, FitCamera, Lights, ScrollField, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { RunnerSpec } from "../spec";

/** Hero stands still on the middle lane; the garden scrolls past (camera never moves). */
export const BUNNY_X = 1.5;
/** World units per second at decorative speed 1. */
const RUN_UNITS = 2.8;
const SPAN = 30;
const LANE_Z = 1.14;

function along(n: number, span: number, r: () => number, jitter = 0.35): number[] {
  return Array.from({ length: n }, (_, i) => (i + 0.5 + (r() * 2 - 1) * jitter) * (span / n));
}

/** Deterministic garden layout (same every visit). */
function layout() {
  const r = seeded(7);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const strip = (n: number, z0: number, z1: number, s0: number, s1: number, span = SPAN): Placement[] =>
    along(n, span, r).map((x) => ({ x, z: rnd(z0, z1), s: rnd(s0, s1), ry: rnd(0, Math.PI * 2) }));
  return {
    trees: strip(9, -3.1, -5.8, 0.85, 1.3),
    bushes: [...strip(6, -2.3, -3.1, 0.75, 1.05), ...strip(4, 2.3, 3.0, 0.45, 0.62)],
    mushrooms: strip(5, -2.3, -3.6, 0.8, 1.35),
    rocks: strip(4, -2.5, -4.4, 0.7, 1.1),
    flowersPink: [...strip(5, 2.05, 3.3, 0.95, 1.3), ...strip(3, -2.05, -2.6, 0.9, 1.2)],
    flowersLilac: [...strip(5, 2.05, 3.3, 0.95, 1.3), ...strip(3, -2.05, -2.6, 0.9, 1.2)],
    flowersWhite: [...strip(4, 2.05, 3.3, 0.95, 1.3), ...strip(3, -2.05, -2.6, 0.9, 1.2)],
    tufts: [...strip(10, 1.95, 3.4, 0.8, 1.3), ...strip(8, -1.95, -2.9, 0.8, 1.3)],
    pebbles: [...strip(9, 1.5, 1.62, 0.7, 1.2), ...strip(9, -1.5, -1.62, 0.7, 1.2)],
    dashes: [0.57, -0.57].flatMap((z) => Array.from({ length: 23 }, (_, i) => ({ x: (i * SPAN) / 23, z }))),
    logs: along(2, SPAN, r, 0.2).map((x, i) => ({ x: x + 2, z: i % 2 ? LANE_Z : -LANE_Z })),
    pots: along(2, SPAN, r, 0.2).map((x, i) => ({ x: x + 9, z: i % 2 ? -LANE_Z : LANE_Z })),
    hills: strip(6, -9, -12.5, 2.2, 3.4, 48).map((p) => ({ ...p, y: -0.3, ry: 0 })),
    islands: strip(3, -15, -17, 0.8, 1.05, 48).map((p, i) => ({ ...p, y: 2.05 + (i % 2) * 0.35 })),
    clouds: strip(6, -19, -23, 1.1, 1.7, 56).map((p, i) => ({ ...p, y: 2.9 + (i % 3) * 0.3, ry: 0 })),
  };
}

/**
 * ฉากวิ่งหนี 3D: สวนลอยฟ้าเส้นทาง 3 เลน มองเฉียงจากด้านข้าง (เห็นระยะห่างระหว่างกระต่ายกับเพื่อนเมฆเป็นแนวนอน)
 * - ความเร็วของฉาก/จังหวะวิ่งมาจาก state.speed (ตกแต่งเท่านั้น) และเป็น 0 เมื่อข้อมูลใช้ไม่ได้
 * - ระยะห่างตัวไล่มาจาก state.gap (ตรรกะเกม) แสดงด้วยแถบสีน้ำเงินบนพื้น (ค่าด้านปาก)
 * - สิ่งกีดขวางอยู่เลนข้างเท่านั้น ไม่มีการชน ไม่ต้องหลบ
 */
export function RunnerWorld({ gameRef, frameRef, outfit, reduced, tier }: RunnerSpec) {
  const kit = useKit();
  const L = useMemo(() => layout(), []);
  const geo = useMemo(
    () => ({
      tree: kit.geo("tree", S.tree),
      bush: kit.geo("bush", S.bush),
      mushroom: kit.geo("mushroom", S.mushroom),
      rock: kit.geo("rock", S.rock),
      flowerPink: kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerLilac: kit.geo("flower-lilac", () => S.flower(C.lilacDeep)),
      flowerWhite: kit.geo("flower-white", () => S.flower(C.white)),
      tuft: kit.geo("tuft", S.grassTuft),
      pebble: kit.geo("pebble", S.pebble),
      dash: kit.geo("dash", S.laneDash),
      log: kit.geo("log", S.log),
      pot: kit.geo("pot", S.flowerPot),
      hill: kit.geo("hill", S.hill),
      island: kit.geo("island", S.island),
      cloud: kit.geo("cloud", S.cloud),
      ground: kit.geo("ground-80x40", () => new THREE.PlaneGeometry(80, 40)),
      path: kit.geo("path-80", () => new THREE.BoxGeometry(80, 0.3, 3.3)),
      edge: kit.geo("path-edge-80", () => new THREE.BoxGeometry(80, 0.32, 0.16)),
    }),
    [kit],
  );
  const shadows = tier !== "low";
  // low tier: half the small decor (same layout, fewer draws/triangles)
  const thin = (items: Placement[]) => (tier === "low" ? items.filter((_, i) => i % 2 === 0) : items);

  const offset = useRef(0);
  const far = useRef(0);
  const drift = useRef(0);
  const passing = useRef(false);
  const bunny = useRef(bunnyDrive({ reduced }));
  const cloud = useRef(cloudDrive({ reduced }));
  const chaser = useRef<THREE.Group>(null);
  const chaserShadow = useRef<THREE.Mesh>(null);
  const ribbon = useRef<THREE.Mesh>(null);
  const fire = useRef<BurstFire>({ seq: 0, x: BUNNY_X, y: 1.75, z: 0 });
  const seen = useRef<{ game: unknown; attempts: number; x: number | null }>({ game: null, attempts: 0, x: null });

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    if (seen.current.game !== g) seen.current = { game: g, attempts: s.attempts.length, x: null }; // restart

    const speed = f.valid && !s.done ? s.speed : 0;
    if (!reduced) {
      offset.current += speed * RUN_UNITS * dt;
      far.current += dt * 0.12 + speed * dt * 0.1;
    }
    drift.current = speed * RUN_UNITS;

    const b = bunny.current;
    b.reduced = reduced;
    b.speed = speed;
    b.boost = s.passing;
    b.pose = s.done ? "wave" : speed > 0.12 ? "run" : "stand";
    passing.current = s.passing && f.valid && !s.done;

    if (s.attempts.length > seen.current.attempts) {
      if (s.attempts[s.attempts.length - 1]?.passed) {
        b.cheer += 1;
        cloud.current.wave += 1;
        fire.current = { seq: fire.current.seq + 1, x: BUNNY_X, y: 1.75, z: 0 };
      }
      seen.current.attempts = s.attempts.length;
    }
    if (s.done && cloud.current.wave === 0) cloud.current.wave = 1;

    const target = BUNNY_X - (1.2 + s.gap * 2.7);
    const x = seen.current.x === null ? target : damp(seen.current.x, target, 3.5, dt);
    seen.current.x = x;
    cloud.current.excite = 1 - s.gap;
    cloud.current.reduced = reduced;
    chaser.current?.position.setX(x);
    chaserShadow.current?.position.setX(x);
    if (ribbon.current) {
      const x0 = x + 0.55;
      const x1 = BUNNY_X - 0.42;
      ribbon.current.position.x = (x0 + x1) / 2;
      ribbon.current.scale.x = Math.max(0.05, x1 - x0);
    }
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 16, 38]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-3, 9, 7]} box={8} />
        <FitCamera target={[-0.45, 0.95, 0]} dir={[0, 0.3, 1]} width={6.5} height={3.4} />

        <mesh geometry={geo.ground} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, -0.02, -6]} receiveShadow />
        <mesh geometry={geo.path} material={kit.clay(C.path)} position={[0, -0.15, 0]} receiveShadow />
        <mesh geometry={geo.edge} material={kit.clay(C.pathEdge)} position={[0, -0.14, 1.72]} receiveShadow />
        <mesh geometry={geo.edge} material={kit.clay(C.pathEdge)} position={[0, -0.14, -1.72]} receiveShadow />

        <ScrollField geometry={geo.dash} items={L.dashes} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.pebble} items={L.pebbles} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.log} items={L.logs} offset={offset} span={SPAN} castShadow={shadows} />
        <ScrollField geometry={geo.pot} items={L.pots} offset={offset} span={SPAN} castShadow={shadows} />
        {/* only the tall props cast real shadows; small decor relies on the soft ambient light */}
        <ScrollField geometry={geo.tree} items={L.trees} offset={offset} span={SPAN} castShadow={shadows} />
        <ScrollField geometry={geo.bush} items={thin(L.bushes)} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.mushroom} items={L.mushrooms} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.rock} items={L.rocks} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.flowerPink} items={thin(L.flowersPink)} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.flowerLilac} items={thin(L.flowersLilac)} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.flowerWhite} items={thin(L.flowersWhite)} offset={offset} span={SPAN} />
        <ScrollField geometry={geo.tuft} items={thin(L.tufts)} offset={offset} span={SPAN} />

        <ScrollField geometry={geo.hill} items={L.hills} offset={offset} span={48} factor={0.18} />
        <ScrollField geometry={geo.island} items={L.islands} offset={far} span={48} />
        <ScrollField geometry={geo.cloud} items={L.clouds} offset={far} span={52} factor={1.5} />

        <mesh ref={ribbon} geometry={kit.plane()} material={kit.basic(C.oralLight, 0.8)} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]} scale={[1, 0.36, 1]} />
        <group position={[BUNNY_X, 0, 0]} rotation-y={Math.PI / 2 - 0.6}>
          <Bunny drive={bunny} outfit={outfit} />
        </group>
        <BlobShadow at={[BUNNY_X, 0, 0.04]} size={[0.95, 0.75]} />
        <group ref={chaser} position={[BUNNY_X - 3, 0.95, 0]} rotation-y={Math.PI / 2 - 0.5}>
          <CloudPal drive={cloud} />
        </group>
        <BlobShadow ref={chaserShadow} at={[BUNNY_X - 3, 0, 0]} size={[1.15, 0.8]} materialKey="soft" opacity={0.55} />
        <Dust on={passing} drift={drift} at={[BUNNY_X - 0.1, 0.02, 0]} reduced={reduced} />
        <Burst fire={fire} reduced={reduced} />
      </group>
    </>
  );
}
