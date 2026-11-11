import * as THREE from "three";
import type { TripId } from "../../data/trips";
import { C } from "../palette";
import * as S from "../shapes";

/**
 * Where the balloons are delivered (บอลลูน): one vertex-coloured mesh per destination, shared by the game scene and the
 * picker / end-card stills, so the child picks the very place the balloon then flies to. The porch / gallery / cloud
 * edge sits at BALLOON_TOP_Y just right of the route (x ≈ 2).
 */
export const BALLOON_TOP_Y = 3.6;
const TOP_Y = BALLOON_TOP_Y;

const cyl = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const ball = (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, seg = 12) => new THREE.ConeGeometry(r, h, seg);

/* Destinations (one vertex-coloured mesh each). The porch / gallery / cloud edge sits at TOP_Y just right of the route. */

function treehouse(): THREE.BufferGeometry {
  const P = TOP_Y;
  const parts: S.Part[] = [
    { geo: cyl(0.17, 0.26, P + 0.5, 12), color: C.bark, at: [2.0, (P + 0.5) / 2, -0.3] },
    { geo: ball(0.2), color: C.bark, at: [1.8, 0.05, -0.15], scale: [1.4, 0.5, 1] },
    { geo: ball(0.2), color: C.bark, at: [2.22, 0.05, -0.2], scale: [1.3, 0.5, 1] },
    { geo: cyl(0.05, 0.07, 1.13, 8), color: C.bark, at: [1.5, P - 0.5, -0.2], rot: [0, 0, Math.PI / 4] },
    // leaves along the trunk, so it reads as a tree from the ground up
    { geo: ball(0.42), color: C.leaf, at: [2.35, 2.1, -0.55] },
    { geo: ball(0.3), color: C.leafLight, at: [1.72, 1.5, -0.5] },
    // porch with a front rail
    { geo: box(1.9, 0.12, 1.15), color: C.wood, at: [1.84, P - 0.06, -0.2] },
    { geo: box(1.9, 0.05, 0.05), color: C.woodDeep, at: [1.84, P + 0.27, 0.34] },
    // the house and the canopy behind it
    { geo: box(0.92, 0.72, 0.72), color: "#f0c48f", at: [2.08, P + 0.36, -0.3] },
    { geo: cone(0.72, 0.52, 4), color: C.raspberry, at: [2.08, P + 0.98, -0.3], rot: [0, Math.PI / 4, 0] },
    { geo: box(0.26, 0.42, 0.03), color: C.woodDeep, at: [1.88, P + 0.21, 0.07] },
    { geo: box(0.22, 0.2, 0.03), color: C.butter, at: [2.31, P + 0.45, 0.07] },
    { geo: ball(0.78), color: C.leaf, at: [2.28, P + 0.95, -0.95] },
    { geo: ball(0.55), color: C.leafLight, at: [1.5, P + 0.7, -0.95] },
    { geo: ball(0.48), color: C.leafDeep, at: [2.74, P + 0.45, -0.75] },
    { geo: ball(0.45), color: C.leafLight, at: [2.02, P + 1.45, -0.85] },
  ];
  for (const x of [0.95, 1.55, 2.15, 2.72]) parts.push({ geo: cyl(0.025, 0.025, 0.28, 6), color: C.woodDeep, at: [x, P + 0.14, 0.34] });
  return S.colored(parts);
}

function lighthouse(): THREE.BufferGeometry {
  const P = TOP_Y;
  const rail = "#5b5068";
  const parts: S.Part[] = [
    { geo: ball(0.7, 12, 8), color: C.stoneDeep, at: [2.0, 0.08, -0.3], scale: [1.25, 0.45, 1] },
    { geo: ball(0.4, 10, 7), color: C.stone, at: [1.35, 0.06, 0.05], scale: [1, 0.5, 0.9] },
    { geo: ball(0.35, 10, 7), color: C.stone, at: [2.7, 0.05, 0.1], scale: [1, 0.5, 0.9] },
  ];
  // the tower: tapering bands, raspberry and cream
  const bands = 7;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * P;
    const y1 = ((i + 1) / bands) * P;
    parts.push({ geo: cyl(0.58 - 0.18 * ((i + 1) / bands), 0.58 - 0.18 * (i / bands), y1 - y0, 20), color: i % 2 ? C.cream : C.raspberry, at: [2.0, (y0 + y1) / 2, -0.3] });
  }
  parts.push(
    { geo: box(0.16, 0.24, 0.03), color: rail, at: [2.0, P * 0.55, 0.18] },
    // gallery (the delivery porch), rail, lamp room, dome
    { geo: cyl(0.92, 0.92, 0.1, 28), color: rail, at: [2.0, P - 0.05, -0.3] },
    { geo: new THREE.TorusGeometry(0.88, 0.025, 6, 32), color: rail, at: [2.0, P + 0.3, -0.3], rot: [Math.PI / 2, 0, 0] },
    { geo: cyl(0.32, 0.34, 0.55, 18), color: C.butter, at: [2.0, P + 0.3, -0.3] },
    { geo: new THREE.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: C.raspberry, at: [2.0, P + 0.57, -0.3] },
    { geo: ball(0.07, 8, 6), color: C.gold, at: [2.0, P + 1.0, -0.3] },
  );
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    parts.push({ geo: cyl(0.02, 0.02, 0.3, 5), color: rail, at: [2.0 + Math.cos(a) * 0.88, P + 0.15, -0.3 + Math.sin(a) * 0.88] });
  }
  return S.colored(parts);
}

function cloudCastle(): THREE.BufferGeometry {
  const P = TOP_Y;
  const puff = (x: number, y: number, z: number, r: number, color: string = C.white): S.Part => ({ geo: ball(r), color, at: [x, y, z], scale: [1, 0.62, 0.9] });
  return S.colored([
    puff(2.0, P - 0.2, -0.35, 0.95),
    puff(1.42, P - 0.25, -0.1, 0.5),
    puff(2.6, P - 0.22, -0.15, 0.6),
    puff(1.7, P - 0.48, 0.2, 0.48, C.lilacLight),
    puff(2.36, P - 0.5, 0.25, 0.5, C.lilacLight),
    puff(2.78, P - 0.45, -0.5, 0.45, C.lilacLight),
    { geo: box(0.7, 0.8, 0.6), color: C.lilac, at: [2.0, P + 0.4, -0.4] },
    { geo: cone(0.5, 0.5, 4), color: C.lilacDeep, at: [2.0, P + 1.05, -0.4], rot: [0, Math.PI / 4, 0] },
    { geo: cyl(0.17, 0.19, 1.15), color: C.cream, at: [1.5, P + 0.5, -0.25] },
    { geo: cone(0.24, 0.45, 14), color: C.pink, at: [1.5, P + 1.3, -0.25] },
    { geo: cyl(0.17, 0.19, 1.15), color: C.cream, at: [2.5, P + 0.5, -0.25] },
    { geo: cone(0.24, 0.45, 14), color: C.pink, at: [2.5, P + 1.3, -0.25] },
    { geo: box(0.22, 0.32, 0.03), color: C.lilacDeep, at: [2.0, P + 0.16, -0.09] },
    { geo: box(0.08, 0.14, 0.03), color: C.butter, at: [1.5, P + 0.75, -0.07] },
    { geo: box(0.08, 0.14, 0.03), color: C.butter, at: [2.5, P + 0.75, -0.07] },
  ]);
}

/** No destination picked: a small cloud to tie up at. */
function cloudDock(): THREE.BufferGeometry {
  return S.colored([
    { geo: ball(0.6), color: C.white, at: [1.75, TOP_Y - 0.15, -0.3], scale: [1, 0.6, 0.9] },
    { geo: ball(0.42), color: C.white, at: [1.3, TOP_Y - 0.2, -0.1], scale: [1, 0.6, 0.9] },
    { geo: ball(0.45), color: C.lilacLight, at: [2.2, TOP_Y - 0.25, -0.1], scale: [1, 0.6, 0.9] },
  ]);
}

/** Map pin, tip at the origin: where the balloon is delivered. */
export function pinShape(): THREE.BufferGeometry {
  return S.colored([
    { geo: cone(0.115, 0.3, 14), color: C.raspberry, at: [0, 0.15, 0], rot: [Math.PI, 0, 0] },
    { geo: ball(0.16, 16, 12), color: C.raspberry, at: [0, 0.36, 0] },
    { geo: ball(0.062, 10, 8), color: C.cream, at: [0, 0.37, 0.125] },
  ]);
}

/** Small warm burner flame (butter yellow, never the orange of nasal values). */
export function flameShape(): THREE.BufferGeometry {
  return S.colored([
    { geo: cone(0.07, 0.2, 10), color: C.butter, at: [0, 0.12, 0] },
    { geo: ball(0.068, 10, 8), color: "#fff4c2", at: [0, 0.03, 0] },
  ]);
}

/** The destination of a trip (a small cloud to tie up at when none was picked). */
export function placeGeometry(id: TripId | null): THREE.BufferGeometry {
  return id === "treehouse" ? treehouse() : id === "lighthouse" ? lighthouse() : id === "cloud-castle" ? cloudCastle() : cloudDock();
}
