import { useKit } from "../kitContext";
import { C } from "../palette";

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
