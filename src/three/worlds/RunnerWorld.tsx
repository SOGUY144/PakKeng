import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { routeById } from "../../data/routes";
import { GAP_START, ROUTE_LEGS } from "../../logic/route";
import { damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { CloudPal } from "../models/CloudPal";
import { bunnyDrive, cloudDrive } from "../models/drives";
import { C } from "../palette";
import { BlobShadow, Burst, Dust, FitCamera, Lights, ScrollField, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { RunnerSpec } from "../spec";

/** Hero stands on the middle lane; the garden scrolls past one leg at a time (camera never moves). */
export const BUNNY_X = -1.3;
/** How far behind the bunny the cloud friend floats for a chase gap (0 = right behind … 1 = left far back, off screen). */
const chaseBehind = (gap: number) => 0.95 + 1.6 * gap;
/** World units between two stops of the route. */
const LEG_UNITS = 3.1;
const SPAN = 30;
const LANE_Z = 1.14;
/** Stop flags stand on the far edge of the path, a little ahead of where the bunny stops. */
const FLAG_Z = -1.05;
const FLAG_AHEAD = 0.55;

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
 * ฉากเกมวิ่ง 3D (เลือกทางวิ่ง): สวนลอยฟ้า มองเฉียงจากด้านข้าง กระต่ายวิ่งไปทีละช่วงตามเส้นทางที่เด็กเลือก
 * - ตำแหน่งมาจาก RouteRun.pos (จำนวนจุดแวะที่ถึงแล้ว) เท่านั้น: ได้ยินเสียงที่ใช้ได้หรือกดข้าม → วิ่งไปธงถัดไป
 * - ธงจุดแวะเป็นสีของเส้นทาง ปลายทางเป็นสิ่งปลูกสร้างของเส้นทางนั้น (ชิงช้าสวรรค์ / บ้านเห็ด)
 * - เพื่อนเมฆวิ่งตามเป็นเพื่อนร่วมทาง ไม่ไล่ ไม่มีการชน ไม่มีสถานะแพ้
 * - วงแหวนใต้เท้ากระต่ายบอกว่าเกมกำลังฟัง (ทอง = มีเสียงเข้ามา) และหายไประหว่างวิ่ง
 */
export function RunnerWorld({ gameRef, frameRef, outfit, species, reduced, tier, route }: RunnerSpec) {
  const kit = useKit();
  const L = useMemo(() => layout(), []);
  const r = routeById(route);
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
      pole: kit.cylinder(0.035, 0.045, 1.5, 8),
      banner: kit.geo("flag-banner", () => {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.lineTo(0.62, -0.17);
        sh.lineTo(0, -0.36);
        sh.closePath();
        return new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
      }),
      knob: kit.ball(0.07),
      base: kit.cylinder(0.2, 0.24, 0.1, 14),
    }),
    [kit],
  );
  const shadows = tier !== "low";
  // low tier: half the small decor (same layout, fewer draws/triangles)
  const thin = (items: Placement[]) => (tier === "low" ? items.filter((_, i) => i % 2 === 0) : items);

  const legs = ROUTE_LEGS;
  const offset = useRef(0);
  const far = useRef(0);
  const drift = useRef(0);
  const moving = useRef(false);
  const bunny = useRef(bunnyDrive({ reduced }));
  const cloud = useRef(cloudDrive({ reduced }));
  const pal = useRef<THREE.Group>(null);
  const chaser = useRef<THREE.Group>(null);
  const chase = useRef(chaseBehind(GAP_START));
  const flags = useRef<(THREE.Group | null)[]>([]);
  const goal = useRef<THREE.Group>(null);
  const wheel = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.creamShade })), [kit]);
  const ringIdle = useMemo(() => new THREE.Color(C.creamShade), []);
  const ringLive = useMemo(() => new THREE.Color(C.gold), []);
  const fire = useRef<BurstFire>({ seq: 0, x: BUNNY_X, y: 1.75, z: 0 });
  const seen = useRef<{ game: unknown; reached: number; off: number | null }>({ game: null, reached: 0, off: null });

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const f = frameRef.current;
    const call = g.call.state;
    if (seen.current.game !== g) seen.current = { game: g, reached: g.reached, off: null }; // new round / restart

    // where the bunny is on the route: the eased run from the logic (reduced motion too: no cut to the next stop,
    // only the parallax, dust and flag sway stay off)
    const want = g.pos * LEG_UNITS;
    const prev = seen.current.off ?? want;
    seen.current.off = want;
    offset.current = want;
    const v = dt > 0 ? (want - prev) / dt : 0;
    if (!reduced) far.current += dt * 0.12 + v * dt * 0.03;
    drift.current = v;

    const b = bunny.current;
    b.reduced = reduced;
    b.speed = Math.min(1.6, v / 2.6);
    b.boost = false;
    // the bunny runs while the child speaks (dash) and on the finishing run after the word
    const runningNow = g.running || g.dashing;
    b.pose = g.done ? "wave" : runningNow ? "run" : "stand";
    moving.current = runningNow && !reduced;

    if (g.reached > seen.current.reached) {
      // arrived at a stop: a small cheer, the cloud friend waves
      b.cheer += 1;
      cloud.current.wave += 1;
      fire.current = { seq: fire.current.seq + 1, x: BUNNY_X, y: 1.75, z: 0 };
      seen.current.reached = g.reached;
    }
    // the cloud friend chases: closer while the child is quiet, left behind while the bunny runs (it never catches up)
    chase.current = damp(chase.current, chaseBehind(g.gap), reduced ? 2.5 : 4, dt);
    chaser.current?.position.setX(BUNNY_X - chase.current);
    cloud.current.excite = runningNow ? 0.9 : g.gap < 0.3 ? 0.65 : 0.3;
    cloud.current.reduced = reduced;
    pal.current?.position.setY(0.85 + (reduced ? 0 : Math.sin(far.current * 9) * 0.04));

    // stop flags (1 … legs−1) and the destination, placed by the distance still to run
    const pos = want / LEG_UNITS;
    for (let k = 1; k < legs; k++) {
      const fl = flags.current[k];
      if (!fl) continue;
      const x = BUNNY_X + FLAG_AHEAD + (k - pos) * LEG_UNITS;
      fl.visible = x > -7 && x < 9;
      fl.position.x = x;
      fl.rotation.z = reduced ? 0 : Math.sin(far.current * 11 + k) * 0.03;
    }
    if (goal.current) {
      const x = BUNNY_X + 1.55 + (legs - pos) * LEG_UNITS;
      goal.current.visible = x < 11;
      goal.current.position.x = x;
    }
    if (wheel.current && !reduced) wheel.current.rotation.z = far.current * 1.6;

    // listening ring: shown on the child's turn, gold while a voice is coming in
    if (ring.current) {
      ring.current.visible = !g.running && !g.done && call.phase !== "playing" && call.phase !== "settle";
      ringMat.color.copy(call.inAttempt && f.valid ? ringLive : ringIdle);
    }
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 16, 38]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-3, 9, 7]} box={8} />
        <FitCamera target={[0.3, 0.95, -0.3]} dir={[0, 0.3, 1]} width={6.2} height={3.3} />

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

        {Array.from({ length: legs }, (_, k) =>
          k === 0 ? null : (
            <group key={k} ref={(el) => void (flags.current[k] = el)} position={[BUNNY_X + FLAG_AHEAD + k * LEG_UNITS, 0, FLAG_Z]} visible={false}>
              <mesh geometry={geo.base} material={kit.clay(C.creamShade)} position={[0, 0.05, 0]} receiveShadow />
              <mesh geometry={geo.pole} material={kit.clay(C.wood)} position={[0, 0.75, 0]} castShadow={shadows} />
              <mesh geometry={geo.knob} material={kit.clay(C.butter)} position={[0, 1.52, 0]} scale={0.07} />
              <mesh geometry={geo.banner} material={kit.clay(r.flag)} position={[0.03, 1.45, -0.025]} castShadow={shadows} />
            </group>
          ),
        )}
        <group ref={goal} position={[BUNNY_X + 1.55 + legs * LEG_UNITS, 0, -1.75]} visible={false}>
          {route === "mushroom" ? <MushroomHouse color={r.flag} deep={r.flagDeep} /> : <FerrisWheel wheel={wheel} color={r.flag} deep={r.flagDeep} />}
        </group>

        <mesh ref={ring} geometry={kit.torus(0.62, 0.035)} material={ringMat} rotation-x={-Math.PI / 2} position={[BUNNY_X, 0.02, 0]} />
        <group position={[BUNNY_X, 0, 0]} rotation-y={Math.PI / 2 - 0.6}>
          <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
        </group>
        <BlobShadow at={[BUNNY_X, 0, 0.04]} size={[0.95, 0.75]} />
        <group ref={chaser} position={[BUNNY_X - chaseBehind(GAP_START), 0, 0]}>
          <group ref={pal} position={[0, 0.95, 0.5]} rotation-y={Math.PI / 2 - 0.5} scale={0.7}>
            <CloudPal drive={cloud} />
          </group>
          <BlobShadow at={[0, 0, 0.5]} size={[0.85, 0.6]} materialKey="soft" opacity={0.5} />
        </group>
        <Dust on={moving} drift={drift} at={[BUNNY_X - 0.1, 0.02, 0]} reduced={reduced} />
        <Burst fire={fire} reduced={reduced} />
      </group>
    </>
  );
}

/** Destination of the flower route: a small clay ferris wheel in the route colour (turns slowly). */
function FerrisWheel({ wheel, color, deep }: { wheel: RefObject<THREE.Group | null>; color: string; deep: string }) {
  const kit = useKit();
  const cabins = 8;
  return (
    <group scale={1.05}>
      <mesh geometry={kit.cylinder(0.06, 0.09, 2.2, 8)} material={kit.clay(C.white)} position={[-0.55, 1.05, 0.25]} rotation-z={-0.26} castShadow />
      <mesh geometry={kit.cylinder(0.06, 0.09, 2.2, 8)} material={kit.clay(C.white)} position={[0.55, 1.05, 0.25]} rotation-z={0.26} castShadow />
      <mesh geometry={kit.cylinder(0.5, 0.6, 0.18, 18)} material={kit.clay(C.creamShade)} position={[0, 0.09, 0.25]} receiveShadow />
      <group ref={wheel} position={[0, 2.05, 0.25]}>
        <mesh geometry={kit.torus(1.15, 0.07)} material={kit.clay(color)} castShadow />
        <mesh geometry={kit.torus(0.42, 0.05)} material={kit.clay(deep)} />
        {Array.from({ length: cabins }, (_, i) => {
          const a = (i / cabins) * Math.PI * 2;
          return (
            <group key={i}>
              <mesh geometry={kit.cylinder(0.025, 0.025, 1.15, 6)} material={kit.clay(C.white)} position={[Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0]} rotation-z={a + Math.PI / 2} />
              <mesh geometry={kit.ball(0.17)} material={kit.clay(i % 2 ? C.butter : C.mint)} position={[Math.cos(a) * 1.15, Math.sin(a) * 1.15 - 0.12, 0.12]} scale={0.17} castShadow />
            </group>
          );
        })}
      </group>
      <mesh geometry={kit.ball(0.12)} material={kit.clay(C.butter)} position={[0, 2.05, 0.36]} scale={0.12} />
    </group>
  );
}

/** Destination of the mushroom route: a big clay mushroom house with a door and a round window. */
function MushroomHouse({ color, deep }: { color: string; deep: string }) {
  const kit = useKit();
  return (
    <group scale={1.1}>
      <mesh geometry={kit.cylinder(0.62, 0.74, 1.3, 20)} material={kit.clay(C.cream)} position={[0, 0.65, 0]} castShadow receiveShadow />
      <mesh geometry={kit.dome()} material={kit.clay(color)} position={[0, 1.22, 0]} scale={[1.35, 0.95, 1.35]} castShadow />
      {[
        [0.55, 1.75, 0.75],
        [-0.6, 1.6, 0.7],
        [0.05, 2.02, 0.62],
        [-0.15, 1.5, 1.05],
        [0.75, 1.42, 0.38],
      ].map(([x, y, z], i) => (
        <mesh key={i} geometry={kit.ball(0.11)} material={kit.clay(C.white)} position={[x, y, z]} scale={0.11} />
      ))}
      <mesh geometry={kit.capsule(0.2, 0.32)} material={kit.clay(C.woodDeep)} position={[0, 0.42, 0.66]} scale={[1, 1, 0.35]} />
      <mesh geometry={kit.ball(0.15)} material={kit.clay(deep)} position={[0.42, 0.85, 0.55]} scale={[0.15, 0.15, 0.06]} />
      <mesh geometry={kit.ball(0.1)} material={kit.clay(C.butter)} position={[0.42, 0.85, 0.6]} scale={[0.1, 0.1, 0.04]} />
    </group>
  );
}
