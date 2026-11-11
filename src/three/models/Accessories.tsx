import { useKit } from "../kitContext";
import { C } from "../palette";
import { capeGeo, capeTieGeo, dressTopGeo, hoodGeo, hoodieSleeveGeo, hoodieTorsoGeo, jerseySleeveGeo, jerseyTorsoGeo, skirtGeo } from "./avatarGeo";
import { Painted } from "./avatarParts";

type V3 = [number, number, number];

function Ball({ at, s, color, rough }: { at: V3; s: number | V3; color: string; rough?: number }) {
  const kit = useKit();
  const size = typeof s === "number" ? s : Math.max(...s);
  return <mesh geometry={kit.ball(size)} material={kit.clay(color, rough === undefined ? {} : { roughness: rough })} position={at} scale={s} />;
}

/**
 * ของสะสมของกระต่าย (สีเดียวกับไอคอน 2D เดิม): หมวกแก๊ปสีเขียวหัวเป็ด, รองเท้าชมพู, ผ้าพันคอสีเหลือง, มงกุฎทอง
 * ใช้ทั้งบนตัวกระต่ายในเกม และเรนเดอร์เป็นภาพไอคอนในหน้า Home/สรุปรอบ
 */
export function Cap() {
  const kit = useKit();
  return (
    <group>
      <mesh geometry={kit.dome()} material={kit.clay(C.teal)} scale={[0.33, 0.22, 0.32]} />
      <Ball at={[0, 0.02, 0.28]} s={[0.21, 0.026, 0.17]} color={C.tealDeep} />
      <Ball at={[0, 0.22, 0]} s={0.034} color={C.butter} />
    </group>
  );
}

export function Crown() {
  const kit = useKit();
  return (
    <group>
      <mesh geometry={kit.cylinder(0.15, 0.15, 0.09)} material={kit.clay(C.gold, { roughness: 0.45 })} />
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
        return <Ball key={i} at={[Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14]} s={0.035} color={C.gold} rough={0.45} />;
      })}
      <Ball at={[0, 0, 0.15]} s={0.03} color={C.pink} />
    </group>
  );
}

/** Neck scarf; origin = centre of the neck ring. */
export function Scarf() {
  const kit = useKit();
  return (
    <group>
      <mesh geometry={kit.torus(0.25, 0.07)} material={kit.clay(C.butter)} rotation={[Math.PI / 2 + 0.08, 0, 0]} />
      <mesh geometry={kit.capsule(0.06, 0.16)} material={kit.clay(C.butter)} position={[0.15, -0.14, 0.23]} rotation={[0.3, 0, 0.45]} />
    </group>
  );
}

/** One shoe (pink with a white sole); origin = centre of the foot. */
export function Shoe() {
  return (
    <group>
      <Ball at={[0, 0, 0]} s={[0.12, 0.075, 0.19]} color={C.pink} />
      <Ball at={[0, -0.03, 0.04]} s={[0.125, 0.04, 0.17]} color={C.white} />
    </group>
  );
}

/*
 * ชุดแต่งตัวใหม่: เสื้อบอลสีฟ้าขอบขาวเบอร์ 1, ฮู้ดไดโนเสาร์, ชุดเจ้าหญิงสีชมพูมีโบว์, ผ้าคลุมฮีโร่สีแดงมีดาวทอง
 * แต่ละชิ้นรวมเป็น geometry ก้อนเดียว (หนึ่ง draw call) ตำแหน่งตามโครงตัวละครใน Bunny.tsx ใช้ได้ทุกแบบ (กระต่าย หมา ไดโนเสาร์ แมว)
 */

/** What can be worn on the torso (one at a time; see outfitFlags). */
export type TopKind = "jersey" | "hoodie" | "dress";

/** Torso garment, origin = the character's feet: football shirt, hoodie body, or the dress bodice with its sash and bow. */
export function Top({ kind }: { kind: TopKind }) {
  const kit = useKit();
  const geo =
    kind === "jersey"
      ? kit.geo("avatar-jersey", () => jerseyTorsoGeo(kit.seg))
      : kind === "hoodie"
        ? kit.geo("avatar-hoodie", () => hoodieTorsoGeo(kit.seg))
        : kit.geo("avatar-dress-top", () => dressTopGeo(kit.seg));
  return <Painted geo={geo} />;
}

/** The matching sleeve, inside an arm's swinging group (origin = the shoulder joint). */
export function Sleeve({ kind }: { kind: TopKind }) {
  const kit = useKit();
  if (kind === "dress") return <mesh geometry={kit.sphere()} material={kit.clay(C.pinkSoft)} position={[0, -0.02, 0]} scale={[0.1, 0.085, 0.1]} />;
  const geo = kind === "jersey" ? kit.geo("avatar-jersey-sleeve", () => jerseySleeveGeo(kit.seg)) : kit.geo("avatar-hoodie-sleeve", () => hoodieSleeveGeo(kit.seg));
  return <Painted geo={geo} />;
}

/** Flared princess skirt with a lace hem; origin = SKIRT_PIVOT (it sways about the waist). */
export function Skirt() {
  const kit = useKit();
  return <Painted geo={kit.geo("avatar-skirt", () => skirtGeo(kit.seg))} />;
}

/** Dino hood in head space; `spikes` along its top: 4, 3 under a crown, 0 on the dino itself. */
export function Hood({ spikes }: { spikes: number }) {
  const kit = useKit();
  return <Painted geo={kit.geo(`avatar-hood|${spikes}`, () => hoodGeo(kit.seg, spikes))} />;
}

/** Hero cape with a gold star; origin = CAPE_PIVOT (back of the neck). The cloth is drawn from both sides. */
export function Cape() {
  const kit = useKit();
  return <Painted geo={kit.geo("avatar-cape", () => capeGeo(kit.seg))} doubleSide />;
}

/** Gold cord tying the cape at the front of the neck; origin = the character's feet. */
export function CapeTie() {
  const kit = useKit();
  return <Painted geo={kit.geo("avatar-cape-tie", () => capeTieGeo(kit.seg))} />;
}
