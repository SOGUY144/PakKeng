import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { bump, CALM, damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { Cap, Cape, CapeTie, Crown, Hood, Scarf, Shoe, Skirt, Sleeve, Top } from "./Accessories";
import {
  CAPE_PIVOT,
  CREST_UNDER_CAP,
  CREST_UNDER_CROWN,
  HOOD_TOP,
  KITTY_EAR_AT,
  LOOK,
  PUPPY_EAR_AT,
  SKIRT_PIVOT,
  TAIL,
  type AvatarSpecies,
} from "./avatarGeo";
import { DinoBack, DinoCrest, KittyEar, PuppyEar, SpeciesFace, SpeciesTail } from "./avatarParts";
import { outfitFlags, type BunnyDrive } from "./drives";

export type { AvatarSpecies } from "./avatarGeo";

/** Characters the child can pick, in menu order ("bunny" = the original look). */
// part of this module's public API (menus list it); editing this file just reloads instead of hot-swapping
// oxlint-disable-next-line react/only-export-components
export const AVATAR_SPECIES: AvatarSpecies[] = ["bunny", "puppy", "dino", "kitty"];

type V3 = [number, number, number];

const PUPPY_EAR_L: V3 = [-PUPPY_EAR_AT[0], PUPPY_EAR_AT[1], PUPPY_EAR_AT[2]];
const KITTY_EAR_L: V3 = [-KITTY_EAR_AT[0], KITTY_EAR_AT[1], KITTY_EAR_AT[2]];

function Ball({ at, s, color }: { at: V3; s: number | V3; color: string }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color)} position={at} scale={s} />;
}

/**
 * ตัวละครหลัก (ออกแบบเอง ปั้นจากทรงกลม/แคปซูล) — ยืนบน y = 0 หันหน้าไปทาง +Z สูง ≈ 1.6 รวมหู
 * เลือกได้ 4 แบบด้วย species: กระต่าย (ค่าเริ่มต้น หน้าตาเหมือนเดิมทุกอย่าง), ลูกหมา, ไดโนเสาร์, แมวเหมียว
 * ทุกแบบใช้โครง ขนาด และท่าทางเดียวกัน: ยืนหายใจ/กะพริบตา, วิ่ง (จังหวะตามความเร็ว), เชียร์สั้น ๆ, ร้องเพลง (ด่านประตู),
 * นั่งบอลลูน, โบกมือ — ต่างกันแค่สี หน้า หู หาง (ตาหมึกมีจุดแสงและแก้มชมพูเหมือนกันทั้งครอบครัว)
 * ของสะสมและชุด (หมวก ผ้าพันคอ รองเท้า มงกุฎ เสื้อบอล ฮู้ดไดโนเสาร์ ชุดเจ้าหญิง ผ้าคลุมฮีโร่) ใส่ได้จากค่า outfit
 * ชิ้นที่ชนช่องเดียวกันใช้ลำดับคงที่ของ outfitFlags
 */
export function Bunny({ drive, outfit = "", species = "bunny" }: { drive: RefObject<BunnyDrive>; outfit?: string; species?: AvatarSpecies }) {
  const kit = useKit();
  const wear = outfitFlags(outfit);
  // an unknown id (an older save, a typo) falls back to the bunny
  const sp: AvatarSpecies = species in LOOK ? species : "bunny";
  const look = LOOK[sp];
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
  const tail = useRef<THREE.Group>(null);
  const skirt = useRef<THREE.Group>(null);
  const cape = useRef<THREE.Group>(null);
  const st = useRef({ t: 0, phase: 0, run: 0, boost: 0, sing: 0, wave: 0, wag: 0, cheerT: -1, cheerSeen: drive.current.cheer, blink: 0, blinkNext: 1.5 });
  const tailed = sp === "bunny" ? null : sp;
  // under a cape the puppy's and kitty's tails point back, below its hem, instead of up into the cloth
  const tailPitch = tailed ? (wear.cape ? TAIL[tailed].caped : TAIL[tailed].pitch) : 0;

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
    // in the dress the arms rest a little wider, over the skirt
    const splay = wear.dress ? 0.1 : 0;
    if (armL.current && armR.current) {
      armL.current.rotation.x = f * 0.85 * runA - cheer * 2.6 - s.sing * 0.4;
      armR.current.rotation.x = -f * 0.85 * runA - cheer * 2.6 - s.sing * 0.4 - s.wave * 2.7;
      armL.current.rotation.z = -0.12 - s.sing * 0.55 - splay;
      armR.current.rotation.z = 0.12 + s.sing * 0.55 + waveSwing + splay;
    }
    const eL = earL.current;
    const eR = earR.current;
    if (eL && eR) {
      if (sp === "puppy") {
        // floppy ears flap out on every step and fly up on a cheer (they never sweep back like the bunny's)
        const flap = (0.5 - 0.5 * Math.cos(p * 2)) * 0.5 * runA;
        const out = 0.28 + flap + cheer * 0.75;
        const sway = Math.sin(s.t * 1.3) * 0.04 * motion;
        const back = 0.22 * s.run + 0.18 * s.boost;
        eL.rotation.set(back, 0, -out - sway);
        eR.rotation.set(back, 0, out - sway);
      } else if (sp === "kitty") {
        // pointy ears tip back a little at speed, stand up tall on a cheer and flick now and then
        const a = Math.max(0, Math.sin(s.t * 0.7));
        const b = Math.max(0, Math.sin(s.t * 0.7 + 2.6));
        const tilt = 0.3 - 0.2 * cheer;
        const back = 0.12 * cheer - 0.2 * s.run - 0.25 * s.boost;
        eL.rotation.set(back, 0, tilt + a ** 16 * 0.3 * motion);
        eR.rotation.set(back, 0, -tilt - b ** 16 * 0.3 * motion);
        const tall = 1 + 0.15 * cheer;
        eL.scale.set(1, tall, 1);
        eR.scale.set(1, tall, 1);
      } else {
        const earFlop = Math.sin(p * 2) * 0.07 * runA;
        eL.rotation.x = -0.12 - (0.28 + 0.4 * s.boost) * s.run + earFlop + cheer * 0.3;
        eR.rotation.x = -0.12 - (0.28 + 0.4 * s.boost) * s.run - earFlop + cheer * 0.3;
        eL.rotation.z = 0.17 + Math.sin(s.t * 1.3) * 0.03 * motion;
        eR.rotation.z = -0.17 - Math.sin(s.t * 1.1 + 1) * 0.03 * motion;
      }
    }
    if (head.current) {
      head.current.rotation.x = Math.sin(p * 2) * 0.04 * runA - s.sing * 0.12;
      head.current.rotation.z = Math.sin(s.t * 0.9) * 0.035 * (1 - s.run) * motion;
    }
    if (eyes.current) eyes.current.scale.y = s.blink > 0 ? 0.15 : 1;

    const tl = tail.current;
    if (tl) {
      if (sp === "puppy") {
        // happy wag, quicker while running and on a cheer
        s.wag += dt * (9 + 6 * s.run + 8 * cheer);
        tl.rotation.set(tailPitch, 0, Math.sin(s.wag) * (0.32 + 0.12 * s.run + 0.2 * cheer) * motion);
      } else if (sp === "dino") {
        // slow sway at rest, a swing with every stride, a quick wiggle on a cheer
        tl.rotation.set(0, Math.sin(s.t * 1.4) * 0.08 * motion + f * 0.28 * runA + Math.sin(s.t * 16) * 0.18 * cheer * motion, 0);
      } else {
        tl.rotation.set(tailPitch + Math.sin(s.t * 1.1) * 0.05 * motion, Math.sin(s.t * 1.6) * 0.22 * motion + f * 0.22 * runA, 0);
      }
    }
    // the skirt swings with the hips and lifts a touch at the front while running (room for the feet)
    skirt.current?.rotation.set(-0.05 * s.run, 0, f * 0.05 * runA);
    const cp = cape.current;
    if (cp) {
      // the cape trails back and lifts with speed (more while passing, a flick on a cheer), flaps a little on every
      // step and sways with the stride; reduced motion keeps a smaller lift and sway and no flapping
      const calm = d.reduced ? CALM.amp : 1;
      const lift = (s.run * (0.6 + 0.35 * s.boost) + cheer * 0.45) * calm;
      const flap = d.reduced ? 0 : Math.sin(p * 2 + 0.8) * 0.07 * s.run;
      cp.rotation.set(0.32 * lift + flap + Math.sin(s.t * 1.2) * 0.02 * motion, 0, f * 0.07 * runA * calm);
      cp.scale.set(1, 1 - 0.18 * lift, 1 + 0.3 * lift + flap);
    }
  });

  const top = wear.top;
  const hood = wear.hoodie;
  // dino head spikes give way to whatever covers that part of the head
  const crest = sp !== "dino" || hood ? null : wear.cap ? CREST_UNDER_CAP : wear.crown ? CREST_UNDER_CROWN : -1;
  return (
    <group>
      <group ref={rig}>
        <mesh ref={body} geometry={kit.sphere()} material={kit.clay(look.fur)} position={[0, 0.52, 0]} scale={[0.4, 0.44, 0.36]} />
        {/* belly patch: a shirt covers it (left in, it would poke through near the hem) */}
        {top ? null : <Ball at={[0, 0.48, 0.25]} s={[0.27, 0.3, 0.13]} color={look.belly} />}
        {tailed ? (
          <group ref={tail} position={TAIL[tailed].at} rotation-x={tailPitch}>
            <SpeciesTail species={tailed} />
          </group>
        ) : (
          <Ball at={[0, 0.45, -0.34]} s={0.11} color={C.white} />
        )}
        {/* back spikes: hidden under a shirt or the cape rather than poking through */}
        {sp === "dino" && !top && !wear.cape ? <DinoBack /> : null}
        <group ref={footL} position={[-0.15, 0.075, 0.07]}>
          {wear.shoes ? <Shoe /> : <Ball at={[0, 0, 0]} s={[0.12, 0.075, 0.19]} color={look.paw} />}
        </group>
        <group ref={footR} position={[0.15, 0.075, 0.07]}>
          {wear.shoes ? <Shoe /> : <Ball at={[0, 0, 0]} s={[0.12, 0.075, 0.19]} color={look.paw} />}
        </group>
        <group ref={armL} position={[-0.32, 0.69, 0.06]}>
          <mesh geometry={kit.capsule(0.07, 0.14)} material={kit.clay(look.fur)} position={[0, -0.12, 0]} />
          {top ? <Sleeve kind={top} /> : null}
        </group>
        <group ref={armR} position={[0.32, 0.69, 0.06]}>
          <mesh geometry={kit.capsule(0.07, 0.14)} material={kit.clay(look.fur)} position={[0, -0.12, 0]} />
          {top ? <Sleeve kind={top} /> : null}
        </group>
        {top ? <Top kind={top} /> : null}
        {top === "dress" ? (
          <group ref={skirt} position={SKIRT_PIVOT}>
            <Skirt />
          </group>
        ) : null}
        {wear.cape ? (
          <>
            <CapeTie />
            <group ref={cape} position={CAPE_PIVOT}>
              <Cape />
            </group>
          </>
        ) : null}
        {wear.scarf ? (
          <group position={[0, 0.84, 0.01]}>
            <Scarf />
          </group>
        ) : null}
        <group ref={head} position={[0, 1.03, 0.03]}>
          <Ball at={[0, 0, 0]} s={[0.36, 0.33, 0.33]} color={look.fur} />
          <group ref={eyes}>
            <Ball at={[-0.125, 0.035, 0.285]} s={[0.05, 0.058, 0.04]} color={C.ink} />
            <Ball at={[0.125, 0.035, 0.285]} s={[0.05, 0.058, 0.04]} color={C.ink} />
            <Ball at={[-0.11, 0.06, 0.318]} s={0.016} color={C.white} />
            <Ball at={[0.14, 0.06, 0.318]} s={0.016} color={C.white} />
          </group>
          <Ball at={[-0.205, -0.055, 0.262]} s={[0.07, 0.042, 0.03]} color={C.blush} />
          <Ball at={[0.205, -0.055, 0.262]} s={[0.07, 0.042, 0.03]} color={C.blush} />
          {tailed ? <SpeciesFace species={tailed} /> : <Ball at={[0, -0.012, 0.325]} s={[0.042, 0.03, 0.03]} color={C.pink} />}
          {/* ears fold away under the hood; the dino has none */}
          {hood ? null : sp === "bunny" ? (
            <>
              <group ref={earL} position={[-0.13, 0.22, -0.02]}>
                <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.cream)} position={[0, 0.25, 0]} />
                <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.pinkSoft)} position={[0, 0.25, 0.05]} scale={[0.55, 0.8, 0.4]} />
              </group>
              <group ref={earR} position={[0.13, 0.22, -0.02]}>
                <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.cream)} position={[0, 0.25, 0]} />
                <mesh geometry={kit.capsule(0.085, 0.34)} material={kit.clay(C.pinkSoft)} position={[0, 0.25, 0.05]} scale={[0.55, 0.8, 0.4]} />
              </group>
            </>
          ) : sp === "puppy" ? (
            <>
              <group ref={earL} position={PUPPY_EAR_L}>
                <PuppyEar side={-1} />
              </group>
              <group ref={earR} position={PUPPY_EAR_AT}>
                <PuppyEar side={1} />
              </group>
            </>
          ) : sp === "kitty" ? (
            <>
              <group ref={earL} position={KITTY_EAR_L}>
                <KittyEar />
              </group>
              <group ref={earR} position={KITTY_EAR_AT}>
                <KittyEar />
              </group>
            </>
          ) : null}
          {crest === null ? null : <DinoCrest from={crest} />}
          {hood ? <Hood spikes={sp === "dino" ? 0 : wear.crown ? 3 : 4} /> : null}
          {wear.cap ? (
            // high enough that the top of the head (0.33) never pokes through the cap's crown
            <group position={[0, 0.125, 0]} rotation={[-0.12, 0, 0]}>
              <Cap />
            </group>
          ) : null}
          {wear.crown ? (
            <group position={[0, hood ? HOOD_TOP + 0.015 : wear.cap ? 0.36 : 0.3, 0]}>
              <Crown />
            </group>
          ) : null}
        </group>
      </group>
    </group>
  );
}
