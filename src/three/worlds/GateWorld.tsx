import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BEACH_SEA, doorById, type Door, type DoorPlace } from "../../data/doors";
import { CALM, clamp01, damp, easeInOutSine, easeOutCubic, frameDt, lerp, seeded } from "../anim";
import type { Kit } from "../kit";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { CloudPal } from "../models/CloudPal";
import { bunnyDrive, cloudDrive } from "../models/drives";
import { EmblemField, Gate, type GateDrive, type GateLook } from "../models/Gate";
import { C } from "../palette";
import { BlobShadow, Burst, Field, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { GateSpec } from "../spec";

type V3 = [number, number, number];

/** The doorway plane (world z). What waits behind the door is built in the gate's own frame (z < 0 = the other side). */
const GATE_Z = -0.2;
const BUNNY: V3 = [-0.8, 0, 1.45];
/** The cloud friend floats to the right, clear of the line of sight into the doorway. */
const CLOUD: V3 = [2.05, 0.95, 1.55];
const EMBLEM: V3 = [0, 2.92, GATE_Z + 0.12];
const MOTES = 18;
/** Turned toward the child while playing; after opening both friends look through the doorway. */
const BUNNY_FACE = 0.5;
const BUNNY_LOOK = Math.atan2(-BUNNY[0], GATE_Z - BUNNY[2]);
const CLOUD_FACE = -0.45;
const CLOUD_LOOK = Math.atan2(-CLOUD[0], GATE_Z - CLOUD[2]);

interface View {
  target: V3;
  dir: V3;
  width: number;
  height: number;
}
const FOV = 34;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
/** The whole gate with the bunny and its friend in front. */
const VIEW_GATE: View = { target: [0, 1.85, 0.4], dir: [0.32, 0.34, 1], width: 6.2, height: 5.4 };
/** After the door opens: the doorway and what is behind it fill the view. */
const VIEW_DOOR: View = { target: [0, 1.15, GATE_Z - 0.35], dir: [0.16, 0.22, 1], width: 3.3, height: 3.0 };
/** The camera starts moving once the leaves are swinging. */
const PUSH_DELAY_S = 0.55;
const PUSH_S = 1.6;

/**
 * The other side's sky: a sheet tilted from the ground at the back up to just behind the arch, so it is never
 * seen over the hedge or the pillar caps — only through the open doorway.
 */
const BACK = { x0: -1.95, x1: 1.55, zLow: -1.7, zTop: -0.35, top: 2.45 };
const BACK_W = BACK.x1 - BACK.x0;
const BACK_X = (BACK.x0 + BACK.x1) / 2;
const BACK_LEN = Math.hypot(BACK.top, BACK.zTop - BACK.zLow);
const BACK_TILT = Math.atan2(BACK.zTop - BACK.zLow, BACK.top);
/** The other side's ground starts just behind the doorway. */
const FLOOR_FRONT = -0.25;
const SHORE_Z = -1.08;
/** Positions on the tilted sky (x across, y up its slope). */
const MOON: [number, number] = [-0.42, 0.55];
const SUN: [number, number] = [0.5, 0.62];
const CLASSIC_PLACE: DoorPlace = { name: "", skyTop: "#fff6df", skyLow: "#e9f5dc", ground: "#b3de8d", light: "#fff3d6" };
const CLASSIC_LOOK: GateLook = {
  leaf: C.wood,
  leafLight: "#cf9a68",
  leafDeep: C.woodDeep,
  soft: "#b3a5c9",
  emblem: null,
  emblemColor: C.cream,
  emblemDeep: C.gold,
  light: CLASSIC_PLACE.light,
};

const scratch = new THREE.Object3D();
const camTarget = new THREE.Vector3();
const camDir = new THREE.Vector3();
const tmp = new THREE.Vector3();
const MOTE_PATH = new THREE.QuadraticBezierCurve3(
  new THREE.Vector3(BUNNY[0] + 0.1, 1.25, BUNNY[2] + 0.1),
  new THREE.Vector3(-0.5, 3.6, 0.9),
  new THREE.Vector3(...EMBLEM),
);

function lookOf(door: Door | undefined): GateLook {
  if (!door) return CLASSIC_LOOK;
  return {
    leaf: door.leaf,
    leafLight: door.leafLight,
    leafDeep: door.leafDeep,
    soft: door.soft,
    emblem: door.id,
    emblemColor: door.emblem,
    emblemDeep: door.emblemDeep,
    light: door.behind.light,
  };
}

/** Same framing rule as FitCamera, blended between two views (k = 0 → gate, 1 → doorway). */
function placeCamera(camera: THREE.PerspectiveCamera, aspect: number, k: number): void {
  const a = VIEW_GATE;
  const b = VIEW_DOOR;
  camTarget.set(lerp(a.target[0], b.target[0], k), lerp(a.target[1], b.target[1], k), lerp(a.target[2], b.target[2], k));
  camDir.set(lerp(a.dir[0], b.dir[0], k), lerp(a.dir[1], b.dir[1], k), lerp(a.dir[2], b.dir[2], k)).normalize();
  const w = lerp(a.width, b.width, k);
  const h = lerp(a.height, b.height, k);
  const dist = Math.max(h / (2 * TAN), w / (2 * TAN * aspect));
  camera.position.copy(camTarget).addScaledVector(camDir, dist);
  camera.lookAt(camTarget);
}

function setInstance(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0): void {
  scratch.position.set(x, y, z);
  scratch.rotation.set(0, ry, 0);
  scratch.scale.set(sx, sy, sz);
  scratch.updateMatrix();
  m.setMatrixAt(i, scratch.matrix);
}

function skyTexture(kit: Kit, top: string, low: string): THREE.CanvasTexture {
  return kit.tex(`gate-sky|${top}|${low}`, () => {
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 128;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, top);
    grd.addColorStop(1, low);
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Soft white round glow, tinted by the material colour (light pool, moon and sun halos). */
function glowTexture(kit: Kit): THREE.CanvasTexture {
  return kit.tex("gate-glow", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

function layout() {
  const r = seeded(11);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  // a tall clipped hedge on both sides of the gate: bumps along its top, bushes along its foot
  const hedgeTop: Placement[] = [];
  const hedgeFoot: Placement[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const x = side * (1.72 + i * 0.8);
      hedgeTop.push({ x: x + rnd(-0.1, 0.1), y: 2.1 + rnd(0, 0.12), z: GATE_Z + rnd(-0.14, 0.06), s: rnd(1.35, 1.65), ry: rnd(0, 6) });
      hedgeFoot.push({ x: x + side * 0.3, z: GATE_Z + 0.4 + rnd(-0.05, 0.08), s: rnd(1.5, 1.85), ry: rnd(0, 6) });
    }
  }
  const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, s0 = 0.9, s1 = 1.3): Placement[] =>
    Array.from({ length: n }, () => ({ x: rnd(x0, x1), z: rnd(z0, z1), s: rnd(s0, s1), ry: rnd(0, 6) }));
  // in front of the gate: keep the path (|x| < 1.25) clear
  const front = (n: number, s0?: number, s1?: number) => scatter(n, -5, 5, 0.8, 3.8, s0, s1).filter((p) => Math.abs(p.x) > 1.3);
  return {
    hedgeTop,
    hedgeFoot,
    flowersPink: front(10),
    flowersWhite: front(10),
    tufts: front(18),
    mushrooms: front(4, 0.9, 1.2),
    // far trees over the hedge (the other side's sky covers them in the doorway)
    trees: [
      { x: -4.6, z: -6.5, s: 2.5, ry: 1 },
      { x: 4.2, z: -7.2, s: 2.8, ry: 2 },
      { x: -1.6, z: -8.8, s: 2.4, ry: 3 },
      { x: 1.9, z: -9.6, s: 2.7, ry: 4 },
      { x: 7.4, z: -6.2, s: 2.5, ry: 5 },
      { x: -7.8, z: -7.4, s: 2.7, ry: 0.5 },
    ] as Placement[],
    clouds: [
      { x: -4.5, y: 4.6, z: -9, s: 1.4 },
      { x: 3.8, y: 5.0, z: -10, s: 1.7 },
    ] as Placement[],
  };
}

/* ---------- The other side (local gate frame, drawn only once the door opens; it never takes the hedge's shadow) ---------- */

/** Static instances in one plain material (Field is for vertex-coloured decor). */
function Instances({ geometry, material, items }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: Placement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    items.forEach((it, i) => setInstance(m, i, it.x, it.y ?? 0, it.z, it.s ?? 1, it.s ?? 1, it.s ?? 1, it.ry ?? 0));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={mesh} args={[geometry, material, items.length]} />;
}

function Ground({ color, from = FLOOR_FRONT, to = BACK.zLow, y = 0.004, roughness }: { color: string; from?: number; to?: number; y?: number; roughness?: number }) {
  const kit = useKit();
  const depth = from - to;
  return (
    <mesh
      geometry={kit.geo(`gate-floor|${depth}`, () => new THREE.PlaneGeometry(BACK_W, depth))}
      material={kit.clay(color, roughness === undefined ? {} : { roughness })}
      rotation-x={-Math.PI / 2}
      position={[BACK_X, y, (from + to) / 2]}
    />
  );
}

/** Unlit gradient sky; children sit on it (x across, y up its slope). */
function Sky({ top, low, children }: { top: string; low: string; children?: ReactNode }) {
  const kit = useKit();
  const mat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ map: skyTexture(kit, top, low), fog: false })), [kit, top, low]);
  return (
    <group position={[BACK_X, BACK.top / 2, (BACK.zLow + BACK.zTop) / 2]} rotation-x={BACK_TILT}>
      <mesh geometry={kit.geo("gate-sky", () => new THREE.PlaneGeometry(BACK_W, BACK_LEN))} material={mat} />
      {children}
    </group>
  );
}

/** A round light on the sky (moon / sun) with a soft halo. */
function Orb({ at, color, halo }: { at: [number, number]; color: string; halo: string }) {
  const kit = useKit();
  const haloMat = useMemo(
    () => kit.own(new THREE.MeshBasicMaterial({ map: glowTexture(kit), color: halo, transparent: true, opacity: 0.6, depthWrite: false, fog: false })),
    [kit, halo],
  );
  return (
    <>
      <mesh geometry={kit.plane()} material={haloMat} position={[at[0], at[1], 0.015]} />
      <mesh geometry={kit.geo("gate-orb", () => new THREE.CircleGeometry(0.2, 32))} material={kit.basic(color)} position={[at[0], at[1], 0.03]} />
    </>
  );
}

const BUTTERFLIES = [
  { x: -0.55, y: 0.95, z: -0.72, p: 0, color: C.pink },
  { x: 0.42, y: 0.95, z: -0.85, p: 2.1, color: C.lilacDeep },
];

function Butterflies({ reduced }: { reduced: boolean }) {
  const kit = useKit();
  const flyers = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    t.current += frameDt(dtRaw) * (reduced ? 0.35 : 1);
    const k = t.current;
    BUTTERFLIES.forEach((b, i) => {
      flyers.current[i]?.position.set(b.x + Math.sin(k * 0.8 + b.p) * 0.3, b.y + Math.sin(k * 1.9 + b.p) * 0.1, b.z + Math.cos(k * 0.8 + b.p) * 0.1);
      const flap = reduced ? 0.5 : 0.25 + 0.9 * Math.abs(Math.sin(k * 11 + b.p));
      wings.current[i * 2]?.rotation.set(0, -flap, 0);
      wings.current[i * 2 + 1]?.rotation.set(0, flap, 0);
    });
  });
  return (
    <>
      {BUTTERFLIES.map((b, i) => (
        <group key={i} ref={(el) => void (flyers.current[i] = el)} position={[b.x, b.y, b.z]}>
          {[-1, 1].map((side, j) => (
            <group key={side} ref={(el) => void (wings.current[i * 2 + j] = el)}>
              <mesh geometry={kit.sphereLo()} material={kit.clay(b.color)} position={[side * 0.07, 0, 0]} scale={[0.07, 0.055, 0.012]} />
            </group>
          ))}
          <mesh geometry={kit.sphereLo()} material={kit.clay(C.ink)} scale={[0.012, 0.05, 0.012]} />
        </group>
      ))}
    </>
  );
}

function gardenLayout() {
  const r = seeded(23);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  // flower beds on both sides of a few stepping stones that lead in
  const beds = (n: number, s0: number, s1: number): Placement[] =>
    Array.from({ length: n }, () => ({ x: rnd(-1.75, 1.3), z: rnd(-1.08, -0.42), s: rnd(s0, s1), ry: rnd(0, 6) })).filter((p) => Math.abs(p.x - 0.05) > 0.24);
  return {
    bushes: Array.from({ length: 8 }, (_, i) => ({ x: -1.85 + i * 0.46 + rnd(-0.05, 0.05), z: -1.25 + rnd(-0.04, 0.04), s: rnd(0.9, 1.1), ry: rnd(0, 6) })),
    pink: [...beds(9, 1.4, 1.9), { x: -1.1, z: -0.5, s: 3.2, ry: 1 }],
    white: beds(8, 1.3, 1.8),
    lilac: [...beds(6, 1.4, 1.9), { x: 0.92, z: -0.55, s: 3.0, ry: 2 }],
    raspberry: beds(6, 1.4, 1.8),
    stones: [-0.42, -0.68, -0.94].map((z, i) => ({ x: 0.05 + (i % 2 ? 0.06 : -0.04), z, s: 3.2, ry: i })),
  };
}

/** Behind the flower door (and the classic gate): a garden in bloom with butterflies. */
function Garden({ place, reduced }: { place: DoorPlace; reduced: boolean }) {
  const kit = useKit();
  const L = useMemo(() => gardenLayout(), []);
  const geo = useMemo(
    () => ({
      bush: kit.geo("bush", S.bush),
      pink: kit.geo("flower-pink", () => S.flower(C.pink)),
      white: kit.geo("flower-white", () => S.flower(C.white)),
      lilac: kit.geo("flower-lilac", () => S.flower(C.lilacDeep)),
      raspberry: kit.geo("flower-raspberry", () => S.flower(C.raspberry)),
      stone: kit.geo("pebble", S.pebble),
    }),
    [kit],
  );
  return (
    <>
      <Ground color={place.ground} />
      <Sky top={place.skyTop} low={place.skyLow} />
      <Field geometry={geo.bush} items={L.bushes} receiveShadow={false} />
      <Field geometry={geo.pink} items={L.pink} receiveShadow={false} />
      <Field geometry={geo.white} items={L.white} receiveShadow={false} />
      <Field geometry={geo.lilac} items={L.lilac} receiveShadow={false} />
      <Field geometry={geo.raspberry} items={L.raspberry} receiveShadow={false} />
      <Field geometry={geo.stone} items={L.stones} receiveShadow={false} />
      <Butterflies reduced={reduced} />
    </>
  );
}

type Twinkle = { x: number; y: number; z?: number; s: number; p: number };

/** Small lights that breathe (stars on the sky, fireflies over the ground); still with reduced motion. */
function Twinkles({ items, geometry, color, drift = 0, reduced }: { items: Twinkle[]; geometry: THREE.BufferGeometry; color: string; drift?: number; reduced: boolean }) {
  const kit = useKit();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    t.current += reduced ? 0 : frameDt(dtRaw);
    const k = t.current;
    items.forEach((it, i) => {
      const glow = reduced ? 1 : 0.7 + 0.3 * Math.sin(k * 2.4 + it.p);
      const dx = Math.sin(k * 0.7 + it.p) * drift;
      const dy = Math.sin(k * 1.1 + it.p * 2) * drift;
      setInstance(m, i, it.x + dx, it.y + dy, it.z ?? 0.03, it.s * glow, it.s * glow * (drift ? 1 : 1.35), it.s * (drift ? glow : 0.3));
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geometry, kit.basic(color), items.length]} frustumCulled={false} />;
}

function nightLayout() {
  const r = seeded(37);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  return {
    stars: Array.from({ length: 28 }, () => ({ x: rnd(-1.6, 1.4), y: rnd(-0.75, 1.3), s: rnd(0.025, 0.05), p: rnd(0, 6) })).filter(
      (p) => Math.hypot(p.x - MOON[0], p.y - MOON[1]) > 0.38,
    ),
    bushes: Array.from({ length: 7 }, (_, i) => ({ x: -1.85 + i * 0.52 + rnd(-0.06, 0.06), z: -1.3 + rnd(-0.05, 0.05), s: rnd(0.85, 1.05), ry: rnd(0, 6) })),
    flies: Array.from({ length: 7 }, () => ({ x: rnd(-1.3, 0.9), y: rnd(0.25, 0.85), z: rnd(-1.05, -0.45), s: 0.026, p: rnd(0, 6) })),
  };
}

/** Behind the star door: a night sky full of stars, a round moon, fireflies over a quiet meadow. */
function Night({ place, reduced }: { place: DoorPlace; reduced: boolean }) {
  const kit = useKit();
  const L = useMemo(() => nightLayout(), []);
  return (
    <>
      <Ground color={place.ground} />
      <Sky top={place.skyTop} low={place.skyLow}>
        <Orb at={MOON} color="#fff4cf" halo={place.light} />
        {[
          [-0.06, 0.05, 1],
          [0.07, -0.06, 0.7],
        ].map(([dx, dy, s], i) => (
          <mesh key={i} geometry={kit.geo("gate-crater", () => new THREE.CircleGeometry(0.045, 16))} material={kit.basic("#ece0b4")} position={[MOON[0] + dx, MOON[1] + dy, 0.035]} scale={s} />
        ))}
        <Twinkles items={L.stars} geometry={kit.geo("sparkle", S.sparkle)} color="#fff3c4" reduced={reduced} />
      </Sky>
      <Instances geometry={kit.geo("bush", S.bush)} material={kit.clay("#2f2858")} items={L.bushes} />
      <Twinkles items={L.flies} geometry={kit.sphereLo()} color="#ffe9a6" drift={0.05} reduced={reduced} />
    </>
  );
}

const SHELLS: Placement[] = [
  { x: -0.78, z: -0.52, s: 0.11, ry: 0.5 },
  { x: 0.5, z: -0.78, s: 0.09, ry: -0.7 },
  { x: -0.18, z: -0.94, s: 0.08, ry: 2.2 },
  { x: 0.86, z: -0.42, s: 0.1, ry: 1.1 },
];
const STARFISH: Placement[] = [
  { x: -1.15, z: -0.74, s: 0.12, ry: 0.3 },
  { x: 0.18, z: -0.46, s: 0.1, ry: 1.2 },
];

/** Behind the shell door: a sunny beach — sand with shells and starfish, a sea-green sea, foam that comes and goes. */
function Beach({ door, reduced }: { door: Door; reduced: boolean }) {
  const kit = useKit();
  const place = door.behind;
  const foam = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dtRaw) => {
    if (reduced) return;
    t.current += frameDt(dtRaw);
    foam.current?.position.setZ(SHORE_Z + Math.sin(t.current * 1.4) * 0.035);
  });
  return (
    <>
      <Ground color={place.ground} to={SHORE_Z} />
      <Ground color={BEACH_SEA} from={SHORE_Z} y={0.006} roughness={0.35} />
      <mesh
        ref={foam}
        geometry={kit.geo("gate-foam", () => new THREE.PlaneGeometry(BACK_W, 0.07))}
        material={kit.basic("#ffffff", 0.85)}
        rotation-x={-Math.PI / 2}
        position={[BACK_X, 0.009, SHORE_Z]}
      />
      <Sky top={place.skyTop} low={place.skyLow}>
        <Orb at={SUN} color="#ffe8a6" halo="#fff6d6" />
      </Sky>
      <EmblemField kind="shell" color={door.emblem} deep={door.emblemDeep} items={SHELLS} />
      <EmblemField kind="star" color={C.pink} deep={C.raspberry} items={STARFISH} />
    </>
  );
}

function Beyond({ door, reduced }: { door: Door | undefined; reduced: boolean }) {
  if (door?.id === "star") return <Night place={door.behind} reduced={reduced} />;
  if (door?.id === "shell") return <Beach door={door} reduced={reduced} />;
  return <Garden place={door?.behind ?? CLASSIC_PLACE} reduced={reduced} />;
}

/**
 * ด่านประตู 3D — ประตูที่เด็กเลือกตั้งอยู่ในแนวพุ่มไม้สูง จึงเห็นอีกฝั่งได้ทางช่องประตูเท่านั้น
 * - ตอนเกมนับเสียงที่ถึงเกณฑ์ (inZone จากตรรกะด่านประตู) มีประกายสีส้มลอยจากกระต่ายไปที่ตรา
 * - เงียบ ข้อมูลค้าง หรือกำลังเล่นเสียงตัวอย่าง: ไม่มีประกาย ลูกปัดไม่เพิ่ม (ความคืบหน้ามาจากตรรกะเท่านั้น)
 * - เหตุการณ์เปิด: สลักเลื่อน บานเหวี่ยงออก แสงจากอีกฝั่งส่องลงทางเดิน กล้องเลื่อนไปที่ช่องประตูให้เห็นปลายทาง
 *   (สวนดอกไม้ / ฟ้าเต็มดาว / ชายหาด) กระต่ายกับเพื่อนเมฆหันไปมองด้วย · ลดการเคลื่อนไหว = ตัดภาพไปที่ปลายทางทันที
 */
export function GateWorld({ gameRef, frameRef, outfit, species, reduced, tier, door: doorId }: GateSpec) {
  const kit = useKit();
  const door = doorById(doorId);
  const look = useMemo(() => lookOf(door), [door]);
  const L = useMemo(() => layout(), []);
  const geo = useMemo(
    () => ({
      bush: kit.geo("bush", S.bush),
      tree: kit.geo("tree", S.tree),
      flowerPink: kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerWhite: kit.geo("flower-white", () => S.flower(C.white)),
      tuft: kit.geo("tuft", S.grassTuft),
      mushroom: kit.geo("mushroom", S.mushroom),
      cloud: kit.geo("cloud", S.cloud),
      ground: kit.geo("ground-40x30", () => new THREE.PlaneGeometry(40, 30)),
      path: kit.geo("gate-path", () => new THREE.BoxGeometry(2.1, 0.3, 6)),
      hedge: kit.geo("gate-hedge", () => new RoundedBoxGeometry(7.5, 2.4, 0.85, 3, 0.3)),
    }),
    [kit],
  );
  const shadows = tier !== "low";
  const gate = useRef<GateDrive>({ progress: 0, live: 0, open: false, reduced });
  const bunny = useRef(bunnyDrive({ pose: "stand", reduced }));
  const cloud = useRef(cloudDrive({ reduced }));
  const bunnyRoot = useRef<THREE.Group>(null);
  const cloudRoot = useRef<THREE.Group>(null);
  const beyond = useRef<THREE.Group>(null);
  const pool = useRef<THREE.Mesh>(null);
  const motes = useRef<THREE.InstancedMesh>(null);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1.5, z: GATE_Z + 0.55 });
  const sim = useRef({ next: 0, i: 0, t: new Float32Array(MOTES).fill(-1), off: new Float32Array(MOTES) });
  const st = useRef<{ game: unknown; cheered: boolean; openT: number; turn: number }>({ game: null, cheered: false, openT: 0, turn: 0 });
  // light from the other side spilling onto the path (opacity animated through the mesh ref)
  const poolMat = useMemo(
    () => kit.own(new THREE.MeshBasicMaterial({ map: glowTexture(kit), color: look.light, transparent: true, opacity: 0, depthWrite: false })),
    [kit, look.light],
  );

  useLayoutEffect(() => {
    const m = motes.current;
    if (!m) return;
    for (let i = 0; i < MOTES; i++) setInstance(m, i, 0, 0, 0, 0);
    m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    const w = st.current;
    if (w.game !== g) {
      // new round (restart): the door is shut again and the camera is back at the gate
      w.game = g;
      w.cheered = s.open;
      w.openT = s.open ? 99 : 0;
      w.turn = s.open ? 1 : 0;
    }

    const gd = gate.current;
    gd.reduced = reduced;
    gd.progress = s.progress;
    gd.open = s.open;
    // the live glow follows only what the game counts (never the example word leaking into the mics)
    const nasalLive = s.speaking && f.nasal !== null ? f.nasal : 0;
    gd.live = s.open ? 1 : clamp01(nasalLive / Math.max(1, g.cfg.nasalThreshold)) * (s.inZone ? 1 : 0.55);

    const b = bunny.current;
    b.reduced = reduced;
    b.pose = !s.open && s.speaking ? "sing" : "stand";
    const c = cloud.current;
    c.reduced = reduced;
    c.excite = s.inZone ? 0.6 : 0.2;

    w.openT = s.open ? w.openT + dt / (reduced ? CALM.slow : 1) : 0;
    if (s.open && !w.cheered) {
      w.cheered = true;
      b.cheer += 1;
      c.wave += 1;
      fire.current = { seq: fire.current.seq + 1, x: 0, y: 1.5, z: GATE_Z + 0.55 };
    }
    // the other side is only drawn once the door opens (the shut leaves hide it anyway)
    if (beyond.current) beyond.current.visible = s.open;
    const spill = easeOutCubic(clamp01((w.openT - 0.3) / 1.0));
    const p = pool.current;
    if (p) {
      (p.material as THREE.MeshBasicMaterial).opacity = 0.75 * spill;
      p.visible = spill > 0.01;
    }
    // after opening, both friends turn to look through the doorway
    w.turn = s.open ? damp(w.turn, 1, reduced ? 1.6 : 3, dt) : 0;
    bunnyRoot.current?.rotation.set(0, lerp(BUNNY_FACE, BUNNY_LOOK, w.turn), 0);
    cloudRoot.current?.rotation.set(0, lerp(CLOUD_FACE, CLOUD_LOOK, w.turn), 0);

    // camera: the whole gate while playing; once the leaves swing it moves to the doorway (reduced motion: slower, part of the way)
    const cam = state.camera as THREE.PerspectiveCamera;
    if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    const push = easeInOutSine(clamp01((w.openT - PUSH_DELAY_S) / PUSH_S));
    placeCamera(cam, state.size.width / Math.max(1, state.size.height), reduced ? push * 0.6 : push);

    // orange "voice" motes travel from the bunny to the emblem only while the game counts in-zone speech
    const m = motes.current;
    if (!m) return;
    const sm = sim.current;
    sm.next -= dt;
    if (s.inZone && !s.open && !reduced && sm.next <= 0) {
      sm.next = 0.09;
      sm.t[sm.i] = 0;
      sm.off[sm.i] = Math.random();
      sm.i = (sm.i + 1) % MOTES;
    }
    for (let i = 0; i < MOTES; i++) {
      if (sm.t[i] >= 0) {
        sm.t[i] += dt / 0.95;
        if (sm.t[i] >= 1) sm.t[i] = -1;
      }
      if (sm.t[i] >= 0) {
        const k = sm.t[i];
        MOTE_PATH.getPoint(k, tmp);
        tmp.x += Math.sin(k * 9 + sm.off[i] * 6) * 0.12 * (1 - k);
        setInstance(m, i, tmp.x, tmp.y, tmp.z, 0.07 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.6));
      } else {
        setInstance(m, i, 0, 0, 0, 0);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 13, 30]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-4, 8, 6]} box={6.5} />

        <mesh geometry={geo.ground} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, -0.02, -3]} receiveShadow />
        <mesh geometry={geo.path} material={kit.clay(C.path)} position={[0, -0.14, 2.9]} receiveShadow />

        {/* tall hedge on both sides: what is behind the door can only be seen through the doorway */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} geometry={geo.hedge} material={kit.clay(C.leaf)} position={[sx * 5.25, 1.2, GATE_Z]} receiveShadow />
        ))}
        <Field geometry={geo.bush} items={L.hedgeTop} />
        <Field geometry={geo.bush} items={L.hedgeFoot} />
        <Field geometry={geo.tree} items={L.trees} castShadow={shadows} />
        <Field geometry={geo.flowerPink} items={L.flowersPink} />
        <Field geometry={geo.flowerWhite} items={L.flowersWhite} />
        <Field geometry={geo.tuft} items={L.tufts} />
        <Field geometry={geo.mushroom} items={L.mushrooms} />
        <Field geometry={geo.cloud} items={L.clouds} receiveShadow={false} />

        <group position={[0, 0, GATE_Z]}>
          <Gate drive={gate} look={look} />
          <group ref={beyond} visible={false}>
            <Beyond door={door} reduced={reduced} />
          </group>
        </group>
        <mesh
          ref={pool}
          geometry={kit.plane()}
          material={poolMat}
          rotation-x={-Math.PI / 2}
          position={[0, 0.03, GATE_Z + 0.95]}
          scale={[2.8, 1.9, 1]}
          renderOrder={1}
          visible={false}
        />

        <group ref={bunnyRoot} position={BUNNY} rotation-y={BUNNY_FACE}>
          <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
        </group>
        <BlobShadow at={BUNNY} size={[0.95, 0.75]} />
        <group ref={cloudRoot} position={CLOUD} rotation-y={CLOUD_FACE}>
          <group scale={0.85}>
            <CloudPal drive={cloud} />
          </group>
        </group>
        <BlobShadow at={[CLOUD[0], 0, CLOUD[2]]} size={[1, 0.7]} materialKey="soft" opacity={0.5} />

        <instancedMesh ref={motes} args={[kit.sphereLo(), kit.basic(C.nasalGlow), MOTES]} frustumCulled={false} />
        <Burst fire={fire} reduced={reduced} max={20} />
      </group>
    </>
  );
}
