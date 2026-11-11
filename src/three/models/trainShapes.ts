import * as THREE from "three";
import { C } from "../palette";
import { colored, tree, type Part } from "../shapes";

/**
 * Geometry of the delivery train's clay models (merged, vertex-coloured; built once per canvas through the kit).
 * The engine faces −z (the way it runs). Unit: 1 ≈ the bunny's height.
 */
export const RED = "#f06c8a";
export const RED_DEEP = "#c94a6b";
export const CAB = "#b9a6f2";
export const WHEEL = "#4a3f5c";
export const RIM = "#ffd877";

export type Detail = { w: number; h: number };

export function locoBody(d: Detail): THREE.BufferGeometry {
  const boiler = new THREE.CylinderGeometry(0.27, 0.27, 0.95, Math.max(16, d.w));
  const parts: Part[] = [
    // chassis
    { geo: new THREE.BoxGeometry(0.62, 0.12, 1.32), color: RED_DEEP, at: [0, 0.2, 0] },
    // boiler lying along z (front = −z), with a darker smokebox ring at the front
    { geo: boiler, color: RED, at: [0, 0.48, -0.2], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.CylinderGeometry(0.285, 0.285, 0.1, Math.max(16, d.w)), color: RED_DEEP, at: [0, 0.48, -0.66], rot: [Math.PI / 2, 0, 0] },
    // round nose with a lamp
    { geo: new THREE.SphereGeometry(0.22, d.w, d.h), color: C.ink, at: [0, 0.48, -0.7], scale: [1, 1, 0.35] },
    { geo: new THREE.SphereGeometry(0.075, 12, 9), color: C.butter, at: [0, 0.6, -0.76] },
    // chimney (the steam comes out here) and a little dome
    { geo: new THREE.CylinderGeometry(0.1, 0.075, 0.28, 12), color: C.ink, at: [0, 0.86, -0.42] },
    { geo: new THREE.CylinderGeometry(0.14, 0.14, 0.05, 12), color: C.ink, at: [0, 1.0, -0.42] },
    { geo: new THREE.SphereGeometry(0.1, 12, 9), color: RIM, at: [0, 0.78, -0.05] },
    // cowcatcher
    { geo: new THREE.ConeGeometry(0.26, 0.24, 4, 1), color: RIM, at: [0, 0.2, -0.78], rot: [-Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.6] },
    // cab at the back: walls, roof (the child's character stands inside, head above the wall)
    { geo: new THREE.BoxGeometry(0.62, 0.36, 0.08), color: CAB, at: [0, 0.44, 0.25] },
    { geo: new THREE.BoxGeometry(0.62, 0.36, 0.08), color: CAB, at: [0, 0.44, 0.62] },
    { geo: new THREE.BoxGeometry(0.08, 0.36, 0.45), color: CAB, at: [-0.27, 0.44, 0.44] },
    { geo: new THREE.BoxGeometry(0.08, 0.36, 0.45), color: CAB, at: [0.27, 0.44, 0.44] },
    { geo: new THREE.BoxGeometry(0.08, 0.5, 0.08), color: CAB, at: [-0.27, 0.86, 0.27] },
    { geo: new THREE.BoxGeometry(0.08, 0.5, 0.08), color: CAB, at: [0.27, 0.86, 0.27] },
    { geo: new THREE.BoxGeometry(0.08, 0.5, 0.08), color: CAB, at: [-0.27, 0.86, 0.62] },
    { geo: new THREE.BoxGeometry(0.08, 0.5, 0.08), color: CAB, at: [0.27, 0.86, 0.62] },
    { geo: new THREE.BoxGeometry(0.74, 0.07, 0.56), color: RED, at: [0, 1.12, 0.45] },
  ];
  return colored(parts);
}

export function wagonBody(): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.BoxGeometry(0.62, 0.12, 0.9), color: RED_DEEP, at: [0, 0.2, 0] },
    { geo: new THREE.BoxGeometry(0.62, 0.22, 0.86), color: C.wood, at: [0, 0.37, 0] },
    { geo: new THREE.BoxGeometry(0.66, 0.05, 0.9), color: C.woodDeep, at: [0, 0.49, 0] },
    // the coupling to the engine
    { geo: new THREE.BoxGeometry(0.08, 0.06, 0.3), color: WHEEL, at: [0, 0.2, -0.55] },
  ]);
}

export function wheelGeo(d: Detail): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.CylinderGeometry(0.13, 0.13, 0.07, Math.max(14, d.w - 6)), color: WHEEL, rot: [0, 0, Math.PI / 2] },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), color: RIM, rot: [0, 0, Math.PI / 2] },
    // a spoke so the turning shows
    { geo: new THREE.BoxGeometry(0.075, 0.2, 0.03), color: RIM },
  ]);
}

/** The cargo the child picked, sitting on the wagon (its base at y = 0). */
export function cargoGeo(id: string, d: Detail): THREE.BufferGeometry {
  if (id === "flowers") {
    const parts: Part[] = [{ geo: new THREE.CylinderGeometry(0.2, 0.15, 0.22, 16), color: C.wood, at: [0, 0.11, 0] }];
    const petals = [C.pink, C.butter, C.lilacDeep, C.raspberry, C.white];
    petals.forEach((c, i) => {
      const a = (i / petals.length) * Math.PI * 2;
      const x = Math.cos(a) * 0.1;
      const z = Math.sin(a) * 0.1;
      parts.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), color: C.leafDeep, at: [x, 0.34, z] });
      parts.push({ geo: new THREE.SphereGeometry(0.075, 10, 8), color: c, at: [x, 0.5, z] });
      parts.push({ geo: new THREE.SphereGeometry(0.03, 8, 6), color: C.gold, at: [x, 0.53, z + 0.05] });
    });
    parts.push({ geo: new THREE.SphereGeometry(0.06, 10, 8), color: C.leaf, at: [0.1, 0.3, -0.12], scale: [1, 0.5, 1.6] });
    return colored(parts);
  }
  // watermelon: a big striped green ball with a slice beside it
  const parts: Part[] = [{ geo: new THREE.SphereGeometry(0.27, d.w, d.h), color: "#5fa955", at: [0, 0.25, 0], scale: [1, 0.88, 1.15] }];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    parts.push({ geo: new THREE.TorusGeometry(0.262, 0.018, 6, 24, Math.PI), color: "#3f7d38", at: [0, 0.25, 0], rot: [0, a, Math.PI / 2], scale: [1, 0.88, 1.15] });
  }
  parts.push({ geo: new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6), color: C.bark, at: [0, 0.5, 0] });
  return colored(parts);
}

/** A station sign post: a pole with a round board (the stop's flag pops up beside it when the train arrives by voice). */
export function stationGeo(): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.BoxGeometry(0.9, 0.08, 0.5), color: C.path, at: [0, 0.04, 0] },
    { geo: new THREE.BoxGeometry(0.9, 0.03, 0.05), color: C.pathEdge, at: [0, 0.09, -0.24] },
    { geo: new THREE.CylinderGeometry(0.03, 0.035, 0.7, 8), color: C.woodDeep, at: [0.36, 0.43, 0.12] },
    { geo: new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), color: C.cream, at: [0.36, 0.82, 0.12], rot: [Math.PI / 2, 0, 0] },
    { geo: new THREE.CylinderGeometry(0.12, 0.12, 0.055, 20), color: C.lilacDeep, at: [0.36, 0.82, 0.12], rot: [Math.PI / 2, 0, 0] },
  ]);
}

/** Beach for the turtle's station (sand, a little water edge, an umbrella). */
export function beachGeo(d: Detail): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.CylinderGeometry(1.25, 1.3, 0.08, Math.max(24, d.w)), color: "#f6e3b4", at: [0, 0.04, 0] },
    { geo: new THREE.CylinderGeometry(0.7, 0.72, 0.03, Math.max(20, d.w)), color: C.water, at: [-0.45, 0.07, -0.55] },
    { geo: new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), color: C.wood, at: [0.7, 0.5, -0.3] },
    { geo: new THREE.ConeGeometry(0.5, 0.22, 10, 1), color: C.pink, at: [0.7, 1.02, -0.3] },
    { geo: new THREE.SphereGeometry(0.08, 10, 8), color: C.white, at: [0.7, 1.13, -0.3] },
  ]);
}

/** Big tree for the bird's station. */
export function bigTreeGeo(): THREE.BufferGeometry {
  return tree();
}

