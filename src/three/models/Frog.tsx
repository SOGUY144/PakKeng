import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";

type V3 = [number, number, number];

export interface FrogPose {
  /** Voice segment open: gets ready to hop (anticipation). */
  crouch: boolean;
  /** In the air: legs stretched back. */
  airborne: boolean;
  /** Increment on each landing (short squash). */
  land: number;
  reduced: boolean;
}

function Part({ at, s, color }: { at: V3; s: number | V3; color: string }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} />;
}

/**
 * กบหน้าตาเป็นมิตร (สีเขียวเดียวกับภาพ 2D): ตาโตบนหัว แก้มชมพู ยิ้มกว้าง
 * ท่า: นั่งหายใจ/กะพริบตา, ย่อตัวเตรียมกระโดด, ยืดขาตอนลอย, ยุบตัวนุ่ม ๆ ตอนลงใบบัว — ไม่มีท่าเจ็บหรือจมน้ำ
 */
export function Frog({ pose }: { pose: RefObject<FrogPose> }) {
  const kit = useKit();
  const rig = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const belly = useRef<THREE.Mesh>(null);
  const st = useRef({ t: Math.random() * 3, crouch: 0, air: 0, landT: -1, landSeen: pose.current.land, blink: 0, blinkNext: 2 });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const p = pose.current;
    const s = st.current;
    const motion = p.reduced ? 0 : 1;
    s.t += dt;
    s.crouch = damp(s.crouch, p.crouch && !p.airborne ? 1 : 0, 10, dt);
    s.air = damp(s.air, p.airborne ? 1 : 0, 14, dt);
    if (p.land !== s.landSeen) {
      s.landSeen = p.land;
      s.landT = 0;
    }
    let squash = 0;
    if (s.landT >= 0) {
      s.landT += dt;
      squash = Math.max(0, 1 - s.landT / 0.28) * motion;
      if (s.landT > 0.28) s.landT = -1;
    }
    s.blinkNext -= dt;
    if (s.blinkNext <= 0) {
      s.blink = 0.13;
      s.blinkNext = 2.4 + Math.random() * 2.5;
    }
    s.blink -= dt;
    const breathe = Math.sin(s.t * 2.4) * 0.02 * motion;
    const sy = 1 - 0.16 * s.crouch + 0.14 * s.air - 0.2 * squash + breathe;
    const sxz = 1 + 0.08 * s.crouch - 0.05 * s.air + 0.14 * squash;
    if (rig.current) rig.current.scale.set(sxz, sy, sxz);
    if (belly.current) belly.current.scale.set(0.3, 0.22 * (1 + breathe * 2), 0.2);
    const legAng = 0.9 * s.air - 0.15 * s.crouch;
    legL.current?.rotation.set(legAng, 0, 0);
    legR.current?.rotation.set(legAng, 0, 0);
    if (eyes.current) eyes.current.scale.y = s.blink > 0 ? 0.2 : 1;
  });

  return (
    <group ref={rig}>
      <Part at={[0, 0.3, 0]} s={[0.42, 0.3, 0.4]} color={C.frog} />
      <mesh ref={belly} geometry={kit.sphere()} material={kit.clay(C.frogBelly)} position={[0, 0.26, 0.22]} scale={[0.3, 0.22, 0.2]} />
      {/* eye bumps + eyes on top of the head */}
      <Part at={[-0.17, 0.5, 0.08]} s={0.15} color={C.frog} />
      <Part at={[0.17, 0.5, 0.08]} s={0.15} color={C.frog} />
      <group ref={eyes} position={[0, 0.56, 0.12]}>
        <Part at={[-0.17, 0, 0]} s={0.12} color={C.white} />
        <Part at={[0.17, 0, 0]} s={0.12} color={C.white} />
        <Part at={[-0.17, 0.01, 0.09]} s={[0.065, 0.075, 0.05]} color={C.ink} />
        <Part at={[0.17, 0.01, 0.09]} s={[0.065, 0.075, 0.05]} color={C.ink} />
        <Part at={[-0.15, 0.04, 0.125]} s={0.02} color={C.white} />
        <Part at={[0.19, 0.04, 0.125]} s={0.02} color={C.white} />
      </group>
      <Part at={[-0.27, 0.36, 0.3]} s={[0.06, 0.04, 0.03]} color={C.blush} />
      <Part at={[0.27, 0.36, 0.3]} s={[0.06, 0.04, 0.03]} color={C.blush} />
      <mesh geometry={kit.torus(0.15, 0.018, Math.PI * 0.75)} material={kit.clay("#3f6b2f")} position={[0, 0.39, 0.36]} rotation={[0.25, 0, Math.PI + Math.PI * 0.125]} />
      {/* front legs */}
      <mesh geometry={kit.capsule(0.05, 0.1)} material={kit.clay(C.frog)} position={[-0.2, 0.11, 0.27]} rotation={[0.3, 0, 0.25]} />
      <mesh geometry={kit.capsule(0.05, 0.1)} material={kit.clay(C.frog)} position={[0.2, 0.11, 0.27]} rotation={[0.3, 0, -0.25]} />
      <Part at={[-0.23, 0.025, 0.35]} s={[0.09, 0.03, 0.09]} color={C.frogDeep} />
      <Part at={[0.23, 0.025, 0.35]} s={[0.09, 0.03, 0.09]} color={C.frogDeep} />
      {/* back legs fold under the body and stretch back in the air */}
      <group ref={legL} position={[-0.3, 0.16, -0.1]}>
        <Part at={[0, 0, 0]} s={[0.16, 0.13, 0.22]} color={C.frogDeep} />
        <Part at={[-0.03, -0.13, 0.16]} s={[0.1, 0.03, 0.17]} color={C.frogDeep} />
      </group>
      <group ref={legR} position={[0.3, 0.16, -0.1]}>
        <Part at={[0, 0, 0]} s={[0.16, 0.13, 0.22]} color={C.frogDeep} />
        <Part at={[0.03, -0.13, 0.16]} s={[0.1, 0.03, 0.17]} color={C.frogDeep} />
      </group>
      <Part at={[0.12, 0.55, -0.18]} s={[0.07, 0.03, 0.06]} color={C.frogBelly} />
      <Part at={[-0.1, 0.5, -0.26]} s={[0.05, 0.025, 0.05]} color={C.frogBelly} />
    </group>
  );
}
