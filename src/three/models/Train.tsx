import { useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored } from "../shapes";
import { cargoGeo, locoBody, RED, wagonBody, WHEEL, wheelGeo } from "./trainShapes";

/**
 * รถไฟของเล่นดินปั้น (หันหน้าไปทาง −z = ทางที่รถวิ่ง) — หัวรถจักร + ตู้สินค้าหนึ่งตู้ สินค้าที่เด็กเลือกวางบนตู้
 * ล้อแยกเป็นกลุ่มของมันเอง ฉากหมุนได้ตามระยะทาง (ลดการเคลื่อนไหว = ไม่หมุน) ไม่มีส่วนไหนเป็นตัวหนังสือบน texture
 * หน่วย: 1 ≈ ความสูงตัวกระต่าย
 */
/** The engine with its wheels (rotate `wheels` children about x to roll). The cab seat is at [0, 0.3, 0.45]. */
export function Locomotive({ wheels, children }: { wheels?: Ref<THREE.Group>; children?: ReactNode }) {
  const kit = useKit();
  const body = useMemo(() => kit.geo("train-loco", () => locoBody(kit.seg)), [kit]);
  const wheel = useMemo(() => kit.geo("train-wheel", () => wheelGeo(kit.seg)), [kit]);
  const mat = kit.clay(C.white, { vertexColors: true });
  const at: [number, number, number][] = [
    [-0.33, 0.13, -0.42],
    [0.33, 0.13, -0.42],
    [-0.33, 0.13, 0.0],
    [0.33, 0.13, 0.0],
    [-0.33, 0.13, 0.42],
    [0.33, 0.13, 0.42],
  ];
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow />
      <group ref={wheels}>
        {at.map((p, i) => (
          <mesh key={i} geometry={wheel} material={mat} position={p} />
        ))}
      </group>
      {children}
    </group>
  );
}

/** The wagon with the cargo on it. `cargoRef` lets the scene lift the cargo off at the delivery. */
export function Wagon({ cargo, wheels, cargoRef }: { cargo: string; wheels?: Ref<THREE.Group>; cargoRef?: Ref<THREE.Group> }) {
  const kit = useKit();
  const body = useMemo(() => kit.geo("train-wagon", wagonBody), [kit]);
  const wheel = useMemo(() => kit.geo("train-wheel", () => wheelGeo(kit.seg)), [kit]);
  const load = useMemo(() => kit.geo(`train-cargo-${cargo}`, () => cargoGeo(cargo, kit.seg)), [kit, cargo]);
  const mat = kit.clay(C.white, { vertexColors: true });
  const at: [number, number, number][] = [
    [-0.33, 0.13, -0.28],
    [0.33, 0.13, -0.28],
    [-0.33, 0.13, 0.28],
    [0.33, 0.13, 0.28],
  ];
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow />
      <group ref={wheels}>
        {at.map((p, i) => (
          <mesh key={i} geometry={wheel} material={mat} position={p} />
        ))}
      </group>
      <group ref={cargoRef} position={[0, 0.51, 0]}>
        <mesh geometry={load} material={mat} castShadow />
      </group>
    </group>
  );
}

/** The track switch at the junction: a short post with a lever (the scene tilts `lever` towards the chosen branch). */
export function SwitchLever({ lever }: { lever?: Ref<THREE.Group> }) {
  const kit = useKit();
  const base = useMemo(
    () =>
      kit.geo("train-switch-base", () =>
        colored([
          { geo: new THREE.BoxGeometry(0.3, 0.12, 0.22), color: C.stoneDeep, at: [0, 0.06, 0] },
          { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), color: WHEEL, at: [0, 0.15, 0], rot: [0, 0, Math.PI / 2] },
        ]),
      ),
    [kit],
  );
  const arm = useMemo(
    () =>
      kit.geo("train-switch-arm", () =>
        colored([
          { geo: new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), color: C.ink, at: [0, 0.25, 0] },
          { geo: new THREE.SphereGeometry(0.06, 12, 9), color: RED, at: [0, 0.52, 0] },
        ]),
      ),
    [kit],
  );
  const mat = kit.clay(C.white, { vertexColors: true });
  return (
    <group>
      <mesh geometry={base} material={mat} />
      <group ref={lever} position={[0, 0.15, 0]}>
        <mesh geometry={arm} material={mat} />
      </group>
    </group>
  );
}

/** The sleepers under the rails (one instanced mesh). */
export function Sleepers({ items }: { items: { x: number; z: number; ry: number }[] }) {
  const kit = useKit();
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new THREE.Object3D();
    items.forEach((s, i) => {
      d.position.set(s.x, 0.025, s.z);
      d.rotation.set(0, s.ry, 0);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[kit.geo("train-sleeper", () => new THREE.BoxGeometry(0.66, 0.05, 0.13)), kit.clay(C.woodDeep), items.length]} receiveShadow />;
}
