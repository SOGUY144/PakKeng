import * as THREE from "three";
import { C } from "../palette";
import { colored, type Part } from "../shapes";

/**
 * โมเดลของหอคอยเมฆ (ดินปั้นสีพาสเทล เหมือนโลกเกมอื่น) — สร้างด้วยโค้ดจากทรงกลมหลายลูกแล้วรวมเป็น geometry เดียวพร้อมสีต่อ vertex
 * - แท่นเมฆ: พื้นที่ยืนอยู่ที่ y = 0 กว้างใหญ่กว่าตัวละครชัดเจน (silhouette อ่านง่ายแม้จอเล็ก) ท้องเมฆสีม่วงอ่อนให้รู้ว่าลอยอยู่
 * - เสาเมฆตรงกลางทำให้ทั้งหมดอ่านเป็น “หอคอย” · ของประดับแต่ละชั้น: ธงสายรุ้ง (ทางซ้าย) หรือโคมดาว (ทางขวา)
 * - ยอด: สายรุ้งโค้ง หรือพระจันทร์ยิ้ม · ลิฟต์เมฆก้อนเล็กสำหรับการข้ามชั้น
 * หน่วย: 1 ≈ ความสูงตัวกระต่าย
 */
type Detail = { w: number; h: number };

const ball = (d: Detail) => new THREE.SphereGeometry(1, d.w, d.h);
const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** A puffy cloud platform. The child's character stands on y = 0; `radius` = half the width. */
export function cloudPlatform(radius: number, d: Detail): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: ball(d), color: C.white, at: [0, -0.2, 0], scale: [radius, 0.22, radius * 0.78] }];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.35;
    const r = radius * (0.25 + (i % 3) * 0.04);
    parts.push({
      geo: ball(d),
      color: i % 2 ? C.white : C.cream,
      at: [Math.cos(a) * radius * 0.84, -0.21 + (i % 2) * 0.03, Math.sin(a) * radius * 0.64],
      scale: [r, r * 0.78, r],
    });
  }
  // the soft lilac belly underneath: a clay cloud lit from above, floating
  parts.push({ geo: ball(d), color: C.lilacLight, at: [0, -0.42, 0], scale: [radius * 0.8, 0.2, radius * 0.6] });
  parts.push({ geo: ball(d), color: C.lilac, at: [radius * 0.36, -0.5, 0.06], scale: [radius * 0.42, 0.15, radius * 0.36] });
  parts.push({ geo: ball(d), color: C.lilacLight, at: [-radius * 0.38, -0.48, -0.02], scale: [radius * 0.44, 0.16, radius * 0.38] });
  return colored(parts);
}

/** The tall soft column behind the clouds: it makes the climb read as one tower. */
export function cloudPillar(height: number, d: Detail): THREE.BufferGeometry {
  // one colour, a soft core and overlapping puffs (a cloud that grew tall); lilac and behind, so the white clouds the
  // child stands on stay the brightest thing in the scene
  const parts: Part[] = [{ geo: new THREE.CapsuleGeometry(0.34, height + 0.4, 6, Math.max(12, d.w - 6)), color: C.lilacLight, at: [0, height / 2 - 0.5, 0] }];
  let i = 0;
  for (let y = -0.7; y < height + 0.2; y += 0.42, i++) {
    const r = 0.44 - (Math.max(0, y) / height) * 0.1;
    parts.push({ geo: ball(d), color: C.lilacLight, at: [Math.sin(i * 2.1) * 0.09, y, Math.cos(i * 1.7) * 0.05], scale: [r, r * 0.86, r * 0.82] });
  }
  return colored(parts);
}

/** Left path keepsake: a little pennant with three rainbow stripes. Dim = not reached by a jump (grey clay). */
export function rainbowFlag(lit: boolean): THREE.BufferGeometry {
  const stripes = lit ? [C.pink, C.butter, C.mint] : [C.stone, C.creamShade, C.stone];
  const parts: Part[] = [
    { geo: cyl(0.026, 0.032, 0.64, 8), color: lit ? C.wood : C.stoneDeep, at: [0, 0.32, 0] },
    { geo: new THREE.SphereGeometry(0.05, 10, 8), color: lit ? C.gold : C.stone, at: [0, 0.66, 0] },
  ];
  stripes.forEach((c, i) => parts.push({ geo: new THREE.BoxGeometry(0.34, 0.075, 0.03), color: c, at: [0.19, 0.57 - i * 0.075, 0] }));
  return colored(parts);
}

function starShape(outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Right path keepsake: a star lantern on a short post. Dim = not reached by a jump (grey clay). */
export function starLantern(lit: boolean): THREE.BufferGeometry {
  const star = new THREE.ExtrudeGeometry(starShape(0.17, 0.08), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 4 });
  star.center();
  return colored([
    { geo: cyl(0.024, 0.03, 0.5, 8), color: lit ? C.wood : C.stoneDeep, at: [0, 0.25, 0] },
    { geo: star, color: lit ? C.gold : C.stone, at: [0, 0.64, 0] },
  ]);
}

/** Left path top: a rainbow arch standing on the top cloud. */
export function rainbowArch(d: Detail): THREE.BufferGeometry {
  const bands = [C.pink, C.butter, C.mint, C.lilacDeep];
  const seg = Math.max(24, d.w + 8);
  const parts: Part[] = bands.map((c, i) => ({ geo: new THREE.TorusGeometry(0.78 - i * 0.12, 0.065, 8, seg, Math.PI), color: c }));
  // little clouds at both feet
  parts.push({ geo: ball(d), color: C.white, at: [0.62, 0.02, 0.05], scale: [0.2, 0.14, 0.16] });
  parts.push({ geo: ball(d), color: C.white, at: [-0.62, 0.02, 0.05], scale: [0.2, 0.14, 0.16] });
  return colored(parts);
}

/** Right path top: a round smiling moon. */
export function smilingMoon(d: Detail): THREE.BufferGeometry {
  return colored([
    { geo: ball(d), color: C.butter, at: [0, 0.48, 0], scale: 0.42 },
    { geo: new THREE.SphereGeometry(0.045, 10, 8), color: C.ink, at: [-0.13, 0.55, 0.38] },
    { geo: new THREE.SphereGeometry(0.045, 10, 8), color: C.ink, at: [0.13, 0.55, 0.38] },
    { geo: new THREE.TorusGeometry(0.11, 0.022, 6, 16, Math.PI), color: C.ink, at: [0, 0.43, 0.39], rot: [0, 0, Math.PI] },
    { geo: new THREE.SphereGeometry(0.06, 10, 8), color: C.pinkSoft, at: [-0.24, 0.45, 0.32], scale: [1, 0.6, 0.5] },
    { geo: new THREE.SphereGeometry(0.06, 10, 8), color: C.pinkSoft, at: [0.24, 0.45, 0.32], scale: [1, 0.6, 0.5] },
  ]);
}
