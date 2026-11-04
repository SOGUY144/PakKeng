import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { bump, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { Cap, Crown, Scarf, Shoe } from "../models/Accessories";
import { Balloon } from "../models/Balloon";
import { Bunny } from "../models/Bunny";
import { CloudPal } from "../models/CloudPal";
import { bunnyDrive, cloudDrive, type BunnyPose } from "../models/drives";
import { Frog, type FrogPose } from "../models/Frog";
import { C } from "../palette";
import { BlobShadow, Burst, Field, FitCamera, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { CelebrateSpec } from "../spec";

/** Floating garden island used as a little stage (same clay language as the game worlds). */
function Pedestal({ radius = 1.3, pond = false }: { radius?: number; pond?: boolean }) {
  const kit = useKit();
  const geo = useMemo(
    () => ({
      top: kit.geo(`pedestal-top-${radius}`, () => new THREE.CylinderGeometry(radius, radius * 0.96, 0.2, 40)),
      flowerPink: kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerWhite: kit.geo("flower-white", () => S.flower(C.white)),
      tuft: kit.geo("tuft", S.grassTuft),
      reeds: kit.geo("reeds", S.reeds),
    }),
    [kit, radius],
  );
  const ring = (n: number, r: number, phase: number): Placement[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + phase;
      return { x: Math.cos(a) * r, z: Math.sin(a) * r * 0.8 - 0.1, s: 0.9 + (i % 3) * 0.12, ry: a };
    }).filter((p) => p.z < 0.3 || Math.abs(p.x) > 0.75);
  return (
    <group>
      <mesh geometry={geo.top} material={kit.clay(C.grass)} position={[0, -0.1, 0]} receiveShadow />
      {/* rounded rock underneath (its top stays below the grass) */}
      <mesh geometry={kit.sphere()} material={kit.clay(C.stoneDeep)} position={[0, -0.04 - radius * 0.42, 0]} scale={[radius * 0.95, radius * 0.42, radius * 0.95]} />
      <mesh geometry={kit.sphere()} material={kit.clay(C.stone)} position={[0.08, -0.04 - radius * 0.8, 0.05]} scale={[radius * 0.5, radius * 0.34, radius * 0.5]} />
      {pond ? <mesh geometry={kit.cylinder(radius * 0.72, radius * 0.72, 0.02, 40)} material={kit.clay(C.water, { roughness: 0.3 })} position={[0, 0.005, 0]} /> : null}
      <Field geometry={geo.flowerPink} items={ring(7, radius * 0.86, 0.3)} />
      <Field geometry={geo.flowerWhite} items={ring(6, radius * 0.8, 1.1)} />
      <Field geometry={geo.tuft} items={ring(9, radius * 0.92, 0.7)} />
      {pond ? <Field geometry={geo.reeds} items={[{ x: -radius * 0.7, z: -0.35, s: 0.8 }, { x: radius * 0.75, z: -0.2, s: 0.7, ry: 1 }]} /> : null}
    </group>
  );
}

/**
 * ฉากฉลองสั้น ๆ ในหน้าสรุปรอบ (≈3 วินาที แล้วยืนนิ่ง) — ตัวละครตรงกับเกมที่เพิ่งเล่น
 * กระต่ายใส่ของสะสมที่ปลดล็อกแล้ว; reduced motion = ท่านิ่ง ไม่มีประกาย
 */
export function CelebrateWorld({ game, outfit, reduced, tier }: CelebrateSpec) {
  const kit = useKit();
  const bunny = useRef(bunnyDrive({ pose: game === "balloon" ? "ride" : "stand", reduced }));
  const cloud = useRef(cloudDrive({ reduced }));
  const frogPose = useRef<FrogPose>({ crouch: false, airborne: false, land: 0, reduced });
  const frogRoot = useRef<THREE.Group>(null);
  const craft = useRef<THREE.Group>(null);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1.6, z: 0.2 });
  const tl = useRef({ t: 0, beats: 0 });
  const BEATS = [0.25, 1.05];

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const s = tl.current;
    s.t += dt;
    if (reduced) return;
    while (s.beats < BEATS.length && s.t >= BEATS[s.beats]) {
      s.beats += 1;
      bunny.current.cheer += 1;
      cloud.current.wave += 1;
      if (game === "frog") frogPose.current.crouch = false;
      fire.current = { seq: fire.current.seq + 1, x: 0, y: game === "balloon" ? 2.4 : 1.4, z: 0.3 };
    }
    const pose: BunnyPose = game === "balloon" ? "ride" : s.t > 1.8 && s.t < 3.4 ? "wave" : "stand";
    bunny.current.pose = pose;
    if (game === "frog" && frogRoot.current) {
      // two happy hops in place
      let y = 0;
      for (const b of BEATS) {
        const k = (s.t - b) / 0.5;
        if (k > 0 && k < 1) y = bump(k) * 0.45;
      }
      const wasAir = frogPose.current.airborne;
      frogPose.current.airborne = y > 0.02;
      if (wasAir && !frogPose.current.airborne) frogPose.current.land += 1;
      frogPose.current.crouch = !frogPose.current.airborne && BEATS.some((b) => s.t > b - 0.25 && s.t < b);
      frogRoot.current.position.y = 0.04 + y;
    }
    if (game === "balloon" && craft.current) craft.current.position.y = 0.55 + Math.sin(s.t * 1.6) * 0.08;
  }, -1);

  return (
    <group dispose={null}>
      <Lights tier={tier} sun={[-3, 7, 6]} box={3.5} intensity={2.5} />
      {game === "balloon" ? (
        <FitCamera target={[0, 1.35, 0]} dir={[0.1, 0.12, 1]} width={3.4} height={3.2} />
      ) : (
        <FitCamera target={[0, 0.72, 0]} dir={[0.12, 0.3, 1]} width={3.6} height={2.2} />
      )}
      <Pedestal pond={game === "frog"} radius={game === "balloon" ? 1.0 : 1.3} />
      {game === "runner" ? (
        <>
          <group rotation-y={0.25}>
            <Bunny drive={bunny} outfit={outfit} />
          </group>
          <BlobShadow at={[0, 0, 0.02]} size={[0.85, 0.7]} />
          <group position={[-1.05, 0.95, -0.35]} rotation-y={0.5} scale={0.65}>
            <CloudPal drive={cloud} />
          </group>
        </>
      ) : null}
      {game === "balloon" ? (
        <group ref={craft} position={[0, 0.55, 0]}>
          <Balloon bunny={bunny} outfit={outfit} reduced={reduced} />
        </group>
      ) : null}
      {game === "frog" ? (
        <>
          <mesh geometry={kit.geo("lily-pad", () => S.lilyPad(0.55))} material={kit.clay(C.white, { vertexColors: true })} position={[0, 0, 0]} />
          <group ref={frogRoot} position={[0, 0.04, 0]} rotation-y={0.25}>
            <Frog pose={frogPose} />
          </group>
        </>
      ) : null}
      <Burst fire={fire} reduced={reduced} max={18} />
    </group>
  );
}

export type StudioSubject =
  | "thumb-runner"
  | "thumb-balloon"
  | "thumb-frog"
  | "avatar-bunny"
  | "item-cap"
  | "item-shoes"
  | "item-scarf"
  | "item-crown";

/** Still subjects rendered once (dev tool) into the images used by Home and Result. */
export function StudioScene({ subject }: { subject: StudioSubject }) {
  const kit = useKit();
  const bunny = useRef(bunnyDrive({ pose: subject === "thumb-runner" ? "run" : "stand", speed: 1.3, boost: true }));
  const ride = useRef(bunnyDrive({ pose: "ride" }));
  const cloud = useRef(cloudDrive({ reduced: true }));
  const frogPose = useRef<FrogPose>({ crouch: false, airborne: false, land: 0, reduced: true });
  const lights = <Lights tier="high" sun={[-3, 7, 6]} box={4} intensity={2.5} />;
  switch (subject) {
    case "thumb-runner":
      return (
        <group dispose={null}>
          {lights}
          <FitCamera target={[-0.55, 0.7, 0]} dir={[0, 0.32, 1]} width={4.4} height={2.6} />
          <mesh geometry={kit.geo("studio-path", () => new THREE.BoxGeometry(9, 0.3, 2.4))} material={kit.clay(C.path)} position={[0, -0.15, 0]} />
          <mesh geometry={kit.geo("studio-grass", () => new THREE.PlaneGeometry(14, 8))} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, -0.02, -3]} />
          <Field geometry={kit.geo("tree", S.tree)} items={[{ x: -2.4, z: -2.4, s: 1.1 }, { x: 1.3, z: -2.9, s: 1.25, ry: 2 }]} />
          <Field geometry={kit.geo("flower-pink", () => S.flower(C.pink))} items={[{ x: -1.2, z: 1.4 }, { x: 0.9, z: 1.5 }, { x: 2.1, z: 1.3 }]} />
          <group position={[0.75, 0, 0]} rotation-y={Math.PI / 2 - 0.6}>
            <Bunny drive={bunny} outfit="cap" />
          </group>
          <BlobShadow at={[0.75, 0, 0.04]} size={[0.9, 0.7]} />
          <group position={[-1.5, 0.9, 0]} rotation-y={Math.PI / 2 - 0.5} scale={0.85}>
            <CloudPal drive={cloud} />
          </group>
        </group>
      );
    case "thumb-balloon":
      return (
        <group dispose={null}>
          {lights}
          <FitCamera target={[0, 1.15, 0]} dir={[0.12, 0.05, 1]} width={3.4} height={2.6} />
          <group position={[0.15, 0.1, 0]}>
            <Balloon bunny={ride} outfit="cap" reduced />
          </group>
          <Field geometry={kit.geo("cloud", S.cloud)} items={[{ x: -1.25, y: 0.6, z: -0.8, s: 0.6 }, { x: 1.45, y: 1.9, z: -1, s: 0.55 }]} receiveShadow={false} />
        </group>
      );
    case "thumb-frog":
      return (
        <group dispose={null}>
          {lights}
          <FitCamera target={[0, 0.3, 0]} dir={[0.15, 0.55, 1]} width={2.9} height={1.9} />
          <mesh geometry={kit.geo("studio-pond", () => new THREE.CircleGeometry(3, 40))} material={kit.clay(C.water, { roughness: 0.3 })} rotation-x={-Math.PI / 2} />
          <mesh geometry={kit.geo("lily-pad", () => S.lilyPad(0.55))} material={kit.clay(C.white, { vertexColors: true })} />
          <Field geometry={kit.geo("lily-pad", () => S.lilyPad(0.55))} items={[{ x: 1.15, z: -0.9, s: 0.7, ry: 2 }]} />
          <Field geometry={kit.geo("reeds", S.reeds)} items={[{ x: -1.25, z: -0.6, s: 0.9 }]} />
          <Field geometry={kit.geo("lotus", S.lotus)} items={[{ x: 1.2, y: 0.08, z: -0.85 }]} />
          <group position={[0, 0.04, 0]} rotation-y={0.3}>
            <Frog pose={frogPose} />
          </group>
        </group>
      );
    case "avatar-bunny":
      return (
        <group dispose={null}>
          {lights}
          <FitCamera target={[0, 1.12, 0]} dir={[0.08, 0.1, 1]} width={1.25} height={1.2} />
          <Bunny drive={bunny} outfit="cap" />
        </group>
      );
    default:
      return (
        <group dispose={null}>
          {lights}
          {subject === "item-scarf" ? (
            <FitCamera target={[0.04, -0.06, 0.06]} dir={[0.2, 0.8, 1]} width={0.82} height={0.7} />
          ) : (
            <FitCamera target={[0, 0.05, 0]} dir={[0.25, 0.55, 1]} width={0.75} height={0.6} />
          )}
          {subject === "item-cap" ? <Cap /> : null}
          {subject === "item-crown" ? <Crown /> : null}
          {subject === "item-scarf" ? <Scarf /> : null}
          {subject === "item-shoes" ? (
            <>
              <group position={[-0.14, 0.07, 0]} rotation-y={0.25}>
                <Shoe />
              </group>
              <group position={[0.14, 0.07, 0.04]} rotation-y={-0.15}>
                <Shoe />
              </group>
            </>
          ) : null}
        </group>
      );
  }
}
