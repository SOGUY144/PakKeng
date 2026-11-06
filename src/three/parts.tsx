import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
import * as THREE from "three";
import type { Tier } from "./gfx";
import { CALM } from "./anim";
import { useKit } from "./kitContext";
import { C } from "./palette";
import { sparkle } from "./shapes";

type V3 = [number, number, number];

/**
 * แสงชุดเดียวกันทุกฉาก: แสงฟ้า/พื้น (hemisphere) ให้เงาอ่อนแบบดินปั้น + แดดหนึ่งดวงที่ทอดเงา
 * กล้องเงาของแดดอยู่กับที่ (ไม่เลื่อนตามกล้อง) จึงไม่เกิดเงากระพริบ; ระดับ low ปิด shadow map ใช้เงากลมใต้ตัวละครแทน
 */
export function Lights({
  tier,
  sun = [-4, 9, 6],
  box = 7,
  intensity = 2.4,
  hemi = 1.45,
}: {
  tier: Tier;
  sun?: V3;
  box?: number;
  intensity?: number;
  hemi?: number;
}) {
  const light = useRef<THREE.DirectionalLight>(null);
  const map = tier === "high" ? 1024 : 512;
  useLayoutEffect(() => {
    const l = light.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -box;
    cam.right = box;
    cam.top = box;
    cam.bottom = -box;
    cam.near = 0.5;
    cam.far = 45;
    cam.updateProjectionMatrix();
  }, [box]);
  return (
    <>
      <hemisphereLight args={["#fff6ea", "#a9d28f", hemi]} />
      <directionalLight
        ref={light}
        position={sun}
        intensity={intensity}
        color="#fff1dd"
        castShadow={tier !== "low"}
        shadow-mapSize={[map, map]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/**
 * Keeps a world rectangle (width × height around `target`) inside the view for any stage aspect
 * by moving the camera along `dir`. Static camera: no shake, no follow.
 */
export function FitCamera({ target, dir, width, height, fov = 34 }: { target: V3; dir: V3; width: number; height: number; fov?: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const w = useThree((s) => s.size.width);
  const h = useThree((s) => s.size.height);
  const key = `${target.join()}|${dir.join()}|${width}|${height}|${fov}`;
  useLayoutEffect(() => {
    const aspect = w / Math.max(1, h);
    const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const d = Math.max(height / (2 * t), width / (2 * t * aspect));
    const v = new THREE.Vector3(...dir).normalize().multiplyScalar(d);
    camera.fov = fov;
    camera.position.set(target[0] + v.x, target[1] + v.y, target[2] + v.z);
    camera.lookAt(target[0], target[1], target[2]);
    camera.updateProjectionMatrix();
  }, [camera, w, h, key]);
  return null;
}

/** Soft round contact shadow on the ground (stable, cheap, also used as a height cue). */
export function BlobShadow({
  ref,
  at = [0, 0, 0],
  size = [1, 0.8],
  materialKey,
  opacity = 1,
}: {
  ref?: Ref<THREE.Mesh>;
  at?: V3;
  size?: [number, number];
  /** Separate key = separate material (e.g. one whose opacity a scene animates). */
  materialKey?: string;
  opacity?: number;
}) {
  const kit = useKit();
  return (
    <mesh
      ref={ref}
      rotation-x={-Math.PI / 2}
      position={[at[0], at[1] + 0.015, at[2]]}
      scale={[size[0], size[1], 1]}
      geometry={kit.plane()}
      material={kit.blobMaterial(materialKey, opacity)}
      renderOrder={2}
    />
  );
}

/**
 * Small soft puffs left behind a character while a live cue is on (runner: blue = oral “passing”).
 * Decorative only; nothing is emitted with reduced motion.
 */
export function Dust({
  on,
  drift,
  at,
  color = C.oralLight,
  reduced,
}: {
  on: RefObject<boolean>;
  /** World units per second the puffs travel toward −X. */
  drift: RefObject<number>;
  at: V3;
  color?: string;
  reduced: boolean;
}) {
  const kit = useKit();
  const MAX = 22;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const d = useMemo(() => new THREE.Object3D(), []);
  const sim = useMemo(() => ({ next: 0, i: 0, p: new Float32Array(MAX * 3), life: new Float32Array(MAX), s: new Float32Array(MAX) }), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    d.scale.setScalar(0);
    d.updateMatrix();
    for (let i = 0; i < MAX; i++) m.setMatrixAt(i, d.matrix);
    m.instanceMatrix.needsUpdate = true;
    m.visible = false;
  }, [d]);
  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    sim.next -= dt;
    if (on.current && !reduced && sim.next <= 0) {
      sim.next = 0.055;
      const i = sim.i;
      sim.i = (i + 1) % MAX;
      sim.p.set([at[0] - 0.15 + Math.random() * 0.1, at[1] + 0.04 + Math.random() * 0.1, at[2] + (Math.random() - 0.5) * 0.35], i * 3);
      sim.life[i] = 0.6;
      sim.s[i] = 0.06 + Math.random() * 0.05;
    }
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (sim.life[i] > 0) {
        sim.life[i] -= dt;
        sim.p[i * 3] -= (drift.current + 0.5) * dt;
        sim.p[i * 3 + 1] += 0.3 * dt;
        const k = Math.max(0, sim.life[i] / 0.6);
        d.position.set(sim.p[i * 3], sim.p[i * 3 + 1], sim.p[i * 3 + 2]);
        d.scale.setScalar(sim.s[i] * (1.6 - k * 0.6) * Math.min(1, k * 2.5));
        any = true;
      } else {
        d.scale.setScalar(0);
      }
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.visible = any;
  });
  return <instancedMesh ref={mesh} args={[kit.sphere(), kit.basic(color, 0.5), MAX]} frustumCulled={false} />;
}

export interface Placement {
  x: number;
  y?: number;
  z: number;
  s?: number;
  ry?: number;
}

/** Static decor drawn with one InstancedMesh (one draw call per decor type). */
export function Field({
  geometry,
  items,
  castShadow = false,
  receiveShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  items: Placement[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const kit = useKit();
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D();
    items.forEach((it, i) => {
      d.position.set(it.x, it.y ?? 0, it.z);
      d.rotation.set(0, it.ry ?? 0, 0);
      d.scale.setScalar(it.s ?? 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, kit.clay(C.white, { vertexColors: true }), items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  );
}

/**
 * Decor that scrolls along −X with the run (wraps around a loop of length `span`).
 * Purely decorative: the offset comes from the decorative speed, never from scoring time.
 */
export function ScrollField({
  geometry,
  items,
  offset,
  span,
  factor = 1,
  castShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  items: Placement[];
  offset: RefObject<number>;
  span: number;
  factor?: number;
  castShadow?: boolean;
}) {
  const kit = useKit();
  const ref = useRef<THREE.InstancedMesh>(null);
  const d = useMemo(() => new THREE.Object3D(), []);
  const last = useRef(Number.NaN);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const off = offset.current * factor;
    if (off === last.current) return;
    last.current = off;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const x = ((((it.x - off) % span) + span) % span) - span / 2;
      d.position.set(x, it.y ?? 0, it.z);
      d.rotation.set(0, it.ry ?? 0, 0);
      d.scale.setScalar(it.s ?? 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, kit.clay(C.white, { vertexColors: true }), items.length]}
      frustumCulled={false}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

export interface BurstFire {
  seq: number;
  x: number;
  y: number;
  z: number;
}

const LIFE = 0.9;

/** Short reward sparkle (≈0.9 s). Reduced motion: a third of the sparks, slower and lower. */
export function Burst({ fire, color = C.gold, max = 16, reduced }: { fire: RefObject<BurstFire>; color?: string; max?: number; reduced: boolean }) {
  const kit = useKit();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const d = useMemo(() => new THREE.Object3D(), []);
  const sim = useMemo(
    () => ({
      seq: fire.current.seq,
      p: new Float32Array(max * 3),
      v: new Float32Array(max * 3),
      life: new Float32Array(max),
      size: new Float32Array(max),
    }),
    [fire, max],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    d.scale.setScalar(0);
    d.updateMatrix();
    for (let i = 0; i < max; i++) m.setMatrixAt(i, d.matrix);
    m.instanceMatrix.needsUpdate = true;
    m.visible = false;
  }, [d, max]);

  useFrame((_, dtRaw) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(dtRaw, 0.05);
    const f = fire.current;
    if (f.seq !== sim.seq) {
      sim.seq = f.seq;
      const count = reduced ? Math.ceil(max / 3) : max;
      const speed = reduced ? CALM.amp : 1;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const up = (1.1 + Math.random() * 1.0) * speed;
        const out = (0.6 + Math.random() * 0.7) * speed;
        sim.p.set([f.x, f.y, f.z], i * 3);
        sim.v.set([Math.cos(a) * out, up, Math.sin(a) * out * 0.6], i * 3);
        sim.life[i] = LIFE * (0.75 + Math.random() * 0.25);
        sim.size[i] = 0.06 + Math.random() * 0.05;
      }
    }
    let any = false;
    for (let i = 0; i < max; i++) {
      if (sim.life[i] > 0) {
        sim.life[i] -= dt;
        sim.v[i * 3 + 1] -= 3.2 * dt;
        sim.p[i * 3] += sim.v[i * 3] * dt;
        sim.p[i * 3 + 1] += sim.v[i * 3 + 1] * dt;
        sim.p[i * 3 + 2] += sim.v[i * 3 + 2] * dt;
        const k = Math.max(0, sim.life[i] / LIFE);
        const s = sim.size[i] * Math.min(1, k * 3);
        d.position.set(sim.p[i * 3], sim.p[i * 3 + 1], sim.p[i * 3 + 2]);
        d.rotation.set(0, k * 6, 0);
        d.scale.set(s * 0.7, s * 1.3, s * 0.7);
        any = true;
      } else {
        d.scale.setScalar(0);
      }
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.visible = any;
  });

  return <instancedMesh ref={mesh} args={[kit.geo("sparkle", sparkle), kit.basic(color), max]} frustumCulled={false} />;
}
