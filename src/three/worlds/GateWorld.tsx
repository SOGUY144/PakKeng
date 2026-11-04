import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clamp01, damp, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny } from "../models/Bunny";
import { CloudPal } from "../models/CloudPal";
import { bunnyDrive, cloudDrive } from "../models/drives";
import { Gate, type GateDrive } from "../models/Gate";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { GateSpec } from "../spec";

const BUNNY: [number, number, number] = [-0.8, 0, 1.45];
const EMBLEM: [number, number, number] = [0, 2.92, 0.1];
const MOTES = 18;

function layout() {
  const r = seeded(11);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const hedge: Placement[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const x = side * (1.85 + i * 0.95);
      hedge.push({ x, z: -0.15 + rnd(-0.1, 0.1), s: rnd(1.75, 2.0), ry: rnd(0, 6) });
      hedge.push({ x: x + side * 0.4, y: 0.55, z: -0.25, s: rnd(1.45, 1.7), ry: rnd(0, 6) });
    }
  }
  const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, s0 = 0.9, s1 = 1.3): Placement[] =>
    Array.from({ length: n }, () => ({ x: rnd(x0, x1), z: rnd(z0, z1), s: rnd(s0, s1), ry: rnd(0, 6) }));
  // in front of the gate: keep the path (|x| < 1.25) clear
  const front = (n: number, s0?: number, s1?: number) => scatter(n, -5, 5, 0.6, 3.8, s0, s1).filter((p) => Math.abs(p.x) > 1.3);
  // the meadow beyond the gate, seen through the opening
  const beyond = (n: number) => scatter(n, -1.6, 1.6, -4.6, -1.8);
  return {
    hedge,
    flowersPink: [...front(9), ...beyond(6)],
    flowersWhite: [...front(9), ...beyond(5)],
    tufts: front(18),
    mushrooms: front(4, 0.9, 1.2),
    trees: [
      { x: -3.6, z: -3.2, s: 1.4, ry: 1 },
      { x: 3.4, z: -3.6, s: 1.55, ry: 2 },
      { x: -1.6, z: -5.2, s: 1.2, ry: 3 },
      { x: 1.9, z: -5.6, s: 1.3, ry: 4 },
    ] as Placement[],
    clouds: [
      { x: -4.5, y: 4.6, z: -9, s: 1.4 },
      { x: 3.8, y: 5.0, z: -10, s: 1.7 },
    ] as Placement[],
  };
}

/**
 * ด่านประตูเสียงนาสิก 3D — ต่อจากสวนของเกมวิ่งหนี: ทางเดินพาไปถึงซุ้มประตูในแนวพุ่มไม้
 * - ตอนมีเสียงและค่าจมูกถึงเกณฑ์ (inZone จากตรรกะด่านประตู) มีประกายสีส้มลอยจากกระต่ายไปที่ตราประตู
 * - เงียบหรือข้อมูลค้าง: ไม่มีประกาย ลูกปัดไม่เพิ่ม (ความคืบหน้ามาจากตรรกะเท่านั้น)
 */
export function GateWorld({ gameRef, frameRef, outfit, reduced, tier }: GateSpec) {
  const kit = useKit();
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
      meadow: kit.geo("gate-meadow", () => new THREE.PlaneGeometry(4.5, 6)),
    }),
    [kit],
  );
  const shadows = tier !== "low";
  const gate = useRef<GateDrive>({ progress: 0, live: 0, open: false, reduced });
  const bunny = useRef(bunnyDrive({ pose: "stand", reduced }));
  const cloud = useRef(cloudDrive({ reduced }));
  const bunnyRoot = useRef<THREE.Group>(null);
  const cloudRoot = useRef<THREE.Group>(null);
  const motes = useRef<THREE.InstancedMesh>(null);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1.6, z: 0.4 });
  const sim = useMemo(() => ({ next: 0, i: 0, t: new Float32Array(MOTES).fill(-1), off: new Float32Array(MOTES) }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seen = useRef<{ game: unknown; open: boolean; turn: number }>({ game: null, open: false, turn: 0 });
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(BUNNY[0] + 0.1, 1.25, BUNNY[2] + 0.1),
        new THREE.Vector3(-0.5, 3.6, 0.9),
        new THREE.Vector3(...EMBLEM),
      ),
    [],
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const m = motes.current;
    if (!m) return;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < MOTES; i++) m.setMatrixAt(i, dummy.matrix);
    m.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    if (seen.current.game !== g) seen.current = { game: g, open: s.open, turn: s.open ? 1 : 0 };

    const gd = gate.current;
    gd.reduced = reduced;
    gd.progress = s.progress;
    gd.open = s.open;
    const nasalLive = f.valid && f.speaking && f.nasal !== null ? f.nasal : 0;
    gd.live = s.open ? 1 : clamp01(nasalLive / Math.max(1, g.cfg.nasalThreshold)) * (s.inZone ? 1 : 0.55);

    const b = bunny.current;
    b.reduced = reduced;
    b.pose = s.open ? "stand" : f.valid && f.speaking ? "sing" : "stand";
    cloud.current.reduced = reduced;
    cloud.current.excite = s.inZone ? 0.6 : 0.2;

    if (s.open && !seen.current.open) {
      seen.current.open = true;
      b.cheer += 1;
      cloud.current.wave += 1;
      fire.current = { seq: fire.current.seq + 1, x: 0, y: 1.7, z: 0.5 };
    }
    // after opening, both friends turn toward the open gate
    seen.current.turn = s.open ? (reduced ? 1 : damp(seen.current.turn, 1, 3, dt)) : 0;
    const tw = seen.current.turn;
    if (bunnyRoot.current) bunnyRoot.current.rotation.y = 0.5 + (Math.PI - 0.15 - 0.5) * tw;
    if (cloudRoot.current) cloudRoot.current.rotation.y = -0.45 + (-Math.PI + 0.3 + 0.45) * tw;

    // orange "voice" motes travel from the bunny to the emblem only while in the nasal zone
    const m = motes.current;
    if (!m) return;
    sim.next -= dt;
    if (s.inZone && !s.open && f.valid && !reduced && sim.next <= 0) {
      sim.next = 0.09;
      sim.t[sim.i] = 0;
      sim.off[sim.i] = Math.random();
      sim.i = (sim.i + 1) % MOTES;
    }
    for (let i = 0; i < MOTES; i++) {
      if (sim.t[i] >= 0) {
        sim.t[i] += dt / 0.95;
        if (sim.t[i] >= 1) sim.t[i] = -1;
      }
      if (sim.t[i] >= 0) {
        const k = sim.t[i];
        curve.getPoint(k, tmp);
        tmp.x += Math.sin(k * 9 + sim.off[i] * 6) * 0.12 * (1 - k);
        dummy.position.copy(tmp);
        dummy.scale.setScalar(0.07 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.6));
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 13, 30]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-4, 8, 6]} box={6.5} />
        <FitCamera target={[0, 1.8, 0.4]} dir={[0.32, 0.34, 1]} width={6.2} height={5.1} />

        <mesh geometry={geo.ground} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, -0.02, -3]} receiveShadow />
        <mesh geometry={geo.meadow} material={kit.clay("#bfe39a")} rotation-x={-Math.PI / 2} position={[0, -0.01, -3.2]} receiveShadow />
        <mesh geometry={geo.path} material={kit.clay(C.path)} position={[0, -0.14, 2.9]} receiveShadow />

        <Field geometry={geo.bush} items={L.hedge} />
        <Field geometry={geo.tree} items={L.trees} castShadow={shadows} />
        <Field geometry={geo.flowerPink} items={L.flowersPink} />
        <Field geometry={geo.flowerWhite} items={L.flowersWhite} />
        <Field geometry={geo.tuft} items={L.tufts} />
        <Field geometry={geo.mushroom} items={L.mushrooms} />
        <Field geometry={geo.cloud} items={L.clouds} receiveShadow={false} />

        <group position={[0, 0, -0.2]}>
          <Gate drive={gate} />
        </group>

        <group ref={bunnyRoot} position={BUNNY} rotation-y={0.5}>
          <Bunny drive={bunny} outfit={outfit} />
        </group>
        <BlobShadow at={BUNNY} size={[0.95, 0.75]} />
        <group ref={cloudRoot} position={[1.05, 0.95, 1.65]} rotation-y={-0.45}>
          <group scale={0.85}>
            <CloudPal drive={cloud} />
          </group>
        </group>
        <BlobShadow at={[1.05, 0, 1.65]} size={[1, 0.7]} materialKey="soft" opacity={0.5} />

        <instancedMesh ref={motes} args={[kit.sphereLo(), kit.basic(C.nasalGlow), MOTES]} frustumCulled={false} />
        <Burst fire={fire} reduced={reduced} max={20} />
      </group>
    </>
  );
}
