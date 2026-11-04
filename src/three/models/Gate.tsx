import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { LOCK_BEADS, type DoorId } from "../../data/doors";
import { bump, clamp01, damp, easeOutCubic, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { Field, type Placement } from "../parts";
import { colored, type Part } from "../shapes";

export interface GateDrive {
  /** Cumulative door progress 0..1 (from the game logic; never decreases). */
  progress: number;
  /** Live nasal intensity 0..1 while the game hears the child (0 when silent/stale or while an example plays). */
  live: number;
  open: boolean;
  reduced: boolean;
}

/** How the door the child picked looks (colours from src/data/doors.ts). `emblem: null` = the classic wooden gate. */
export interface GateLook {
  leaf: string;
  leafLight: string;
  leafDeep: string;
  /** Fill of the arch above the doorway. */
  soft: string;
  emblem: DoorId | null;
  emblemColor: string;
  emblemDeep: string;
  /** Light that flashes through the doorway as the leaves swing open. */
  light: string;
}

const DOOR_W = 1.0;
const DOOR_H = 2.4;
/** The leaves swing out toward the bunny and stop square to the wall (~93°), framing the doorway instead of blocking it. */
const OPEN_ANGLE = 1.62;
const MEDALLION_Y = 2.92;
const BEAD_RING = 0.44;
const BOLT_Y = 1.2;
/** Bolt centre on the left leaf (leaf-local x); it crosses the seam into the keeper on the right leaf. */
const BOLT_X = 0.9;
const BOLT_TRAVEL = 0.38;
/** The open event: the bolt slides back, then the leaves swing out (seconds). */
const BOLT_S = 0.35;
const SWING_DELAY_S = 0.3;
const SWING_S = 1.0;

const LIT = new THREE.Color(C.nasal);
// unlit slots: pale cream on the arch, so lit orange beads read clearly
const DIM = new THREE.Color("#f3ecdf");
const scratch = new THREE.Object3D();

/* ---------- Emblems (ลายกุญแจ): clay cookie-cutter shapes, one vertex-coloured geometry each ---------- */

const EXTRUDE = { depth: 0.2, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 };

/** Closed outline around (0, 0) from `n` samples, starting at the top. */
function outline(n: number, at: (i: number) => [number, number]): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const [x, y] = at(i);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

const polar = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];

/** Five plump petals. */
function flowerShape(): THREE.Shape {
  return outline(90, (i) => {
    const u = (i / 90) * Math.PI * 2;
    return polar(Math.PI / 2 + u, 0.4 + 0.6 * Math.pow(Math.abs(Math.cos(2.5 * u)), 0.7));
  });
}

function starShape(): THREE.Shape {
  return outline(10, (i) => polar(Math.PI / 2 + (i * Math.PI) / 5, i % 2 === 0 ? 1 : 0.46));
}

/** Scallop shell: a ribbed fan with a bumpy edge and two little ears at the hinge. */
const SHELL_HINGE = -0.66;
const SHELL_RIBS = 7;
const shellAngle = (u: number) => Math.PI * (0.86 - 0.72 * u);
function shellShape(): THREE.Shape {
  const n = 56;
  const pts: [number, number][] = [
    [-0.3, -1.0],
    [-0.34, -0.72],
  ];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const r = 1.42 + 0.1 * Math.pow(Math.abs(Math.sin(Math.PI * SHELL_RIBS * u)), 0.6);
    const [x, y] = polar(shellAngle(u), r);
    pts.push([x * 0.72, SHELL_HINGE + y]);
  }
  pts.push([0.34, -0.72], [0.3, -1.0]);
  return outline(pts.length, (i) => pts[i]);
}

/** Emblem facing +z with radius ≈ 1 (scale it into place). `flat` = lying face-up on the ground. */
function emblemGeometry(kind: DoorId, color: string, deep: string, flat = false): THREE.BufferGeometry {
  const parts: Part[] = [];
  if (kind === "flower") {
    parts.push({ geo: new THREE.ExtrudeGeometry(flowerShape(), EXTRUDE), color });
    parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 0.16, 18), color: deep, at: [0, 0, 0.29], rot: [Math.PI / 2, 0, 0] });
  } else if (kind === "star") {
    parts.push({ geo: new THREE.ExtrudeGeometry(starShape(), EXTRUDE), color });
  } else {
    parts.push({ geo: new THREE.ExtrudeGeometry(shellShape(), EXTRUDE), color });
    // ribs from the hinge to the notches of the edge
    for (let k = 1; k < SHELL_RIBS; k++) {
      const a = shellAngle(k / SHELL_RIBS);
      const dx = Math.cos(a) * 0.72;
      const dy = Math.sin(a);
      const len = Math.hypot(dx, dy);
      parts.push({
        geo: new THREE.BoxGeometry(0.07, 1.05 * len, 0.06),
        color: deep,
        at: [dx * 0.78, SHELL_HINGE + dy * 0.78, 0.29],
        rot: [0, 0, Math.atan2(dy, dx) - Math.PI / 2],
      });
    }
  }
  const g = colored(parts);
  if (flat) {
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.07, 0);
    g.computeBoundingSphere();
  }
  return g;
}

/** Emblems lying on the ground (shells and starfish on the beach behind the shell door) — one draw call. */
export function EmblemField({ kind, color, deep, items }: { kind: DoorId; color: string; deep: string; items: Placement[] }) {
  const kit = useKit();
  const geometry = kit.geo(`emblem-flat|${kind}|${color}|${deep}`, () => emblemGeometry(kind, color, deep, true));
  return <Field geometry={geometry} items={items} receiveShadow={false} />;
}

/**
 * ประตูที่เด็กเลือก ในซุ้มหินมีมอส: บานสองบานสีของประตู มีลายบนบาน ตราบนซุ้ม และสลักทองคาดกลางบาน
 * - ลูกปัดสีส้ม 12 เม็ดรอบตราสว่างตามความคืบหน้าสะสม (ค่าจากตรรกะด่านประตู) · วงแหวนส้มรอบตราเรืองตามค่าจมูกสด
 * - เหตุการณ์เปิด: สลักเลื่อนออก แล้วบานเหวี่ยงออกมาทางกระต่าย มีแสงวาบจากด้านหลังแล้วจางให้เห็นสิ่งที่อยู่ข้างหลัง
 * - ก่อนเปิด บานปิดสนิท (สลักคาดอยู่) จึงไม่เห็นข้างหลังก่อนเวลา
 */
export function Gate({ drive, look }: { drive: RefObject<GateDrive>; look: GateLook }) {
  const kit = useKit();
  const geo = useMemo(
    () => ({
      pillar: kit.geo("gate-pillar", () => new RoundedBoxGeometry(0.56, 2.4, 0.56, 3, 0.1)),
      cap: kit.geo("gate-cap", () => new RoundedBoxGeometry(0.72, 0.2, 0.72, 2, 0.07)),
      arch: kit.geo("gate-arch", () => new THREE.TorusGeometry(1.26, 0.21, 10, 30, Math.PI)),
      tympanum: kit.geo("gate-tympanum", () => new THREE.CircleGeometry(1.08, 28, 0, Math.PI)),
      sill: kit.geo("gate-sill", () => new RoundedBoxGeometry(2.04, 0.05, 0.62, 2, 0.02)),
      plank: kit.geo("gate-plank", () => new RoundedBoxGeometry(0.31, DOOR_H - 0.04, 0.1, 2, 0.04)),
      band: kit.geo("gate-band", () => new RoundedBoxGeometry(DOOR_W - 0.04, 0.12, 0.14, 2, 0.04)),
      bolt: kit.geo("gate-bolt", () => new RoundedBoxGeometry(0.62, 0.09, 0.07, 2, 0.03)),
      staple: kit.geo("gate-staple", () => new RoundedBoxGeometry(0.09, 0.2, 0.16, 2, 0.03)),
      disc: kit.geo("gate-disc", () => new THREE.CylinderGeometry(0.34, 0.34, 0.08, 32)),
      ring: kit.geo("gate-ring", () => new THREE.TorusGeometry(0.28, 0.026, 8, 40)),
      flash: kit.geo("gate-flash", () => new THREE.PlaneGeometry(2.0, DOOR_H)),
    }),
    [kit],
  );
  const kind = look.emblem;
  const emblem = kind ? kit.geo(`gate-emblem|${kind}|${look.emblemColor}|${look.emblemDeep}`, () => emblemGeometry(kind, look.emblemColor, look.emblemDeep)) : null;
  // per-instance materials whose opacity is animated (reached through the mesh refs every frame)
  const ringMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.nasal, transparent: true, opacity: 0.25 })), [kit]);
  const flashMat = useMemo(
    () => kit.own(new THREE.MeshBasicMaterial({ color: look.light, transparent: true, opacity: 0, depthWrite: false })),
    [kit, look.light],
  );
  const beads = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const bolt = useRef<THREE.Group>(null);
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  const st = useRef({ lit: -1, live: 0, openT: 0, t: 0 });

  useLayoutEffect(() => {
    const m = beads.current;
    if (!m) return;
    for (let i = 0; i < LOCK_BEADS; i++) {
      const a = Math.PI / 2 - (i / LOCK_BEADS) * Math.PI * 2; // clockwise from the top
      scratch.position.set(Math.cos(a) * BEAD_RING, Math.sin(a) * BEAD_RING, 0);
      scratch.scale.setScalar(0.065);
      scratch.updateMatrix();
      m.setMatrixAt(i, scratch.matrix);
      m.setColorAt(i, DIM);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    s.t += dt;
    const lit = d.open ? LOCK_BEADS : Math.floor(d.progress * LOCK_BEADS + 1e-6);
    const m = beads.current;
    if (m && lit !== s.lit) {
      for (let i = 0; i < LOCK_BEADS; i++) m.setColorAt(i, i < lit ? LIT : DIM);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      s.lit = lit;
    }
    s.live = damp(s.live, d.open ? 1 : d.live, 10, dt);
    const pulse = d.reduced ? 0 : Math.sin(s.t * 9) * 0.06 * s.live;
    const r = ring.current;
    if (r) {
      (r.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.78 * Math.min(1, s.live + pulse);
      r.scale.setScalar(1 + 0.1 * s.live + pulse);
    }

    // open: the bolt slides back, then both leaves swing out; reduced motion shows the end state at once
    s.openT = d.open ? (d.reduced ? 99 : s.openT + dt) : 0;
    const slide = easeOutCubic(clamp01(s.openT / BOLT_S));
    const swing = easeOutCubic(clamp01((s.openT - SWING_DELAY_S) / SWING_S));
    bolt.current?.position.setX(BOLT_X - BOLT_TRAVEL * slide);
    doorL.current?.rotation.set(0, -OPEN_ANGLE * swing, 0);
    doorR.current?.rotation.set(0, OPEN_ANGLE * swing, 0);
    const f = flash.current;
    if (f) {
      const k = d.reduced ? 0 : bump(clamp01((s.openT - SWING_DELAY_S) / 1.2));
      (f.material as THREE.MeshBasicMaterial).opacity = 0.85 * k;
      f.visible = k > 0.01;
    }
  });

  const stone = kit.clay(C.stone);
  const stoneDeep = kit.clay(C.stoneDeep);
  const moss = kit.clay(C.moss);
  const deep = kit.clay(look.leafDeep);
  const emblemMat = kit.clay(C.white, { vertexColors: true });
  const leaf = (side: 1 | -1, ref: RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[-side * DOOR_W, 0, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          geometry={geo.plank}
          material={kit.clay(i === 1 ? look.leaf : look.leafLight)}
          position={[side * (0.17 + i * 0.33), DOOR_H / 2, 0]}
          castShadow
        />
      ))}
      <mesh geometry={geo.band} material={deep} position={[side * DOOR_W * 0.5, 0.55, 0.02]} castShadow />
      <mesh geometry={geo.band} material={deep} position={[side * DOOR_W * 0.5, 1.75, 0.02]} castShadow />
      {emblem ? <mesh geometry={emblem} material={emblemMat} position={[side * 0.5, 2.07, 0.06]} scale={0.13} /> : null}
      {side === 1 ? (
        <>
          <mesh geometry={geo.staple} material={deep} position={[0.45, BOLT_Y, 0.08]} />
          <group ref={bolt} position={[BOLT_X, BOLT_Y, 0.11]}>
            <mesh geometry={geo.bolt} material={kit.clay(C.gold, { roughness: 0.4 })} castShadow />
            <mesh geometry={kit.sphereLo()} material={kit.clay("#e2ad2a", { roughness: 0.4 })} position={[-0.14, 0, 0.06]} scale={0.055} />
          </group>
        </>
      ) : (
        <mesh geometry={geo.staple} material={deep} position={[-0.88, BOLT_Y, 0.08]} />
      )}
    </group>
  );

  return (
    <group>
      {/* light from the other side, seen through the opening while the leaves swing */}
      <mesh ref={flash} geometry={geo.flash} material={flashMat} position={[0, DOOR_H / 2, -0.3]} visible={false} />
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 1.26, 0, 0]}>
          <mesh geometry={geo.pillar} material={stone} position={[0, 1.2, 0]} castShadow receiveShadow />
          <mesh geometry={geo.cap} material={stoneDeep} position={[0, 2.45, 0]} castShadow />
          <mesh geometry={kit.dome()} material={moss} position={[0.05, 2.54, 0.05]} scale={[0.26, 0.12, 0.24]} />
          <mesh geometry={kit.dome()} material={moss} position={[-0.18, 0.02, 0.24]} scale={[0.2, 0.14, 0.12]} />
        </group>
      ))}
      <mesh geometry={geo.sill} material={stoneDeep} position={[0, 0, 0]} receiveShadow />
      <mesh geometry={geo.arch} material={stone} position={[0, 2.4, 0]} castShadow />
      <mesh geometry={geo.tympanum} material={kit.clay(look.soft)} position={[0, 2.4, -0.02]} />
      <group position={[0, MEDALLION_Y, 0.06]}>
        {/* the door's deep colour behind its emblem, so a white flower or a gold star reads clearly */}
        <mesh geometry={geo.disc} material={deep} rotation={[Math.PI / 2, 0, 0]} />
        <mesh ref={ring} geometry={geo.ring} material={ringMat} position={[0, 0, 0.05]} />
        {emblem ? (
          <mesh geometry={emblem} material={emblemMat} position={[0, 0, 0.05]} scale={0.2} />
        ) : (
          <mesh geometry={kit.sphere()} material={kit.clay(C.cream)} position={[0, 0, 0.04]} scale={[0.13, 0.13, 0.05]} />
        )}
        <instancedMesh ref={beads} args={[kit.sphereLo(), kit.basic(C.white), LOCK_BEADS]} position={[0, 0, 0.03]} />
      </group>
      {leaf(1, doorL)}
      {leaf(-1, doorR)}
    </group>
  );
}
