import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { damp, easeOutCubic, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";

export interface GateDrive {
  /** Cumulative door progress 0..1 (from the game logic; never decreases). */
  progress: number;
  /** Live nasal intensity 0..1 while voiced and valid (0 when silent/stale). */
  live: number;
  open: boolean;
  reduced: boolean;
}

/** Orange beads around the emblem: one lights up per 1/BEADS of progress. */
export const BEADS = 12;
const DOOR_W = 1.0;
const DOOR_H = 2.4;
const OPEN_ANGLE = 1.85;

/**
 * ประตูแฟนตาซีของสวน: ซุ้มหินมีมอส บานประตูไม้สองบาน ตราวงกลมกลางซุ้มล้อมด้วยลูกปัดสีส้ม 12 เม็ด
 * - ลูกปัดสว่างตามความคืบหน้าสะสม (ค่าจากตรรกะด่านประตู) + ประตูแง้มตามความคืบหน้าเล็กน้อย
 * - แกนตราเรืองแสงส้มตามค่าจมูกสด (เฉพาะตอนมีเสียงและข้อมูลใช้ได้)
 * - เปิดครบ → บานประตูเหวี่ยงเปิด มีแสงอุ่นจากด้านหลัง
 */
export function Gate({ drive }: { drive: RefObject<GateDrive> }) {
  const kit = useKit();
  const geo = useMemo(
    () => ({
      pillar: kit.geo("gate-pillar", () => new RoundedBoxGeometry(0.56, 2.4, 0.56, 3, 0.1)),
      cap: kit.geo("gate-cap", () => new RoundedBoxGeometry(0.72, 0.2, 0.72, 2, 0.07)),
      arch: kit.geo("gate-arch", () => new THREE.TorusGeometry(1.26, 0.21, 10, 30, Math.PI)),
      tympanum: kit.geo("gate-tympanum", () => new THREE.CircleGeometry(1.08, 28, 0, Math.PI)),
      plank: kit.geo("gate-plank", () => new RoundedBoxGeometry(0.31, DOOR_H - 0.04, 0.1, 2, 0.04)),
      band: kit.geo("gate-band", () => new RoundedBoxGeometry(DOOR_W - 0.04, 0.12, 0.14, 2, 0.04)),
      emblem: kit.geo("gate-emblem", () => new THREE.CylinderGeometry(0.27, 0.27, 0.08, 28)),
      glow: kit.geo("gate-glow", () => new THREE.PlaneGeometry(2.05, DOOR_H)),
    }),
    [kit],
  );
  // per-instance materials whose glow is animated
  const coreMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.nasal, transparent: true, opacity: 0.35 })), [kit]);
  const lightMat = useMemo(
    () => kit.own(new THREE.MeshBasicMaterial({ color: "#fff3d6", transparent: true, opacity: 0, depthWrite: false })),
    [kit],
  );
  const beads = useRef<THREE.InstancedMesh>(null);
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const st = useRef({ lit: -1, open: 0, live: 0, t: 0 });
  const litColor = useMemo(() => new THREE.Color(C.nasal), []);
  // unlit slots: pale cream on the darker stone, so lit orange beads read clearly
  const dimColor = useMemo(() => new THREE.Color("#f3ecdf"), []);

  useLayoutEffect(() => {
    const m = beads.current;
    if (!m) return;
    const d = new THREE.Object3D();
    for (let i = 0; i < BEADS; i++) {
      const a = Math.PI / 2 - (i / BEADS) * Math.PI * 2; // clockwise from the top
      d.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0);
      d.scale.setScalar(0.065);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, dimColor);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [dimColor]);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    s.t += dt;
    const lit = d.open ? BEADS : Math.floor(d.progress * BEADS + 1e-6);
    const m = beads.current;
    if (m && lit !== s.lit) {
      for (let i = 0; i < BEADS; i++) m.setColorAt(i, i < lit ? litColor : dimColor);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      s.lit = lit;
    }
    s.live = damp(s.live, d.open ? 1 : d.live, 10, dt);
    const pulse = d.reduced ? 0 : Math.sin(s.t * 9) * 0.06 * s.live;
    coreMat.opacity = 0.3 + 0.7 * Math.min(1, s.live + pulse);
    const k = 1 + 0.25 * s.live + pulse;
    core.current?.scale.set(0.17 * k, 0.17 * k, 0.06);

    s.open = d.open ? (d.reduced ? 1 : Math.min(1, s.open + dt / 1.1)) : 0;
    const crack = 0.16 * d.progress; // the doors part a little as progress builds
    const ang = d.open ? crack + (OPEN_ANGLE - crack) * easeOutCubic(s.open) : crack;
    doorL.current?.rotation.set(0, ang, 0);
    doorR.current?.rotation.set(0, -ang, 0);
    lightMat.opacity = d.open ? 0.85 * easeOutCubic(s.open) : 0.12 * d.progress;
  });

  const stone = kit.clay(C.stone);
  const stoneDeep = kit.clay(C.stoneDeep);
  const moss = kit.clay(C.moss);
  const door = (side: 1 | -1, ref: RefObject<THREE.Group | null>) => (
    <group ref={ref} position={[-side * DOOR_W, 0, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          geometry={geo.plank}
          material={kit.clay(i === 1 ? C.wood : "#cf9a68")}
          position={[side * (0.17 + i * 0.33), DOOR_H / 2, 0]}
          castShadow
        />
      ))}
      <mesh geometry={geo.band} material={kit.clay(C.woodDeep)} position={[side * DOOR_W * 0.5, 0.55, 0.02]} castShadow />
      <mesh geometry={geo.band} material={kit.clay(C.woodDeep)} position={[side * DOOR_W * 0.5, 1.75, 0.02]} castShadow />
      <mesh geometry={kit.sphereLo()} material={kit.clay(C.gold, { roughness: 0.4 })} position={[side * 0.86, 1.15, 0.09]} scale={0.065} />
    </group>
  );

  return (
    <group>
      {/* warm light from the garden beyond, seen through the opening */}
      <mesh geometry={geo.glow} material={lightMat} position={[0, DOOR_H / 2, -0.25]} />
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 1.26, 0, 0]}>
          <mesh geometry={geo.pillar} material={stone} position={[0, 1.2, 0]} castShadow receiveShadow />
          <mesh geometry={geo.cap} material={stoneDeep} position={[0, 2.45, 0]} castShadow />
          <mesh geometry={kit.dome()} material={moss} position={[0.05, 2.54, 0.05]} scale={[0.26, 0.12, 0.24]} />
          <mesh geometry={kit.dome()} material={moss} position={[-0.18, 0.02, 0.24]} scale={[0.2, 0.14, 0.12]} />
        </group>
      ))}
      <mesh geometry={geo.arch} material={stone} position={[0, 2.4, 0]} castShadow />
      <mesh geometry={geo.tympanum} material={kit.clay("#b3a5c9")} position={[0, 2.4, -0.02]} />
      <group position={[0, 2.92, 0.06]}>
        <mesh geometry={geo.emblem} material={kit.clay("#efe7f6")} rotation={[Math.PI / 2, 0, 0]} />
        <mesh ref={core} geometry={kit.sphere()} material={coreMat} position={[0, 0, 0.05]} scale={[0.17, 0.17, 0.06]} />
        <instancedMesh ref={beads} args={[kit.sphereLo(), kit.basic(C.white), BEADS]} position={[0, 0, 0.03]} />
      </group>
      {door(1, doorL)}
      {door(-1, doorR)}
    </group>
  );
}
