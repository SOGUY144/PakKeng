import type { BufferGeometry } from "three";
import { useKit } from "../kitContext";
import { C } from "../palette";
import {
  dinoBackGeo,
  dinoCrestGeo,
  dinoFaceGeo,
  dinoTailGeo,
  kittyEarGeo,
  kittyFaceGeo,
  kittyTailGeo,
  PUP_DEEP,
  puppyFaceGeo,
  puppyTailGeo,
  type Tailed,
} from "./avatarGeo";

/**
 * ชิ้นส่วนเฉพาะของตัวละครแต่ละแบบ (หน้า หู หาง หนามไดโนเสาร์) — แต่ละชิ้นเป็น geometry รวมก้อนเดียว สีต่อ vertex
 * ตาหมึกมีจุดแสงและแก้มชมพูอยู่ใน Bunny.tsx ใช้ร่วมกันทุกตัว ตัวละครจึงดูเป็นครอบครัวเดียวกับเพื่อนสัตว์
 * กลุ่มที่ขยับ (หู หาง) อยู่ใน Bunny.tsx ไฟล์นี้วาดเฉพาะรูปทรงนิ่งข้างใน
 */

/** One merged, vertex-coloured piece = one draw call (the same material the scenery uses). */
export function Painted({ geo, doubleSide = false }: { geo: BufferGeometry; doubleSide?: boolean }) {
  const kit = useKit();
  return <mesh geometry={geo} material={kit.clay(C.white, doubleSide ? { vertexColors: true, doubleSide: true } : { vertexColors: true })} />;
}

/** Face details in head space (the bunny's own pink nose stays in Bunny.tsx). */
export function SpeciesFace({ species }: { species: Tailed }) {
  const kit = useKit();
  switch (species) {
    case "puppy":
      return <Painted geo={kit.geo("avatar-puppy-face", () => puppyFaceGeo(kit.seg))} />;
    case "dino":
      return <Painted geo={kit.geo("avatar-dino-face", () => dinoFaceGeo(kit.seg))} />;
    case "kitty":
      return <Painted geo={kit.geo("avatar-kitty-face", () => kittyFaceGeo(kit.seg))} />;
  }
}

/** Tail shape in the tail joint's space (origin = where it meets the lower back). */
export function SpeciesTail({ species }: { species: Tailed }) {
  const kit = useKit();
  switch (species) {
    case "puppy":
      return <Painted geo={kit.geo("avatar-puppy-tail", () => puppyTailGeo(kit.seg))} />;
    case "dino":
      return <Painted geo={kit.geo("avatar-dino-tail", () => dinoTailGeo(kit.seg))} />;
    case "kitty":
      return <Painted geo={kit.geo("avatar-kitty-tail", () => kittyTailGeo(kit.seg))} />;
  }
}

/** One floppy puppy ear hanging from its joint; turned half outward so it reads from the front and the side. */
export function PuppyEar({ side }: { side: 1 | -1 }) {
  const kit = useKit();
  return <mesh geometry={kit.sphere()} material={kit.clay(PUP_DEEP)} position={[0, -0.14, 0]} rotation={[0, side * 0.6, 0]} scale={[0.085, 0.165, 0.05]} />;
}

/** One pointy kitty ear standing on its joint. */
export function KittyEar() {
  const kit = useKit();
  return <Painted geo={kit.geo("avatar-kitty-ear", () => kittyEarGeo(kit.seg))} />;
}

/** Dino head spikes (head space) from angle `from` backward, so a cap or a crown never cuts through them. */
export function DinoCrest({ from }: { from: number }) {
  const kit = useKit();
  return <Painted geo={kit.geo(`avatar-dino-crest|${from}`, () => dinoCrestGeo(kit.seg, from))} />;
}

/** Dino back spikes (rig space); hidden under shirts and the cape. */
export function DinoBack() {
  const kit = useKit();
  return <Painted geo={kit.geo("avatar-dino-back", () => dinoBackGeo(kit.seg))} />;
}
