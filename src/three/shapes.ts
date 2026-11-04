import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { C } from "./palette";

/**
 * โมเดลประกอบฉาก (ต้นไม้ พุ่มไม้ ดอกไม้ เห็ด หิน เมฆ ฯลฯ) สร้างด้วยโค้ดจากรูปทรงมนหลายชิ้น
 * แล้วรวมเป็น geometry เดียวพร้อมสีต่อ vertex → วาดซ้ำหลายชิ้นด้วย InstancedMesh ได้ใน draw call เดียว
 * หน่วย: 1 ≈ ความสูงตัวกระต่าย, พื้นอยู่ที่ y = 0
 */
type V3 = [number, number, number];

export interface Part {
  geo: THREE.BufferGeometry;
  color: string;
  at?: V3;
  scale?: number | V3;
  rot?: V3;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Merge primitive parts into one vertex-coloured geometry. Source geometries are disposed. */
export function colored(parts: Part[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    p.geo.dispose();
    if (g.getAttribute("uv")) g.deleteAttribute("uv");
    const s = p.scale ?? 1;
    tmpS.set(...(typeof s === "number" ? ([s, s, s] as V3) : s));
    tmpQ.setFromEuler(tmpE.set(...(p.rot ?? [0, 0, 0])));
    tmpP.set(...(p.at ?? [0, 0, 0]));
    g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS));
    const col = new THREE.Color(p.color);
    const n = g.getAttribute("position").count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  if (!merged) throw new Error("mergeGeometries failed");
  merged.computeBoundingSphere();
  return merged;
}

/** Low-poly sphere for decor (instanced many times). */
const ball = (r: number, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const dome = (r: number, w = 14, h = 6) => new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

export function tree(): THREE.BufferGeometry {
  return colored([
    { geo: cyl(0.075, 0.11, 0.72, 8), color: C.bark, at: [0, 0.36, 0] },
    { geo: ball(0.46, 12, 9), color: C.leaf, at: [0, 0.98, 0] },
    { geo: ball(0.34, 10, 8), color: C.leafLight, at: [-0.3, 0.8, 0.1] },
    { geo: ball(0.31, 10, 8), color: C.leafDeep, at: [0.29, 0.83, -0.06] },
    { geo: ball(0.23, 10, 7), color: C.leafLight, at: [0.06, 1.34, 0.06] },
  ]);
}

export function bush(): THREE.BufferGeometry {
  return colored([
    { geo: ball(0.32, 10, 8), color: C.leaf, at: [0, 0.2, 0], scale: [1, 0.85, 1] },
    { geo: ball(0.24, 10, 7), color: C.leafLight, at: [-0.29, 0.14, 0.06], scale: [1, 0.85, 1] },
    { geo: ball(0.26, 10, 7), color: C.leafDeep, at: [0.28, 0.15, -0.03], scale: [1, 0.85, 1] },
    { geo: ball(0.045, 8, 6), color: C.pink, at: [-0.12, 0.42, 0.17] },
    { geo: ball(0.045, 8, 6), color: C.white, at: [0.2, 0.34, 0.2] },
  ]);
}

export function flower(petal: string): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cyl(0.014, 0.018, 0.27, 5), color: C.leafDeep, at: [0, 0.135, 0] },
    { geo: ball(0.05, 6, 4), color: C.leaf, at: [0.05, 0.08, 0], scale: [1.3, 0.35, 0.7] },
    { geo: ball(0.046, 8, 5), color: C.butter, at: [0, 0.285, 0.004] },
  ];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({ geo: ball(0.05, 7, 5), color: petal, at: [Math.cos(a) * 0.06, 0.28, Math.sin(a) * 0.06], scale: [1, 0.5, 1] });
  }
  return colored(parts);
}

export function mushroom(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cyl(0.07, 0.09, 0.24, 10), color: C.cream, at: [0, 0.12, 0] },
    { geo: dome(0.21), color: C.raspberry, at: [0, 0.21, 0], scale: [1, 0.78, 1] },
  ];
  const dots: V3[] = [
    [0.08, 0.34, 0.1],
    [-0.11, 0.31, 0.07],
    [0.02, 0.37, -0.09],
    [0.13, 0.27, -0.08],
  ];
  for (const at of dots) parts.push({ geo: ball(0.032, 8, 6), color: C.white, at });
  return colored(parts);
}

export function rock(): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.IcosahedronGeometry(0.3, 1), color: C.stone, at: [0, 0.11, 0], scale: [1, 0.6, 0.85] },
    { geo: dome(0.17, 10, 4), color: C.moss, at: [0.03, 0.24, 0.02], scale: [1, 0.45, 0.9] },
  ]);
}

export function grassTuft(): THREE.BufferGeometry {
  const cone = () => new THREE.ConeGeometry(0.035, 0.24, 5);
  return colored([
    { geo: cone(), color: C.grassDeep, at: [0, 0.12, 0] },
    { geo: cone(), color: C.grassMid, at: [-0.05, 0.1, 0.02], rot: [0, 0, 0.35], scale: 0.85 },
    { geo: cone(), color: C.grassDeep, at: [0.05, 0.1, -0.01], rot: [0, 0, -0.3], scale: 0.9 },
  ]);
}

export function pebble(): THREE.BufferGeometry {
  return colored([{ geo: ball(0.07, 8, 6), color: C.pathEdge, at: [0, 0.02, 0], scale: [1, 0.45, 0.8] }]);
}

/** Lane marker: a soft flattened bar along +X. */
export function laneDash(): THREE.BufferGeometry {
  return colored([{ geo: new THREE.CapsuleGeometry(0.05, 0.42, 3, 8), color: C.pathLane, at: [0, 0.012, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.25] }]);
}

export function log(): THREE.BufferGeometry {
  return colored([
    { geo: cyl(0.13, 0.13, 0.62, 12), color: C.wood, at: [0, 0.13, 0], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.1, 0.1, 0.02, 12), color: C.butter, at: [0, 0.13, 0.31], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.1, 0.1, 0.02, 12), color: C.butter, at: [0, 0.13, -0.31], rot: [Math.PI / 2, 0, 0] },
    { geo: ball(0.06, 8, 6), color: C.moss, at: [0.02, 0.25, 0.08], scale: [1.4, 0.5, 1] },
  ]);
}

export function flowerPot(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cyl(0.13, 0.095, 0.2, 12), color: C.lilacDeep, at: [0, 0.1, 0] },
    { geo: cyl(0.145, 0.145, 0.05, 12), color: C.lilac, at: [0, 0.205, 0] },
    { geo: ball(0.15, 10, 7), color: C.leaf, at: [0, 0.27, 0], scale: [1, 0.6, 1] },
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push({ geo: ball(0.05, 8, 6), color: i === 1 ? C.butter : C.pink, at: [Math.cos(a) * 0.08, 0.34, Math.sin(a) * 0.08] });
  }
  return colored(parts);
}

export function cloud(): THREE.BufferGeometry {
  return colored([
    { geo: ball(0.55, 12, 9), color: C.white, at: [0, 0, 0], scale: [1, 0.8, 0.8] },
    { geo: ball(0.4, 12, 9), color: C.white, at: [-0.55, -0.08, 0.05], scale: [1, 0.8, 0.8] },
    { geo: ball(0.42, 12, 9), color: C.white, at: [0.56, -0.06, 0], scale: [1, 0.8, 0.8] },
    { geo: ball(0.36, 12, 9), color: C.lilacLight, at: [0.15, 0.32, -0.05], scale: [1, 0.8, 0.8] },
  ]);
}

/** Floating island for the fantasy sky: rocky cone underneath, grassy top, one small tree. */
export function island(): THREE.BufferGeometry {
  return colored([
    { geo: ball(0.95, 14, 9), color: C.stoneDeep, at: [0, -0.18, 0], scale: [1, 0.5, 1] },
    { geo: ball(0.6, 12, 8), color: C.stone, at: [0.05, -0.5, 0.05], scale: [1, 0.6, 1] },
    { geo: ball(0.3, 10, 7), color: C.stoneDeep, at: [-0.1, -0.78, 0], scale: [1, 0.7, 1] },
    { geo: ball(0.98, 14, 6), color: C.grass, at: [0, -0.02, 0], scale: [1, 0.2, 1] },
    { geo: cyl(0.04, 0.06, 0.4, 6), color: C.bark, at: [0.25, 0.2, -0.1] },
    { geo: ball(0.24), color: C.leaf, at: [0.25, 0.48, -0.1] },
    { geo: ball(0.16), color: C.leafLight, at: [0.08, 0.36, -0.05] },
    { geo: ball(0.08, 8, 6), color: C.pink, at: [-0.35, 0.08, 0.3] },
  ]);
}

export function hill(): THREE.BufferGeometry {
  return colored([
    { geo: ball(1, 18, 10), color: C.hill, at: [0, 0, 0], scale: [1, 0.55, 0.7] },
    { geo: ball(0.7, 14, 8), color: C.hillFar, at: [0.8, -0.05, -0.2], scale: [1, 0.5, 0.7] },
  ]);
}

/** Small 4-point sparkle (reward glints). */
export function sparkle(): THREE.BufferGeometry {
  return new THREE.OctahedronGeometry(1, 0);
}

/** Lily pad: a rounded disc with the classic notch, softly bevelled like a clay toy. Lies flat, top at y ≈ 0.05. */
export function lilyPad(radius = 0.55): THREE.BufferGeometry {
  const notch = 0.42;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.absarc(0, 0, radius, notch / 2, Math.PI * 2 - notch / 2, false);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 32 });
  return colored([
    { geo: g, color: C.pad, at: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] },
    // a lighter centre spot reads as the leaf's soft vein hub
    { geo: new THREE.CircleGeometry(0.12, 14), color: "#93d47c", at: [0, 0.081, 0], rot: [-Math.PI / 2, 0, 0] },
  ]);
}

export function reeds(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const blades: [number, number, number, number][] = [
    [0, 0, 0.9, 0],
    [0.08, 0.05, 0.7, 0.18],
    [-0.07, -0.04, 0.78, -0.16],
    [0.03, -0.08, 0.6, 0.1],
  ];
  for (const [x, z, h, lean] of blades) parts.push({ geo: new THREE.ConeGeometry(0.03, h, 5), color: C.reed, at: [x, h / 2, z], rot: [0, 0, lean] });
  parts.push({ geo: new THREE.CapsuleGeometry(0.035, 0.14, 3, 8), color: C.cattail, at: [0.0, 0.95, 0] });
  parts.push({ geo: new THREE.CapsuleGeometry(0.03, 0.1, 3, 8), color: C.cattail, at: [0.15, 0.74, 0.06], rot: [0, 0, 0.18] });
  return colored(parts);
}

export function lotus(): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: ball(0.05, 8, 6), color: C.butter, at: [0, 0.06, 0] }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push({ geo: ball(0.07, 8, 6), color: i % 2 ? C.lotus : C.pinkSoft, at: [Math.cos(a) * 0.07, 0.07, Math.sin(a) * 0.07], scale: [0.7, 1.3, 0.7], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  return colored(parts);
}

/** Hot-air balloon envelope: teardrop lathe with crisp gores (pink / cream / butter, as in the 2D art). */
export function balloonEnvelope(height = 1.3, radial = 36): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [0.15, 0],
    [0.3, 0.12],
    [0.53, 0.35],
    [0.7, 0.65],
    [0.78, 0.95],
    [0.76, 1.2],
    [0.66, 1.42],
    [0.48, 1.58],
    [0.25, 1.68],
    [0.001, 1.72],
  ];
  const k = height / 1.72;
  const lathe = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r * k, y * k)),
    radial,
  );
  const g = lathe.toNonIndexed();
  lathe.dispose();
  g.deleteAttribute("uv");
  const gores = [C.pink, C.cream, C.butter, C.cream];
  const cols = gores.map((c) => new THREE.Color(c));
  const pos = g.getAttribute("position");
  const color = new Float32Array(pos.count * 3);
  const n = 12;
  for (let f = 0; f < pos.count; f += 3) {
    let cx = 0;
    let cz = 0;
    for (let v = 0; v < 3; v++) {
      cx += pos.getX(f + v);
      cz += pos.getZ(f + v);
    }
    const a = (Math.atan2(cz, cx) + Math.PI * 2) % (Math.PI * 2);
    const c = cols[Math.floor((a / (Math.PI * 2)) * n) % cols.length];
    for (let v = 0; v < 3; v++) color.set([c.r, c.g, c.b], (f + v) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(color, 3)); // keeps the lathe's smooth normals
  return g;
}
