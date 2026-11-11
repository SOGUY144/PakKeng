import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import { frameDt } from "../anim";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { balloonEnvelope, colored } from "../shapes";
import { Bunny, type AvatarSpecies } from "./Bunny";
import type { BunnyDrive } from "./drives";

/** Basket bottom is the model origin; envelope top ≈ 2.0 above it. */
export const BALLOON_TOP = 2.0;
/** Gores around the envelope (see shapes.balloonEnvelope). */
const GORES = 12;

/** Repaint the envelope's gores with `colors`, repeating around the balloon. */
function paintGores(g: THREE.BufferGeometry, colors: string[]): THREE.BufferGeometry {
  const cols = colors.map((c) => new THREE.Color(c));
  const pos = g.getAttribute("position");
  const color = g.getAttribute("color");
  for (let f = 0; f < pos.count; f += 3) {
    let cx = 0;
    let cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += pos.getX(f + v);
      cz += pos.getZ(f + v);
    }
    const a = (Math.atan2(cz, cx) + Math.PI * 2) % (Math.PI * 2);
    const c = cols[Math.floor((a / (Math.PI * 2)) * GORES) % cols.length];
    for (let v = 0; v < 3; v++) color.setXYZ(f + v, c.r, c.g, c.b);
  }
  color.needsUpdate = true;
  return g;
}

/**
 * บอลลูนลมร้อน: ผ้าบอลลูนแถบชมพู/ครีม/เหลือง (สีเดียวกับภาพ 2D) ตะกร้าสาน เชือก 4 เส้น และกระต่ายนั่งในตะกร้า
 * ขยับเบา ๆ เฉพาะการโยกเล็กน้อย ตำแหน่งความสูงมาจากฉาก (ตามตรรกะเกม)
 * รอบ “พาบอลลูนไปส่ง”: สีผ้าตามที่ที่เด็กเลือก (`colors`) และมีกล่องของขวัญในตะกร้าแทนกระต่าย (`parcel`)
 */
export function Balloon({
  bunny,
  outfit = "",
  species,
  reduced,
  colors,
  parcel,
}: {
  /** Rider in the basket (absent = no rider). */
  bunny?: RefObject<BunnyDrive>;
  outfit?: string;
  /** The rider's character (the one the child picked on the island). */
  species?: AvatarSpecies;
  reduced: boolean;
  /** Envelope gores, repeating; absent = pink / cream / butter as in the 2D art. */
  colors?: readonly string[];
  /** Colour of a gift parcel in the basket (balloons being delivered). */
  parcel?: string;
}) {
  const kit = useKit();
  const paint = colors?.join(",") ?? "";
  const geo = useMemo(
    () => ({
      // radial segments must be a multiple of the 12 gores so every stripe edge is straight
      envelope: kit.geo(paint ? `balloon-envelope|${paint}` : "balloon-envelope", () => {
        const g = balloonEnvelope(1.3, kit.tier === "low" ? 24 : 36);
        return paint ? paintGores(g, paint.split(",")) : g;
      }),
      basket: kit.geo("balloon-basket", () => new THREE.CylinderGeometry(0.27, 0.21, 0.3, 18)),
      rope: kit.geo("balloon-rope", () => new THREE.CylinderGeometry(0.012, 0.012, 1, 4)),
      parcel: parcel
        ? kit.geo(`balloon-parcel|${parcel}`, () =>
            colored([
              { geo: new THREE.BoxGeometry(0.24, 0.2, 0.24), color: parcel, at: [0, 0.37, 0] },
              { geo: new THREE.BoxGeometry(0.254, 0.21, 0.05), color: C.cream, at: [0, 0.37, 0] },
              { geo: new THREE.BoxGeometry(0.05, 0.21, 0.254), color: C.cream, at: [0, 0.37, 0] },
              { geo: new THREE.SphereGeometry(0.045, 8, 6), color: C.cream, at: [0, 0.49, 0], scale: [1.4, 0.8, 1] },
            ]),
          )
        : null,
    }),
    [kit, paint, parcel],
  );
  const sway = useRef<THREE.Group>(null);
  const t = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    t.current += frameDt(dt);
    if (sway.current) sway.current.rotation.z = reduced ? 0 : Math.sin(t.current * 0.9) * 0.035;
  });
  const ropes: [number, number][] = [
    [0.2, 0.2],
    [-0.2, 0.2],
    [0.2, -0.2],
    [-0.2, -0.2],
  ];
  return (
    <group ref={sway}>
      <mesh geometry={geo.basket} material={kit.clay(C.wicker)} position={[0, 0.15, 0]} />
      <mesh geometry={kit.torus(0.27, 0.035)} material={kit.clay(C.wickerDeep)} position={[0, 0.3, 0]} rotation-x={Math.PI / 2} />
      <mesh geometry={kit.torus(0.235, 0.022)} material={kit.clay(C.wickerDeep)} position={[0, 0.12, 0]} rotation-x={Math.PI / 2} />
      {ropes.map(([x, z], i) => {
        const from = new THREE.Vector3(x, 0.3, z);
        const to = new THREE.Vector3(x * 0.55, 0.7, z * 0.55);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const dir = to.clone().sub(from);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        return <mesh key={i} geometry={geo.rope} material={kit.clay(C.woodDeep)} position={mid} quaternion={q} scale={[1, dir.length(), 1]} />;
      })}
      <mesh geometry={kit.torus(0.13, 0.03)} material={kit.clay(C.wickerDeep)} position={[0, 0.7, 0]} rotation-x={Math.PI / 2} />
      <mesh geometry={geo.envelope} material={kit.clay(C.white, { vertexColors: true })} position={[0, 0.68, 0]} />
      <mesh geometry={kit.sphereLo()} material={kit.clay(C.cream)} position={[0, 0.68 + 1.3, 0]} scale={[0.12, 0.05, 0.12]} />
      {geo.parcel ? <mesh geometry={geo.parcel} material={kit.clay(C.white, { vertexColors: true })} /> : null}
      {/* the bunny rides in the basket: only head, ears and paws show above the rim */}
      {bunny ? (
        <group position={[0, 0.02, 0.02]} scale={0.42}>
          <Bunny drive={bunny} outfit={outfit} species={species} />
        </group>
      ) : null}
    </group>
  );
}
