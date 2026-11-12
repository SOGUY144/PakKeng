import { useMemo } from "react";
import * as THREE from "three";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored, type Part } from "../shapes";
import { COUNTER_TOP, TOPPING_KINDS, type ToppingKind } from "./bakeryLayout";

/**
 * ร้านขนมของเพื่อน 3D: ผนังลายทางชมพู กันสาด ชั้นวางโหล เคาน์เตอร์ครีมขอบชมพู เค้กบนจาน และหน้าขนม 5 แบบ
 * สีตรงกับภาพ 2D (components/Art.tsx) — ไม่มีน้ำเงิน (ค่าด้านปาก) หรือส้ม (ค่าด้านจมูก)
 * หน่วย: 1 ≈ ความสูงตัวกระต่าย พื้นอยู่ที่ y = 0
 */

const ball = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, h: number, seg = 28) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

const TRIM = "#ff9fb8";
const SPONGE = "#f6e2b8";
const ICING = "#ffe3ef";

/** The counter's front reaches well below the view, so the bottom of the stage is always counter (the tray sits there). */
const COUNTER_FOOT = -2.4;

function counterGeo(): THREE.BufferGeometry {
  const h = COUNTER_TOP - 0.06 - COUNTER_FOOT;
  const mid = COUNTER_FOOT + h / 2;
  // deep enough that the cake plate never hangs over the front edge
  const z = 0.1;
  const front = z + 0.75 + 0.01;
  const parts: Part[] = [
    { geo: box(7.4, h, 1.5), color: "#fff1f3", at: [0, mid, z] },
    { geo: box(7.6, 0.1, 1.64), color: TRIM, at: [0, COUNTER_TOP - 0.03, z] },
    { geo: box(7.4, 0.06, 0.02), color: "#fbe1e8", at: [0, COUNTER_TOP - 0.3, front] },
  ];
  // soft vertical panels on the front
  for (let i = -6; i <= 6; i++) parts.push({ geo: box(0.05, h - 0.4, 0.02), color: "#fbe1e8", at: [i * 0.55, mid - 0.15, front] });
  return colored(parts);
}

function awningGeo(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let i = -7; i <= 7; i++) {
    const c = i % 2 === 0 ? TRIM : C.white;
    parts.push({ geo: box(0.6, 0.7, 0.06), color: c, at: [i * 0.6, 0.35, 0] });
    // scalloped edge: a half-round at the bottom of each stripe
    parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16, 1, false, 0, Math.PI), color: c, at: [i * 0.6, 0, 0], rot: [Math.PI / 2, 0, Math.PI / 2] });
  }
  return colored(parts);
}

function shelfGeo(): THREE.BufferGeometry {
  const jar = (x: number, h: number, fill: string): Part[] => [
    { geo: cyl(0.14, 0.14, h, 18), color: fill, at: [x, h / 2 + 0.05, 0] },
    { geo: cyl(0.15, 0.15, 0.06, 18), color: C.white, at: [x, h + 0.08, 0] },
  ];
  return colored([
    { geo: box(1.5, 0.08, 0.36), color: "#f0c8d4", at: [0, 0, 0] },
    ...jar(-0.45, 0.36, C.pink),
    ...jar(0, 0.28, C.butter),
    ...jar(0.45, 0.36, C.mint),
  ]);
}

function cakeGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cyl(0.74, 0.7, 0.06, 32), color: C.lilacLight, at: [0, 0.03, 0] },
    { geo: cyl(0.55, 0.55, 0.36, 32), color: SPONGE, at: [0, 0.24, 0] },
    { geo: new THREE.TorusGeometry(0.556, 0.03, 8, 40), color: "#fff3d6", at: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.575, 0.575, 0.08, 32), color: ICING, at: [0, 0.44, 0] },
    { geo: ball(0.575, 32, 12), color: ICING, at: [0, 0.47, 0], scale: [1, 0.12, 1] },
  ];
  // icing drips around the rim
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push({ geo: ball(0.07, 10, 8), color: ICING, at: [Math.cos(a) * 0.56, 0.38 - (i % 3) * 0.03, Math.sin(a) * 0.56], scale: [1, 1.5, 1] });
  }
  return colored(parts);
}

/** Each topping stands on y = 0 (the cake's top surface). */
function toppingGeo(kind: ToppingKind): THREE.BufferGeometry {
  switch (kind) {
    case "strawberry":
      return colored([
        { geo: ball(0.12), color: "#ff5f7e", at: [0, 0.13, 0], scale: [1, 1.15, 1] },
        { geo: ball(0.05, 8, 6), color: "#4caf50", at: [0.05, 0.26, 0], scale: [1, 0.4, 0.6] },
        { geo: ball(0.05, 8, 6), color: "#4caf50", at: [-0.05, 0.26, 0], scale: [1, 0.4, 0.6] },
        { geo: ball(0.05, 8, 6), color: "#4caf50", at: [0, 0.26, 0.05], scale: [0.6, 0.4, 1] },
        { geo: ball(0.016, 6, 4), color: "#fff3a8", at: [-0.05, 0.16, 0.1] },
        { geo: ball(0.016, 6, 4), color: "#fff3a8", at: [0.05, 0.12, 0.1] },
        { geo: ball(0.016, 6, 4), color: "#fff3a8", at: [0, 0.07, 0.11] },
      ]);
    case "cherry":
      return colored([
        { geo: ball(0.1), color: "#e2304f", at: [0, 0.1, 0] },
        { geo: cyl(0.012, 0.012, 0.22, 6), color: "#3f7d38", at: [0.04, 0.29, 0], rot: [0, 0, -0.35] },
        { geo: ball(0.035, 8, 6), color: C.white, at: [-0.04, 0.14, 0.07] },
      ]);
    case "sprinkles": {
      const cols = ["#7a5cf0", "#2fb67c", "#ffd34d", "#ff5f7e", C.lilacDeep, "#ff9fd0"];
      return colored(
        cols.map((c, i) => {
          const a = (i / cols.length) * Math.PI * 2;
          const r = 0.06 + (i % 2) * 0.06;
          return { geo: new THREE.CapsuleGeometry(0.015, 0.06, 2, 6), color: c, at: [Math.cos(a) * r, 0.02, Math.sin(a) * r] as [number, number, number], rot: [Math.PI / 2, 0, a] as [number, number, number] };
        }),
      );
    }
    case "cream":
      return colored([
        { geo: ball(0.14), color: "#fffdf5", at: [0, 0.06, 0], scale: [1, 0.5, 1] },
        { geo: ball(0.1), color: "#fffdf5", at: [0, 0.14, 0], scale: [1, 0.6, 1] },
        { geo: ball(0.065), color: "#fffdf5", at: [0, 0.21, 0], scale: [1, 0.8, 1] },
        { geo: new THREE.ConeGeometry(0.035, 0.08, 10), color: "#fffdf5", at: [0.01, 0.28, 0], rot: [0, 0, -0.3] },
      ]);
    case "candy":
      return colored([
        { geo: ball(0.1), color: "#ffe066", at: [0, 0.1, 0] },
        { geo: new THREE.TorusGeometry(0.065, 0.016, 8, 20), color: "#ff6f9f", at: [0, 0.1, 0.06] },
        { geo: ball(0.02, 8, 6), color: "#ff6f9f", at: [0, 0.1, 0.1] },
      ]);
  }
}

/** The shop behind the counter: striped wall, awning and a shelf of jars (one static set). */
export function ShopBack({ shelfX = -2.6 }: { shelfX?: number }) {
  const kit = useKit();
  const geo = useMemo(
    () => ({
      awning: kit.geo("bakery-awning", awningGeo),
      shelf: kit.geo("bakery-shelf", shelfGeo),
    }),
    [kit],
  );
  const wall = useMemo(() => {
    const tex = kit.tex("bakery-wall", () => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 8;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.fillStyle = "#ffeef1";
      g.fillRect(0, 0, 64, 8);
      g.fillStyle = "#ffdfe6";
      g.fillRect(32, 0, 32, 8);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(9, 1);
      t.magFilter = THREE.NearestFilter;
      return t;
    });
    return kit.own(new THREE.MeshBasicMaterial({ map: tex }));
  }, [kit]);
  const clay = kit.clay(C.white, { vertexColors: true, emissive: "#ffffff", emissiveIntensity: 0.3 });
  return (
    <group>
      <mesh geometry={kit.plane()} material={wall} position={[0, 2.2, -2.2]} scale={[16, 5.6, 1]} />
      <mesh geometry={geo.awning} material={clay} position={[0, 2.85, -1.6]} rotation-x={0.3} />
      <mesh geometry={geo.shelf} material={clay} position={[shelfX, 1.85, -2.0]} />
    </group>
  );
}

export function Counter() {
  const kit = useKit();
  const geo = useMemo(() => kit.geo("bakery-counter", counterGeo), [kit]);
  return <mesh geometry={geo} material={kit.clay(C.white, { vertexColors: true, emissive: "#ffffff", emissiveIntensity: 0.3 })} receiveShadow />;
}

/** The cake on its plate (the scene places toppings on its top, `CAKE_TOP` above the plate). */
export function Cake() {
  const kit = useKit();
  const geo = useMemo(() => kit.geo("bakery-cake", cakeGeo), [kit]);
  return <mesh geometry={geo} material={kit.clay(C.white, { vertexColors: true })} castShadow />;
}

/** One topping, always shown (still scenes such as the result celebration). */
export function Topping({ kind }: { kind: ToppingKind }) {
  const kit = useKit();
  return <mesh geometry={kit.geo(`bakery-top-${kind}`, () => toppingGeo(kind))} material={kit.clay(C.white, { vertexColors: true })} castShadow />;
}

/** One topping of each kind in a group; the scene shows the one it needs (no React render per frame). */
export function ToppingSet({ set }: { set: (index: number, mesh: THREE.Mesh | null) => void }) {
  const kit = useKit();
  const kinds = TOPPING_KINDS;
  const mat = kit.clay(C.white, { vertexColors: true });
  return (
    <group>
      {kinds.map((k, i) => (
        <mesh
          key={k}
          ref={(m) => {
            set(i, m);
          }}
          geometry={kit.geo(`bakery-top-${k}`, () => toppingGeo(k))}
          material={mat}
          visible={false}
          castShadow
        />
      ))}
    </group>
  );
}

