import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import type { CloudDrive } from "./drives";

type V3 = [number, number, number];

function Puff({ at, s, color }: { at: V3; s: number | V3; color: string }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} />;
}

/**
 * “เพื่อนเมฆ” ตัวไล่ที่เป็นมิตร: ก้อนเมฆสีม่วงอ่อน ตาโต แก้มชมพู ยิ้ม แขนสั้น ๆ
 * ลอยขึ้นลงเบา ๆ กะพริบตา โบกมือ — ไม่มีท่าทางน่ากลัวหรือจับตัวกระต่ายได้
 */
export function CloudPal({ drive }: { drive: RefObject<CloudDrive> }) {
  const kit = useKit();
  const rig = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const st = useRef({ t: Math.random() * 4, excite: 0, waveT: -1, waveSeen: drive.current.wave, blink: 0, blinkNext: 2.5 });

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const d = drive.current;
    const s = st.current;
    const motion = d.reduced ? CALM.amp : 1;
    s.excite = damp(s.excite, d.excite, 3, dt);
    s.t += dt * (1 + s.excite * 0.6);
    if (d.wave !== s.waveSeen) {
      s.waveSeen = d.wave;
      s.waveT = 0;
    }
    let wave = 0;
    if (s.waveT >= 0) {
      s.waveT += dt;
      wave = bump(s.waveT / 1.2);
      if (s.waveT >= 1.2) s.waveT = -1;
    }
    s.blinkNext -= dt;
    if (s.blinkNext <= 0) {
      s.blink = 0.14;
      s.blinkNext = 2.5 + Math.random() * 3;
    }
    s.blink -= dt;
    if (rig.current) {
      rig.current.position.y = Math.sin(s.t * 2.1) * 0.07 * motion;
      rig.current.rotation.z = Math.sin(s.t * 1.3) * 0.05 * motion;
      const breathe = 1 + Math.sin(s.t * 2.1 + 1) * 0.02 * motion;
      rig.current.scale.set(breathe, 2 - breathe, breathe);
    }
    if (armL.current && armR.current) {
      armL.current.rotation.z = 0.3 + Math.sin(s.t * 3) * 0.25 * motion;
      armR.current.rotation.z = -0.3 - Math.sin(s.t * 3 + 1) * 0.25 * motion - wave * (1.3 + Math.sin(s.t * 14) * 0.35 * motion);
    }
    if (eyes.current) eyes.current.scale.y = s.blink > 0 ? 0.15 : 1;
  });

  return (
    <group ref={rig}>
      <Puff at={[0, 0, 0]} s={[0.5, 0.42, 0.44]} color={C.lilac} />
      <Puff at={[-0.42, -0.07, 0.02]} s={0.33} color={C.lilac} />
      <Puff at={[0.43, -0.05, 0]} s={0.35} color={C.lilac} />
      <Puff at={[-0.16, 0.3, -0.03]} s={0.33} color={C.lilacLight} />
      <Puff at={[0.2, 0.27, 0.02]} s={0.3} color={C.lilacLight} />
      <Puff at={[0, -0.15, -0.2]} s={0.36} color="#cfc2f8" />
      <group ref={eyes}>
        <Puff at={[-0.14, 0.05, 0.4]} s={[0.05, 0.062, 0.04]} color={C.ink} />
        <Puff at={[0.14, 0.05, 0.4]} s={[0.05, 0.062, 0.04]} color={C.ink} />
        <Puff at={[-0.125, 0.08, 0.435]} s={0.016} color={C.white} />
        <Puff at={[0.155, 0.08, 0.435]} s={0.016} color={C.white} />
      </group>
      <Puff at={[-0.27, -0.06, 0.36]} s={[0.07, 0.04, 0.03]} color={C.blush} />
      <Puff at={[0.27, -0.06, 0.36]} s={[0.07, 0.04, 0.03]} color={C.blush} />
      <mesh geometry={kit.torus(0.065, 0.016, Math.PI)} material={kit.clay(C.ink)} position={[0, -0.05, 0.43]} rotation={[0, 0, Math.PI]} />
      <group ref={armL} position={[-0.5, -0.1, 0.12]}>
        <Puff at={[-0.08, 0, 0]} s={[0.11, 0.085, 0.085]} color={C.lilac} />
      </group>
      <group ref={armR} position={[0.5, -0.1, 0.12]}>
        <Puff at={[0.08, 0, 0]} s={[0.11, 0.085, 0.085]} color={C.lilac} />
      </group>
    </group>
  );
}
