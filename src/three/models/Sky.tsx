import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode, type Ref, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored } from "../shapes";
import { COCKPIT, NOSE_X, type MoodDrive } from "./skyDrives";

/**
 * นักบินฟองสบู่ 3D: เครื่องบินของเล่นดินปั้น (หัวไปทาง +x) เมฆขี้บ่นที่ยิ้มได้ ลูกเห็บ และฟองสบู่
 * สีตรงกับภาพ 2D (components/Art.tsx) — ไม่มีน้ำเงิน (ค่าด้านปาก) หรือส้ม (ค่าด้านจมูก)
 * หน่วย: 1 ≈ ความสูงตัวกระต่าย
 */

const ball = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

function planeBody(): THREE.BufferGeometry {
  return colored([
    // fuselage and nose cone
    { geo: ball(1), color: C.cream, scale: [0.95, 0.34, 0.34] },
    { geo: ball(1), color: C.pink, at: [0.7, 0, 0], scale: [0.36, 0.29, 0.29] },
    // main wings, tail plane and fin (butter, like the 2D plane)
    { geo: ball(1), color: C.butter, at: [0.08, -0.12, 0], scale: [0.3, 0.05, 1.0] },
    { geo: ball(1), color: C.butter, at: [-0.82, 0.04, 0], scale: [0.17, 0.04, 0.36] },
    { geo: ball(1), color: C.butter, at: [-0.86, 0.24, 0], scale: [0.2, 0.26, 0.05], rot: [0, 0, -0.35] },
    // cockpit rim and windscreen
    { geo: new THREE.TorusGeometry(0.2, 0.045, 8, 24), color: C.pink, at: [COCKPIT[0], 0.3, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: ball(1), color: C.lilac, at: [0.3, 0.33, 0], scale: [0.06, 0.13, 0.2], rot: [0, 0, -0.4] },
    // a round window and the propeller hub
    { geo: ball(1), color: C.lilacLight, at: [0.45, 0.06, 0.3], scale: [0.08, 0.08, 0.03] },
    { geo: ball(1), color: C.stoneDeep, at: [NOSE_X - 0.08, 0, 0], scale: [0.09, 0.09, 0.09] },
  ]);
}

function propellerGeo(): THREE.BufferGeometry {
  return colored([
    { geo: ball(1), color: C.lilacLight, at: [0, 0.25, 0], scale: [0.025, 0.27, 0.07] },
    { geo: ball(1), color: C.lilacLight, at: [0, -0.25, 0], scale: [0.025, 0.27, 0.07] },
  ]);
}

/** The toy plane; put the pilot in `children` at COCKPIT. `prop` spins the propeller (rotation.x). */
export function Airplane({ prop, children }: { prop?: Ref<THREE.Group>; children?: ReactNode }) {
  const kit = useKit();
  const geo = useMemo(() => ({ body: kit.geo("sky-plane", planeBody), prop: kit.geo("sky-prop", propellerGeo) }), [kit]);
  const mat = kit.clay(C.white, { vertexColors: true });
  return (
    <group>
      <mesh geometry={geo.body} material={mat} castShadow />
      <group ref={prop} position={[NOSE_X, 0, 0]}>
        <mesh geometry={geo.prop} material={mat} />
      </group>
      {children}
    </group>
  );
}

const GRUMPY = new THREE.Color("#c9c4dd");
const HAPPY = new THREE.Color(C.white);

/** The grumpy cloud: lilac-grey with frowning brows; it turns white and smiles (cheeks) when the bubble reaches it. */
export function MoodCloud({ drive }: { drive: RefObject<MoodDrive> }) {
  const kit = useKit();
  const body = useMemo(() => kit.own(kit.clay("#c9c4dd").clone()), [kit]);
  const ink = kit.clay(C.ink);
  const rig = useRef<THREE.Group>(null);
  const grumpy = useRef<THREE.Group>(null);
  const happy = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const st = useRef({ ready: false, t: 0, bounceT: -1, seen: 0, blink: 0, blinkNext: 2.5 });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    if (!s.ready) {
      // first frame: a random bob phase, and bounces asked before mount are not replayed
      s.ready = true;
      s.t = Math.random() * 4;
      s.seen = d.bounce;
    }
    const amp = d.reduced ? CALM.amp : 1;
    s.t += dt;
    if (d.bounce !== s.seen) {
      s.seen = d.bounce;
      s.bounceT = 0;
    }
    let b = 0;
    if (s.bounceT >= 0) {
      s.bounceT += dt;
      b = bump(s.bounceT / 0.6);
      if (s.bounceT >= 0.6) s.bounceT = -1;
    }
    s.blinkNext -= dt;
    if (s.blinkNext <= 0) {
      s.blink = 0.14;
      s.blinkNext = 2.4 + Math.random() * 3;
    }
    s.blink -= dt;
    body.color.copy(GRUMPY).lerp(HAPPY, d.mood);
    if (rig.current) {
      rig.current.position.y = Math.sin(s.t * 1.7) * 0.06 * amp + b * 0.25 * amp;
      const sq = 1 + Math.sin(s.t * 1.7 + 1) * 0.02 * amp - b * 0.08 * amp;
      rig.current.scale.set(2 - sq, sq, 2 - sq);
    }
    if (grumpy.current) grumpy.current.visible = d.mood < 0.5;
    if (happy.current) happy.current.visible = d.mood >= 0.5;
    if (eyes.current) eyes.current.scale.y = s.blink > 0 ? 0.15 : 1;
  });

  const puffs: { at: [number, number, number]; s: [number, number, number] }[] = [
    { at: [0, 0, 0], s: [0.62, 0.5, 0.5] },
    { at: [-0.55, -0.1, 0.02], s: [0.4, 0.36, 0.38] },
    { at: [0.58, -0.08, 0], s: [0.42, 0.37, 0.38] },
    { at: [-0.2, 0.36, -0.04], s: [0.4, 0.36, 0.36] },
    { at: [0.25, 0.33, 0.02], s: [0.36, 0.33, 0.34] },
    { at: [0, -0.18, -0.25], s: [0.46, 0.36, 0.36] },
  ];
  return (
    <group ref={rig}>
      {puffs.map((p, i) => (
        <mesh key={i} geometry={kit.sphere()} material={body} position={p.at} scale={p.s} castShadow={i === 0} />
      ))}
      <group ref={eyes}>
        <mesh geometry={kit.sphereLo()} material={ink} position={[-0.17, 0.04, 0.47]} scale={[0.055, 0.07, 0.04]} />
        <mesh geometry={kit.sphereLo()} material={ink} position={[0.17, 0.04, 0.47]} scale={[0.055, 0.07, 0.04]} />
      </group>
      <group ref={grumpy}>
        {/* frowning brows and a small upside-down mouth */}
        <mesh geometry={kit.capsule(0.022, 0.12)} material={ink} position={[-0.17, 0.16, 0.47]} rotation={[0, 0, -1.2]} />
        <mesh geometry={kit.capsule(0.022, 0.12)} material={ink} position={[0.17, 0.16, 0.47]} rotation={[0, 0, 1.2]} />
        <mesh geometry={kit.torus(0.07, 0.018, Math.PI)} material={ink} position={[0, -0.13, 0.48]} />
      </group>
      <group ref={happy} visible={false}>
        <mesh geometry={kit.torus(0.08, 0.018, Math.PI)} material={ink} position={[0, -0.07, 0.49]} rotation={[0, 0, Math.PI]} />
        <mesh geometry={kit.sphereLo()} material={kit.clay(C.blush)} position={[-0.3, -0.06, 0.42]} scale={[0.08, 0.045, 0.03]} />
        <mesh geometry={kit.sphereLo()} material={kit.clay(C.blush)} position={[0.3, -0.06, 0.42]} scale={[0.08, 0.045, 0.03]} />
      </group>
    </group>
  );
}

function hailGeo(): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.IcosahedronGeometry(0.42, 2), color: "#f1eefb" },
    { geo: new THREE.OctahedronGeometry(0.09, 0), color: C.white, at: [-0.2, 0.26, 0.28] },
    { geo: new THREE.OctahedronGeometry(0.06, 0), color: C.lilacLight, at: [0.27, 0.22, 0.25] },
  ]);
}

/** A hailstone with a cheeky face (nasal words: the plane rolls past it). */
export function Hailstone() {
  const kit = useKit();
  const geo = useMemo(() => kit.geo("sky-hail", hailGeo), [kit]);
  const ink = kit.clay(C.ink);
  return (
    <group>
      <mesh geometry={geo} material={kit.clay(C.white, { vertexColors: true, emissive: "#ffffff", emissiveIntensity: 0.12 })} castShadow />
      <mesh geometry={kit.sphereLo()} material={ink} position={[-0.12, 0.0, 0.39]} scale={[0.04, 0.05, 0.03]} />
      <mesh geometry={kit.sphereLo()} material={ink} position={[0.12, 0.0, 0.39]} scale={[0.04, 0.05, 0.03]} />
      <mesh geometry={kit.capsule(0.016, 0.08)} material={ink} position={[-0.12, 0.11, 0.39]} rotation={[0, 0, -1.15]} />
      <mesh geometry={kit.capsule(0.016, 0.08)} material={ink} position={[0.12, 0.11, 0.39]} rotation={[0, 0, 1.15]} />
      <mesh geometry={kit.torus(0.05, 0.014, Math.PI)} material={ink} position={[0, -0.12, 0.4]} rotation={[0, 0, Math.PI]} />
    </group>
  );
}

/** A soap bubble: see-through with a bright highlight (its size never follows loudness). */
export function Bubble({ ref }: { ref?: Ref<THREE.Group> }) {
  const kit = useKit();
  return (
    <group ref={ref}>
      <mesh geometry={kit.sphere()} material={kit.clay(C.white, { opacity: 0.42, emissive: C.lilacLight, emissiveIntensity: 0.35, depthWrite: false })} />
      <mesh geometry={kit.torus(0.98, 0.03)} material={kit.clay(C.lilacDeep, { opacity: 0.55, depthWrite: false })} />
      <mesh geometry={kit.sphereLo()} material={kit.basic(C.white)} position={[-0.38, 0.42, 0.72]} scale={0.16} />
    </group>
  );
}
