import * as THREE from "three";
import { BRANCH_END, cargoById, JUNCTION, stopSpot, type CargoId } from "../../data/trainCargo";
import { TRAIN_LEGS } from "../../logic/train";

/** Half the distance between the rails. */
export const GAUGE = 0.22;

export const v3 = (p: { x: number; z: number }, y = 0) => new THREE.Vector3(p.x, y, p.z);

/** The path the train runs for this cargo: a lead-in behind the depot, the stops, the branch to the receiver, a buffer. */
export function lineFor(cargo: CargoId): THREE.CatmullRomCurve3 {
  const end = stopSpot(cargo, TRAIN_LEGS);
  const pts = [v3({ x: 0, z: 2.8 }), ...[0, 1, 2, 3, 4].map((s) => v3(stopSpot(cargo, s))), v3({ x: end.x * 1.15, z: end.z - 1.2 })];
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

/** The other branch (the one this delivery does not take): it leaves the junction the other way. */
export function otherBranch(cargo: CargoId): THREE.CatmullRomCurve3 {
  const other = BRANCH_END[cargoById(cargo).branch === "left" ? "right" : "left"];
  const mid = { x: (JUNCTION.x + other.x) / 2 + Math.sign(other.x) * 0.25, z: (JUNCTION.z + other.z) / 2 };
  return new THREE.CatmullRomCurve3([v3(stopSpot(cargo, 2)), v3(JUNCTION), v3(mid), v3(other), v3({ x: other.x * 1.15, z: other.z - 1.2 })], false, "centripetal");
}

/** Arc-length position (0…1) of the point of `curve` nearest to `p`. */
export function uOf(curve: THREE.CatmullRomCurve3, p: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  const q = new THREE.Vector3();
  for (let i = 0; i <= 600; i++) {
    const u = i / 600;
    curve.getPointAt(u, q);
    const d = q.distanceToSquared(p);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/** Two rails (tubes) and the sleepers of one stretch of track, from u0 to u1. */
export function railGeometry(curve: THREE.CatmullRomCurve3, u0: number, u1: number) {
  const n = Math.max(8, Math.round((u1 - u0) * curve.getLength() * 10));
  const left: THREE.Vector3[] = [];
  const right: THREE.Vector3[] = [];
  const sleepers: { x: number; z: number; ry: number }[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = u0 + ((u1 - u0) * i) / n;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const nx = -t.z;
    const nz = t.x;
    const len = Math.hypot(nx, nz) || 1;
    left.push(new THREE.Vector3(p.x + (nx / len) * GAUGE, 0.07, p.z + (nz / len) * GAUGE));
    right.push(new THREE.Vector3(p.x - (nx / len) * GAUGE, 0.07, p.z - (nz / len) * GAUGE));
    if (i % 3 === 0) sleepers.push({ x: p.x, z: p.z, ry: Math.atan2(t.x, t.z) });
  }
  const tube = (pts: THREE.Vector3[]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.022, 6, false);
  return { left: tube(left), right: tube(right), sleepers };
}

