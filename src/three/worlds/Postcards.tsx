import { useMemo, useRef } from "react";
import * as THREE from "three";
import { doorById, DOORS, type DoorId } from "../../data/doors";
import { routeById, type RouteId } from "../../data/routes";
import { floorSpot, TOWER_RISE, type TowerPathId } from "../../data/towerPaths";
import { ROUTE_LEGS } from "../../logic/route";
import { seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { Chest } from "../models/Chest";
import { cloudPillar, cloudPlatform, rainbowArch, rainbowFlag, smilingMoon, starLantern } from "../models/CloudTower";
import { Egg } from "../models/Egg";
import { Pet } from "../models/Pets";
import { eggDrive, petDrive } from "../models/petDrives";
import type { EggKind, PetKind } from "../../data/schema";
import { bunnyDrive } from "../models/drives";
import { Gate, type GateDrive } from "../models/Gate";
import { lookOf } from "../models/gateLook";
import { C } from "../palette";
import { BlobShadow, Field, FitCamera, Lights, type Placement } from "../parts";
import * as S from "../shapes";
import { FerrisWheel, MushroomHouse, StopFlag } from "./RunnerWorld";

/*
 * “โปสการ์ด” — ฉากนิ่งเล็ก ๆ สำหรับทำภาพนิ่งจากโมเดลจริง (render studio) ให้หน้าเลือกทาง/เลือกประตู/หน้าแรก
 * ใช้โมเดลชุดเดียวกับในเกม (ธงจุดแวะ ชิงช้าสวรรค์ บ้านเห็ด ประตูพร้อมตรา หีบ) จึงเห็นของชิ้นเดียวกันก่อนและระหว่างเล่น
 */

type XZ = [number, number];

/** A flat ribbon along a smooth curve through `points` (x, z), lying at height `y` (top faces only, facing up). */
function ribbon(points: XZ[], width: number, y: number, samples = 90): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const len = Math.hypot(t.x, t.z) || 1;
    const ox = (-t.z / len) * (width / 2);
    const oz = (t.x / len) * (width / 2);
    pos.push(p.x + ox, y, p.z + oz, p.x - ox, y, p.z - oz);
    if (i > 0) {
      const a = (i - 1) * 2;
      const b = i * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function curveOf(points: XZ[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
}

/** Floating clay island (grass top, rounded rock under it), stretched to an ellipse. */
function Island({ rx, rz }: { rx: number; rz: number }) {
  const kit = useKit();
  const top = kit.geo("postcard-island-top", () => new THREE.CylinderGeometry(1, 0.97, 0.22, 48));
  return (
    <group>
      <mesh geometry={top} material={kit.clay(C.grass)} position={[0, -0.11, 0]} scale={[rx, 1, rz]} receiveShadow />
      {/* the rock stays below the grass top (y −0.11 at most) */}
      <mesh geometry={kit.sphere()} material={kit.clay(C.stoneDeep)} position={[0, -0.62, 0]} scale={[rx * 0.94, 0.5, rz * 0.94]} />
      <mesh geometry={kit.sphere()} material={kit.clay(C.stone)} position={[0.1, -0.98, 0.05]} scale={[rx * 0.5, 0.42, rz * 0.5]} />
    </group>
  );
}

/** Decor spots inside the island ellipse, kept off the path. */
function scatter(seed: number, n: number, rx: number, rz: number, avoid: THREE.Vector3[], minDist: number, s0: number, s1: number): Placement[] {
  const r = seeded(seed);
  const out: Placement[] = [];
  for (let tries = 0; out.length < n && tries < n * 60; tries++) {
    const a = r() * Math.PI * 2;
    const k = Math.sqrt(r()) * 0.9;
    const x = Math.cos(a) * rx * k;
    const z = Math.sin(a) * rz * k;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < 0.32)) continue;
    out.push({ x, z, s: s0 + (s1 - s0) * r(), ry: r() * Math.PI * 2 });
  }
  return out;
}

const RX = 3.1;
const RZ = 2.15;
/** The path from the near bank (left) to the landmark (back right). */
const PATH: XZ[] = [
  [-2.2, 1.15],
  [-1.25, 1.05],
  [-0.35, 0.45],
  [-1.0, -0.3],
  [0.15, -0.85],
  [1.15, -1.05],
];
const LANDMARK: [number, number, number] = [1.95, 0, -1.45];

/**
 * One route as its own little world: the path winds from the child's character to the route's landmark,
 * one flag per stop (the same flags and landmark the round shows), decor of that route only.
 */
export function RoutePostcard({ routeId, species }: { routeId: RouteId; species: AvatarSpecies }) {
  const kit = useKit();
  const route = routeById(routeId);
  const wheel = useRef<THREE.Group>(null);
  const hero = useRef(bunnyDrive({ pose: "run", speed: 1.1 }));
  const curve = useMemo(() => curveOf(PATH), []);
  const samples = useMemo(() => curve.getSpacedPoints(40), [curve]);
  const edge = kit.geo("postcard-path-edge", () => ribbon(PATH, 0.78, 0.012));
  const path = kit.geo("postcard-path", () => ribbon(PATH, 0.62, 0.022));
  const flags = useMemo(() => {
    const n = ROUTE_LEGS - 1;
    return Array.from({ length: n }, (_, i) => {
      const u = 0.2 + (i / (n - 1)) * 0.66;
      const p = curve.getPointAt(u);
      const t = curve.getTangentAt(u);
      const side = i % 2 === 0 ? 1 : -1;
      const len = Math.hypot(t.x, t.z) || 1;
      return { x: p.x + (-t.z / len) * 0.46 * side, z: p.z + (t.x / len) * 0.46 * side };
    });
  }, [curve]);
  const start = curve.getPointAt(0.04);
  const ahead = curve.getTangentAt(0.06);
  // facing along the path, turned a little toward the camera so the face reads
  const heroYaw = Math.atan2(ahead.x, ahead.z) - 0.55;
  const avoid = [...samples, new THREE.Vector3(LANDMARK[0], 0, LANDMARK[2]), ...flags.map((f) => new THREE.Vector3(f.x, 0, f.z))];
  const flower = routeId === "flower";
  const decor = useMemo(() => {
    const spots = (seed: number, n: number, s0: number, s1: number, d = 0.62) => scatter(seed, n, RX, RZ, avoid, d, s0, s1);
    return flower
      ? {
          a: spots(11, 9, 0.9, 1.25),
          b: spots(12, 7, 0.9, 1.2),
          c: spots(13, 3, 0.55, 0.7, 0.8),
          d: spots(14, 4, 0.5, 0.65, 0.9),
        }
      : {
          a: spots(21, 6, 0.75, 1.05, 0.7),
          b: spots(22, 6, 0.85, 1.15),
          c: spots(23, 3, 0.55, 0.75, 0.8),
          d: spots(24, 4, 0.45, 0.62, 0.95),
        };
    // the layout is fixed for a route (stills are rendered once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flower]);
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-3, 8, 6]} box={5} intensity={2.5} />
      <FitCamera target={[0.05, 0.85, -0.1]} dir={[0, 0.62, 1]} width={7.0} height={4.75} />
      <Island rx={RX} rz={RZ} />
      <mesh geometry={edge} material={kit.clay(C.pathEdge)} receiveShadow />
      <mesh geometry={path} material={kit.clay(C.path)} receiveShadow />
      {flower ? (
        <>
          <Field geometry={kit.geo("flower-pink", () => S.flower(C.pink))} items={decor.a} />
          <Field geometry={kit.geo("flower-white", () => S.flower(C.white))} items={decor.b} />
          <Field geometry={kit.geo("pot", S.flowerPot)} items={decor.c} castShadow />
          <Field geometry={kit.geo("bush", S.bush)} items={decor.d} castShadow />
        </>
      ) : (
        <>
          <Field geometry={kit.geo("mushroom", S.mushroom)} items={decor.a} castShadow />
          <Field geometry={kit.geo("flower-lilac", () => S.flower(C.lilacDeep))} items={decor.b} />
          <Field geometry={kit.geo("log", S.log)} items={decor.c} castShadow />
          <Field geometry={kit.geo("tree", S.tree)} items={decor.d} castShadow />
        </>
      )}
      {flags.map((f, i) => (
        <group key={i} position={[f.x, 0, f.z]} scale={0.55}>
          <StopFlag color={route.flag} />
        </group>
      ))}
      <group position={LANDMARK} rotation-y={-0.35} scale={0.78}>
        {flower ? <FerrisWheel wheel={wheel} color={route.flag} deep={route.flagDeep} /> : <MushroomHouse color={route.flag} deep={route.flagDeep} />}
      </group>
      <group position={[start.x, 0, start.z]} rotation-y={heroYaw} scale={0.72}>
        <Bunny drive={hero} outfit="cap" species={species} />
      </group>
      <BlobShadow at={[start.x, 0.02, start.z]} size={[0.68, 0.55]} />
    </group>
  );
}

const SHUT = (): GateDrive => ({ progress: 0, live: 0, open: false, reduced: true });

/** One door of the picker, standing in a little hedge on its own grass island (closed, bolt across). */
export function DoorPostcard({ doorId }: { doorId: DoorId }) {
  const kit = useKit();
  const door = doorById(doorId);
  const look = useMemo(() => lookOf(door), [door]);
  const drive = useRef<GateDrive>(SHUT());
  // flowers at the foot of the door in its own theme (the same cached geometries as the game scenes)
  const petals: [string, string] = doorId === "flower" ? ["flower-pink", C.pink] : doorId === "star" ? ["flower-lilac", C.lilacDeep] : ["flower-white", C.white];
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-3, 8, 7]} box={4} intensity={2.5} />
      <FitCamera target={[0, 2.12, 0.2]} dir={[0.14, 0.2, 1]} width={4.1} height={5.15} />
      <group scale={[1, 1, 1]}>
        <Island rx={2.05} rz={1.15} />
      </group>
      <Gate drive={drive} look={look} />
      <Field
        geometry={kit.geo("bush", S.bush)}
        items={[
          { x: -1.78, z: -0.1, s: 0.8, ry: 0.4 },
          { x: 1.8, z: -0.05, s: 0.75, ry: 2.1 },
        ]}
        castShadow
      />
      <Field
        geometry={kit.geo(petals[0], () => S.flower(petals[1]))}
        items={[
          { x: -1.45, z: 0.55, s: 1.1 },
          { x: -0.95, z: 0.78, s: 0.95, ry: 1 },
          { x: 1.05, z: 0.72, s: 1.05, ry: 2 },
          { x: 1.5, z: 0.5, s: 0.9, ry: 3 },
        ]}
      />
      <Field geometry={kit.geo("tuft", S.grassTuft)} items={[{ x: -0.55, z: 0.85, s: 1 }, { x: 0.6, z: 0.92, s: 0.9, ry: 1.4 }]} />
    </group>
  );
}

/** Activity card “เปิดประตู”: the three doors side by side, the bunny in front choosing. */
export function GateRowPostcard() {
  const kit = useKit();
  const refs = [useRef(SHUT()), useRef(SHUT()), useRef(SHUT())];
  const looks = useMemo(() => DOORS.map((d) => lookOf(d)), []);
  const hero = useRef(bunnyDrive({ pose: "wave" }));
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-3, 8, 7]} box={7} intensity={2.5} />
      <FitCamera target={[0, 1.9, 0.6]} dir={[0, 0.22, 1]} width={9.7} height={6.4} />
      <mesh geometry={kit.geo("postcard-lawn", () => new THREE.PlaneGeometry(16, 8))} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, 0, 1]} receiveShadow />
      {DOORS.map((d, i) => (
        <group key={d.id} position={[(i - 1) * 3.25, 0, 0]}>
          <Gate drive={refs[i]} look={looks[i]} />
        </group>
      ))}
      <Field geometry={kit.geo("bush", S.bush)} items={[{ x: -5.1, z: 0.1, s: 1 }, { x: 5.1, z: 0.1, s: 0.95, ry: 2 }]} castShadow />
      <group position={[0.85, 0, 2.05]} rotation-y={-0.35} scale={0.95}>
        <Bunny drive={hero} outfit="cap" />
      </group>
      <BlobShadow at={[0.85, 0.02, 2.08]} size={[0.85, 0.7]} />
    </group>
  );
}

/** The day's reward chest on a small cushion of grass (closed while rounds are left, open once they are done). */
export function ChestPostcard({ open }: { open: boolean }) {
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-2.5, 6, 5]} box={2} intensity={2.4} />
      <FitCamera target={[0, open ? 0.72 : 0.42, open ? -0.1 : 0]} dir={[0.42, 0.55, 1]} width={open ? 2.0 : 1.75} height={open ? 2.0 : 1.45} />
      <group rotation-y={-0.12}>
        <Chest open={open} />
      </group>
      <BlobShadow at={[0, 0, 0]} size={[1.65, 1.15]} />
    </group>
  );
}

/** Home's island card: the child's buddy pet (or the egg in its nest, at its crack stage), same models as the island. */
export function PetPostcard({ kind }: { kind: PetKind }) {
  const drive = useRef(petDrive({ reduced: true }));
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-2.5, 6, 5]} box={2} intensity={2.4} />
      <FitCamera target={[0, 0.3, 0]} dir={[0.25, 0.28, 1]} width={0.74} height={0.74} />
      <group rotation-y={0.35}>
        <Pet kind={kind} drive={drive} />
      </group>
      <BlobShadow at={[0, 0, 0]} size={[0.5, 0.42]} />
    </group>
  );
}

export function EggPostcard({ kind, crack }: { kind: EggKind; crack: 0 | 1 | 2 | 3 }) {
  const drive = useRef(eggDrive({ reduced: true }));
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-2.5, 6, 5]} box={2} intensity={2.4} />
      <FitCamera target={[0, 0.36, 0]} dir={[0.2, 0.42, 1]} width={0.95} height={0.95} />
      <Egg kind={kind} crack={crack} drive={drive} />
    </group>
  );
}

/**
 * หอคอยเมฆสำหรับหน้าเลือกทาง / การ์ดเกม / การ์ดจบรอบ: โมเดลและผังเดียวกับฉากจริง (CloudTower + floorSpot)
 * "pick" = ตัวละครของเด็กยืนบนเมฆพื้น มองขึ้นไปทางของตัวเอง ของประดับทุกชั้นสว่าง (ให้เห็นว่าทางนี้มีอะไร) ·
 * "thumb" = กระโดดกลางอากาศขึ้นเมฆชั้นแรก
 */
export function TowerPostcard({ path, species, mode }: { path: TowerPathId; species: AvatarSpecies; mode: "pick" | "thumb" }) {
  const kit = useKit();
  const hero = useRef(bunnyDrive({ pose: mode === "pick" ? "wave" : "stand" }));
  const clay = kit.clay(C.white, { vertexColors: true });
  const glow = kit.clay(C.white, { vertexColors: true, emissive: path === "star" ? C.butter : C.pinkSoft, emissiveIntensity: path === "star" ? 0.45 : 0.18 });
  const geo = {
    platform: kit.geo("tower-cloud-0.78", () => cloudPlatform(0.78, kit.seg)),
    ground: kit.geo("tower-cloud-1.25", () => cloudPlatform(1.25, kit.seg)),
    pillar: kit.geo("tower-pillar", () => cloudPillar(5 * TOWER_RISE - 0.6, kit.seg)),
    keep: kit.geo(`tower-keep-${path}-lit`, () => (path === "star" ? starLantern(true) : rainbowFlag(true))),
    goal: kit.geo(`tower-goal-${path}`, () => (path === "star" ? smilingMoon(kit.seg) : rainbowArch(kit.seg))),
  };
  const spots = [0, 1, 2, 3, 4, 5].map((f) => floorSpot(path, f));
  const first = spots[1];
  // pick: standing on the ground cloud, turned towards this path's first cloud · thumb: on the first cloud, looking up the tower
  const me = mode === "pick" ? { x: 0.1, y: 0, yaw: Math.sign(first.x) * 0.45 } : { x: first.x + Math.sign(first.x) * 0.16, y: first.y, yaw: -Math.sign(first.x) * 0.35 };
  return (
    <group dispose={null}>
      <Lights tier="high" sun={[-3, 9, 7]} box={5} intensity={2.5} />
      {mode === "pick" ? (
        <FitCamera target={[0, 2.15, 0]} dir={[0, 0.12, 1]} width={4.9} height={6.1} fov={30} />
      ) : (
        <FitCamera target={[-0.2, 1.75, 0]} dir={[0, 0.14, 1]} width={4.4} height={3.7} fov={30} />
      )}
      <mesh geometry={geo.pillar} material={clay} position={[0, 0, -1.5]} />
      <mesh geometry={geo.ground} material={clay} />
      {spots.slice(1).map((p, i) => (
        <mesh key={i} geometry={geo.platform} material={clay} position={[p.x, p.y, 0]} />
      ))}
      {spots.slice(1, 5).map((p, i) => (
        <mesh key={i} geometry={geo.keep} material={glow} position={[p.x - Math.sign(p.x) * 0.42, p.y, -0.32]} />
      ))}
      <mesh geometry={geo.goal} material={path === "star" ? glow : clay} position={[0, 5 * TOWER_RISE + 0.02 + (path === "star" ? 0.45 : 0), -0.42]} scale={0.85} />
      <group position={[me.x, me.y, 0.12]} rotation-y={me.yaw} scale={0.72}>
        <Bunny drive={hero} outfit="cap" species={species} />
      </group>
      <BlobShadow at={[me.x, me.y, 0.12]} size={[0.62, 0.5]} />
    </group>
  );
}
