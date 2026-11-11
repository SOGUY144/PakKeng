import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { useKit } from "../kitContext";
import { C } from "../palette";
import * as S from "../shapes";

const W = 1.2;
const D = 0.78;
const H = 0.6;
/** The lid is a half cylinder along x whose radius is half the depth. */
const R = D / 2;
/** How far the lid swings back when the chest is open (radians). */
const LID_OPEN = 1.95;

const WOOD = "#c98a55";
const WOOD_LIGHT = "#dba06a";

/** Half cylinder lying along x (dome up), with its flat face at y = 0. */
function halfDrum(radius: number, length: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius, length, 28, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  return g;
}

/**
 * หีบรางวัลท้ายเส้นทางวันนี้ (หน้าแรก): ไม้ดินปั้นคาดแถบทอง · เปิดแล้ว = ฝาพับไปด้านหลัง มีแสงอุ่นและดาวลอยขึ้น
 * ใช้ทำภาพนิ่ง (render studio) ให้หน้าแรกโดยไม่ต้องโหลด three.js
 */
export function Chest({ open }: { open: boolean }) {
  const kit = useKit();
  const geo = useMemo(
    () => ({
      body: kit.geo("chest-body", () => new RoundedBoxGeometry(W, H, D, 3, 0.08)),
      lid: kit.geo("chest-lid", () => halfDrum(R, W - 0.02)),
      band: kit.geo("chest-band", () => new RoundedBoxGeometry(0.13, H + 0.03, D + 0.05, 2, 0.03)),
      lidBand: kit.geo("chest-lid-band", () => halfDrum(R + 0.03, 0.13)),
      // the flat underside of the lid (seen when it is open)
      lidUnder: kit.geo("chest-lid-under", () => new THREE.PlaneGeometry(W - 0.02, D).rotateX(Math.PI / 2)),
      rim: kit.geo("chest-rim", () => new RoundedBoxGeometry(W + 0.05, 0.09, D + 0.05, 2, 0.03)),
      plate: kit.geo("chest-plate", () => new RoundedBoxGeometry(0.28, 0.3, 0.07, 2, 0.04)),
      keyhole: kit.geo("chest-keyhole", () => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12)),
      glow: kit.geo("chest-glow", () => new THREE.PlaneGeometry(W - 0.14, D - 0.14)),
      coin: kit.geo("chest-coin", () => new THREE.CylinderGeometry(0.11, 0.11, 0.04, 18)),
      sparkle: kit.geo("sparkle", S.sparkle),
    }),
    [kit],
  );
  const wood = kit.clay(WOOD);
  const gold = kit.clay(C.gold, { roughness: 0.4 });
  const coins: [number, number, number, number][] = [
    [-0.28, H - 0.02, 0.05, 0.3],
    [-0.08, H + 0.02, -0.08, -0.2],
    [0.14, H - 0.01, 0.1, 0.5],
    [0.3, H + 0.03, -0.1, 0.1],
    [0.04, H + 0.06, 0.04, 0.9],
  ];
  return (
    <group>
      <mesh geometry={geo.body} material={wood} position={[0, H / 2, 0]} castShadow receiveShadow />
      <mesh geometry={geo.rim} material={kit.clay("#a86e40")} position={[0, H - 0.04, 0]} castShadow />
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} geometry={geo.band} material={gold} position={[x, H / 2, 0]} castShadow />
      ))}
      <group position={[0, H * 0.62, D / 2 + 0.02]}>
        <mesh geometry={geo.plate} material={gold} castShadow />
        <mesh geometry={geo.keyhole} material={kit.clay(C.ink)} position={[0, 0.03, 0.04]} rotation-x={Math.PI / 2} />
      </group>
      {open ? (
        <>
          <mesh geometry={geo.glow} material={kit.basic("#fff3b0")} position={[0, H - 0.03, 0]} rotation-x={-Math.PI / 2} />
          {coins.map(([x, y, z, r], i) => (
            <mesh key={i} geometry={geo.coin} material={gold} position={[x, y, z]} rotation={[0.25, r, 0.15]} castShadow />
          ))}
          {[
            [-0.24, H + 0.42, 0.12, 0.08],
            [0.26, H + 0.58, 0.08, 0.1],
            [0.02, H + 0.78, 0.16, 0.07],
          ].map(([x, y, z, s], i) => (
            <mesh key={i} geometry={geo.sparkle} material={kit.basic(C.butter)} position={[x, y, z]} scale={s} />
          ))}
        </>
      ) : null}
      {/* the lid hinges on the back top edge */}
      <group position={[0, H, -D / 2]} rotation-x={open ? -LID_OPEN : 0}>
        <group position={[0, 0, D / 2]}>
          <mesh geometry={geo.lid} material={kit.clay(WOOD_LIGHT)} castShadow />
          <mesh geometry={geo.lidUnder} material={kit.clay("#a86e40")} position={[0, 0.002, 0]} />
          {[-0.36, 0.36].map((x) => (
            <mesh key={x} geometry={geo.lidBand} material={gold} position={[x, 0, 0]} castShadow />
          ))}
        </group>
      </group>
    </group>
  );
}
