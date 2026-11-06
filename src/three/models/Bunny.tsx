import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { Cap, Crown, Scarf, Shoe } from "./Accessories";
import { outfitFlags, type BunnyDrive } from "./drives";

type V3 = [number, number, number];

function Ball({ at, s, color }: { at: V3; s: number | V3; color: string }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} />;
}

/**
 * กระต่ายตัวหลัก (ออกแบบเอง ปั้นจากทรงกลม/แคปซูล) — ยืนบน y = 0 หันหน้าไปทาง +Z สูง ≈ 1.6 รวมหู
 * ท่าทาง: ยืนหายใจ/กะพริบตา, วิ่ง (จังหวะตามความเร็ว), เชียร์สั้น ๆ, ร้องเพลง (ด่านประตู), นั่งบอลลูน, โบกมือ
 * ของสะสม (หมวก ผ้าพันคอ รองเท้า มงกุฎ) ใส่ได้จากค่า outfit
 */
export function Bunny({ drive, outfit = "" }: { drive: RefObject<BunnyDrive>; outfit?: string }) {
  const kit = useKit();
  const wear = outfitFlags(outfit);
  const rig = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const earL = useRef<THREE.Group>(null);
  const earR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const footL = useRef<THREE.Group>(null);
  const footR = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, phase: 0, run: 0, boost: 0, sing: 0, wave: 0, cheerT: -1, cheerSeen: drive.current.cheer, blink: 0, blinkNext: 1.5 });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    s.t += dt;
    const running = d.pose === "run" && d.speed > 0.12;
    s.run = damp(s.run, running ? 1 : 0, 7, dt);
    s.boost = damp(s.boost, d.boost && running ? 1 : 0, 6, dt);
    s.sing = damp(s.sing, d.pose === "sing" ? 1 : 0, 5, dt);
    s.wave = damp(s.wave, d.pose === "wave" ? 1 : 0, 5, dt);
    // reduced motion: the run cycle keeps its pace (feet match the ground) but swings at half size
    const motion = d.reduced ? CALM.amp : 1;
    s.phase += dt * (5 + 6.5 * Math.min(1.8, d.speed));
    if (d.cheer !== s.cheerSeen) {
      s.cheerSeen = d.cheer;
      s.cheerT = 0;
    }
    let cheer = 0;
    if (s.cheerT >= 0) {
      s.cheerT += dt;
      cheer = bump(s.cheerT / 0.7);
      if (s.cheerT >= 0.7) s.cheerT = -1;
    }
    s.blinkNext -= dt;
    if (s.blinkNext <= 0) {
      s.blink = 0.13;
      s.blinkNext = 2.2 + Math.random() * 2.6;
    }
    s.blink -= dt;

    const p = s.phase;
    // the run cycle is the bunny's own feedback (no camera or scenery motion): nearly full swing even with reduced motion
    const runA = s.run * (d.reduced ? 0.9 : 1);
    const f = Math.sin(p);
    const singBounce = Math.abs(Math.sin(s.t * 4.2)) * 0.035 * s.sing * motion;
    if (rig.current) {
      rig.current.position.y = Math.abs(f) * 0.07 * runA + cheer * 0.36 * (d.reduced ? 0.45 : 1) + singBounce;
      rig.current.rotation.x = (0.1 + 0.14 * s.boost) * s.run - cheer * 0.06;
    }
    if (body.current) body.current.scale.y = 0.44 * (1 + Math.sin(s.t * 2.2) * 0.014 * (1 - s.run) * motion);
    if (footL.current && footR.current) {
      footL.current.position.set(-0.15, 0.075 + Math.max(0, -Math.cos(p)) * 0.08 * runA, 0.07 + f * 0.17 * runA);
      footR.current.position.set(0.15, 0.075 + Math.max(0, Math.cos(p)) * 0.08 * runA, 0.07 - f * 0.17 * runA);
      footL.current.rotation.x = -f * 0.45 * runA;
      footR.current.rotation.x = f * 0.45 * runA;
    }
    const waveSwing = Math.sin(s.t * 7) * 0.45 * s.wave * motion;
    if (armL.current && armR.current) {
      armL.current.rotation.x = f * 0.85 * runA - cheer * 2.6 - s.sing * 0.4;
      armR.current.rotation.x = -f * 0.85 * runA - cheer * 2.6 - s.sing * 0.4 - s.wave * 2.7;
      armL.current.rotation.z = -0.12 - s.sing * 0.55;
      armR.current.rotation.z = 0.12 + s.sing * 0.55 + waveSwing;
    }
    const earFlop = Math.sin(p * 2) * 0.07 * runA;
    if (earL.current && earR.current) {
      earL.current.rotation.x = -0.12 - (0.28 + 0.4 * s.boost) * s.run + earFlop + cheer * 0.3;
      earR.current.rotation.x = -0.12 - (0.28 + 0.4 * s.boost) * s.run - earFlop + cheer * 0.3;
      earL.current.rotation.z = 0.17 + Math.sin(s.t * 1.3) * 0.03 * motion;
      earR.current.rotation.z = -0.17 - Math.sin(s.t * 1.1 + 1) * 0.03 * motion;
    }
    if (head.current) {
      head.current.rotation.x = Math.sin(p * 2) * 0.04 * runA - s.sing * 0.12;
      head.current.rotation.z = Math.sin(s.t * 0.9) * 0.035 * (1 - s.run) * motion;
    }
    if (eyes.current) eyes.current.scale.y = s.blink > 0 ? 0.15 : 1;
  });

  const cap = wear.cap;
  return (
    <group>
      <group ref={rig}>
        <mesh ref={body} geometry={kit.sphere()} material={kit.clay(C.cream)} position={[0, 0.52, 0]} scale={[0.4, 0.44, 0.36]} />
        <Ball at={[0, 0.48, 0.25]} s={[0.27, 0.3, 0.13]} color="#fff1f5" />
        <Ball at={[0, 0.45, -0.34]} s={0.11} color={C.white} />
        <group ref={footL} position={[-0.15, 0.075, 0.07]}>
          {wear.shoes ? <Shoe /> : <Ball at={[0, 0, 0]} s={[0.12, 0.075, 0.19]} color={C.cream} />}
        </group>
        <group ref={footR} position={[0.15, 0.075, 0.07]}>
          {wear.shoes ? <Shoe /> : <Ball at={[0, 0, 0]} s={[0.12, 0.075, 0.19]} color={C.cream} />}
        </group>
        <group ref={armL} position={[-0.32, 0.69, 0.06]}>
          <mesh geometry={kit.capsule(0.07, 0.14)} material={kit.clay(C.cream)} position={[0, -0.12, 0]} />
        </group>
        <group ref={armR} position={[0.32, 0.69, 0.06]}>
          <mesh geometry={kit.capsule(0.07, 0.14)} material={kit.clay(C.cream)} position={[0, -0.12, 0]} />
        </group>
        {wear.scarf ? (
          <group position={[0, 0.84, 0.01]}>
            <Scarf />
          </group>
        ) : null}
        <group ref={head} position={[0, 1.03, 0.03]}>
          <Ball at={[0, 0, 0]} s={[0.36, 0.33, 0.33]} color={C.cream} />
          <group ref={eyes}>
            <Ball at={[-0.125, 0.035, 0.285]} s={[0.05, 0.058, 0.04]} color={C.ink} />
            <Ball at={[0.125, 0.035, 0.285]} s={[0.05, 0.058, 0.04]} color={C.ink} />
            <Ball at={[-0.11, 0.06, 0.318]} s={0.016} color={C.white} />
            <Ball at={[0.14, 0.06, 0.318]} s={0.016} color={C.white} />
          </group>
          <Ball at={[-0.205, -0.055, 0.262]} s={[0.07, 0.042, 0.03]} color={C.blush} />
          <Ball at={[0.205, -0.055, 0.262]} s={[0.07, 0.042, 0.03]} color={C.blush} />
          <Ball at={[0, -0.012, 0.325]} s={[0.042, 0.03, 0.03]} color={C.pink} />
          <group ref={earL} position={[-0.13, 0.22, -0.02]}>
            <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.cream)} position={[0, 0.25, 0]} />
            <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.pinkSoft)} position={[0, 0.25, 0.05]} scale={[0.55, 0.8, 0.4]} />
          </group>
          <group ref={earR} position={[0.13, 0.22, -0.02]}>
            <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.cream)} position={[0, 0.25, 0]} />
            <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.pinkSoft)} position={[0, 0.25, 0.05]} scale={[0.55, 0.8, 0.4]} />
          </group>
          {cap ? (
            <group position={[0, 0.1, 0]} rotation={[-0.12, 0, 0]}>
              <Cap />
            </group>
          ) : null}
          {wear.crown ? (
            <group position={[0, cap ? 0.36 : 0.3, 0]}>
              <Crown />
            </group>
          ) : null}
        </group>
      </group>
    </group>
  );
}
