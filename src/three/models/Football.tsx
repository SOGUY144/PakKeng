import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bump, CALM, clamp01, damp, frameDt, seeded } from "../anim";
import type { Kit } from "../kit";
import { useKit } from "../kitContext";
import { C } from "../palette";
import { colored, type Part } from "../shapes";

type V3 = [number, number, number];

/*
 * ของในสนามยิงจุดโทษ (ดินปั้นชุดเดียวกับฉากอื่น): ลูกบอล ประตู + ตาข่าย เส้นสนาม อัฒจันทร์ + กองเชียร์ ธงมุมสนาม ถ้วยรางวัล
 * ของที่อยู่นิ่งรวมเป็น geometry เดียวพร้อมสีต่อ vertex (หนึ่ง draw call ต่อชิ้น) · สีทีมใช้กับตาข่าย/โครงประตู ธง ป้าย และกองเชียร์
 * ไม่มีตัวหนังสือหรือตัวเลขในฉาก 3D · หน่วย: กระต่าย ≈ 1.6 สูง พื้นที่ y = 0 · เส้นประตูคือ z = 0 ตาข่ายอยู่ด้าน z < 0
 */

/** Inner half-width of the goal mouth; the goal line is z = 0 and the net is behind it (z < 0). */
export const GOAL_HALF_W = 1.9;
/** Height of the goal mouth (underside of the crossbar). */
export const GOAL_H = 1.45;
/** How far back the net reaches under the crossbar (top) and on the ground (bottom); the back net slopes between them. */
export const NET_TOP_D = 0.65;
export const NET_BOTTOM_D = 1.0;
export const BALL_R = 0.17;
/** The goal line runs out to the corner flags at x = ±CORNER_X. */
export const CORNER_X = 4.8;

const POST_R = 0.065;

/* ---------- Pitch: mown stripes, white lines, the grass around it (one mesh) ---------- */

const PITCH_END = -2.55;
const PITCH_NEAR = 18;
const PITCH_HALF = 11;
const STRIPE = 1.05;
const STRIPE_DARK = "#93ca70";
const LINE = 0.065;
const LINE_Y = 0.008;
/** Goal area (small box) and penalty area (big box), squeezed to the cartoon pitch. */
const AREA_HALF_W = 2.6;
const AREA_D = 0.95;
const BOX_HALF_W = 3.75;
const BOX_D = 4.5;
const ARC_R = 2.0;

/** A flat rectangle lying on the ground. */
function flat(w: number, d: number, x: number, z: number, color: string, y: number): Part {
  return { geo: new THREE.PlaneGeometry(w, d), color, at: [x, y, z], rot: [-Math.PI / 2, 0, 0] };
}

/** A white arc on the grass around (x, z); angle 0 = +x, −π/2 = towards the camera (+z). */
function arc(r: number, x: number, z: number, start: number, length: number): Part {
  return { geo: new THREE.RingGeometry(r - LINE / 2, r + LINE / 2, 32, 1, start, length), color: C.white, at: [x, LINE_Y, z], rot: [-Math.PI / 2, 0, 0] };
}

function pitchGeometry(spotZ: number): THREE.BufferGeometry {
  // the grass around the pitch sits a little lower so the two never fight
  const parts: Part[] = [flat(90, 80, 0, -22, C.grassMid, -0.03)];
  // mown stripes parallel to the goal line: horizontal bands from the TV view
  const n = Math.ceil((PITCH_NEAR - PITCH_END) / STRIPE);
  for (let i = 0; i < n; i++) {
    const z0 = PITCH_END + i * STRIPE;
    const z1 = Math.min(PITCH_NEAR, z0 + STRIPE);
    parts.push(flat(PITCH_HALF * 2, z1 - z0, 0, (z0 + z1) / 2, i % 2 ? STRIPE_DARK : C.grass, 0));
  }
  const line = (x0: number, z0: number, x1: number, z1: number) =>
    flat(Math.abs(x1 - x0) + LINE, Math.abs(z1 - z0) + LINE, (x0 + x1) / 2, (z0 + z1) / 2, C.white, LINE_Y);
  parts.push(
    line(-CORNER_X, 0, CORNER_X, 0),
    line(-CORNER_X, 0, -CORNER_X, PITCH_NEAR),
    line(CORNER_X, 0, CORNER_X, PITCH_NEAR),
    line(-AREA_HALF_W, 0, -AREA_HALF_W, AREA_D),
    line(AREA_HALF_W, 0, AREA_HALF_W, AREA_D),
    line(-AREA_HALF_W, AREA_D, AREA_HALF_W, AREA_D),
    line(-BOX_HALF_W, 0, -BOX_HALF_W, BOX_D),
    line(BOX_HALF_W, 0, BOX_HALF_W, BOX_D),
    line(-BOX_HALF_W, BOX_D, BOX_HALF_W, BOX_D),
  );
  // penalty spot, the "D" outside the box, quarter circles at the corners
  parts.push({ geo: new THREE.CircleGeometry(0.1, 20), color: C.white, at: [0, LINE_Y, spotZ], rot: [-Math.PI / 2, 0, 0] });
  const reach = Math.acos(THREE.MathUtils.clamp((BOX_D - spotZ) / ARC_R, -1, 1));
  if (reach > 0.01) parts.push(arc(ARC_R, 0, spotZ, -Math.PI / 2 - reach, 2 * reach));
  parts.push(arc(0.4, -CORNER_X, 0, -Math.PI / 2, Math.PI / 2), arc(0.4, CORNER_X, 0, Math.PI, Math.PI / 2));
  return colored(parts);
}

/** The ground: grass around the pitch, mown stripes and the white lines, penalty spot at z = `spot`. */
export function Pitch({ spot }: { spot: number }) {
  const kit = useKit();
  const geometry = kit.geo(`kick-pitch|${spot}`, () => pitchGeometry(spot));
  return <mesh geometry={geometry} material={kit.clay(C.white, { vertexColors: true })} receiveShadow />;
}

/* ---------- Goal: white posts and crossbar, a frame in the team's deep colour, a net that bulges ---------- */

const UP = new THREE.Vector3(0, 1, 0);

/** A round bar from a to b. */
function rod(a: V3, b: V3, r: number, color: string, radial = 10): Part {
  const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = dir.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return { geo: new THREE.CylinderGeometry(r, r, len, radial), color, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [e.x, e.y, e.z] };
}

function goalFrameGeometry(deep: string): THREE.BufferGeometry {
  const x = GOAL_HALF_W + POST_R;
  const top = GOAL_H + POST_R;
  const tz = -NET_TOP_D;
  const bz = -NET_BOTTOM_D;
  const r = 0.028;
  return colored([
    rod([-x, 0, 0], [-x, top, 0], POST_R, C.white, 16),
    rod([x, 0, 0], [x, top, 0], POST_R, C.white, 16),
    rod([-x, top, 0], [x, top, 0], POST_R, C.white, 16),
    { geo: new THREE.SphereGeometry(POST_R, 16, 10), color: C.white, at: [-x, top, 0] },
    { geo: new THREE.SphereGeometry(POST_R, 16, 10), color: C.white, at: [x, top, 0] },
    // the frame that holds the net
    rod([-x, top, 0], [-x, GOAL_H, tz], r, deep),
    rod([x, top, 0], [x, GOAL_H, tz], r, deep),
    rod([-x, GOAL_H, tz], [x, GOAL_H, tz], r, deep),
    rod([-x, GOAL_H, tz], [-x, r, bz], r, deep),
    rod([x, GOAL_H, tz], [x, r, bz], r, deep),
    rod([-x, r, bz], [x, r, bz], r, deep),
    rod([-x, r, 0], [-x, r, bz], r, deep),
    rod([x, r, 0], [x, r, bz], r, deep),
  ]);
}

/** Size of one mesh of the net (world units). */
const NET_CELL = 0.17;
/** How wide a bulge spreads around the hit (2σ²). */
const BULGE_SPREAD = 0.5;

/** A grid sheet: `at(u, v)` places each vertex; uv is in net cells so the mesh pattern has the same size everywhere. */
function netPanel(nu: number, nv: number, lenU: number, lenV: number, at: (u: number, v: number, out: THREE.Vector3) => void): THREE.BufferGeometry {
  const count = (nu + 1) * (nv + 1);
  const pos = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      at(i / nu, j / nv, p);
      pos[k * 3] = p.x;
      pos[k * 3 + 1] = p.y;
      pos[k * 3 + 2] = p.z;
      uv[k * 2] = ((i / nu) * lenU) / NET_CELL;
      uv[k * 2 + 1] = ((j / nv) * lenV) / NET_CELL;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      index.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function netGeometry(): THREE.BufferGeometry {
  const x = GOAL_HALF_W + POST_R;
  const top = GOAL_H + POST_R * 0.5;
  const tz = -NET_TOP_D;
  const bz = -NET_BOTTOM_D;
  const lerp = THREE.MathUtils.lerp;
  const panels = [
    // back net: from the ground at the back up to the top of the frame
    netPanel(20, 9, 2 * x, Math.hypot(GOAL_H, bz - tz), (u, v, p) => p.set(lerp(-x, x, u), lerp(0.02, GOAL_H, v), lerp(bz, tz, v))),
    // roof: from the crossbar back to the top of the frame
    netPanel(20, 4, 2 * x, NET_TOP_D, (u, v, p) => p.set(lerp(-x, x, u), lerp(top, GOAL_H, v), lerp(0, tz, v))),
    // sides: u from the goal line back, v from the ground up
    ...[-x, x].map((sx) => netPanel(6, 8, NET_BOTTOM_D, GOAL_H, (u, v, p) => p.set(sx, lerp(0.02, lerp(top, GOAL_H, u), v), lerp(u * bz, u * tz, v)))),
  ];
  const g = mergeGeometries(panels, false);
  panels.forEach((p) => p.dispose());
  if (!g) throw new Error("net merge failed");
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 0.5; // room for the bulge
  return g;
}

/** Net pattern as an alpha map (white lines on black): the colour comes from the material, so no dark fringes. */
function netTexture(kit: Kit): THREE.CanvasTexture {
  return kit.tex("kick-net", () => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#000000";
    g.fillRect(0, 0, 32, 32);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 32, 4);
    g.fillRect(0, 0, 4, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = kit.tier === "low" ? 1 : 4;
    return t;
  });
}

/** How much a point of the net may move: nothing at the frame on the goal line, fully at the back (−z / NET_BOTTOM_D). */
const netGive = (z: number) => clamp01(-z / NET_BOTTOM_D);

export interface NetDrive {
  /** Where the ball meets the back net. */
  x: number;
  y: number;
  /**
   * How far the net is pushed back at (x, y) right now, before the give of the net there (−z / NET_BOTTOM_D,
   * clamped 0…1). Written by the scene every frame (0 = at rest): the scene owns the timing so the ball rides the same bulge.
   */
  push: number;
}

/**
 * ประตู: เสาและคานสีขาว โครงหลังสีเข้มของทีม ตาข่ายสีขาวอมสีทีม — ลูกเข้าแล้วตาข่ายโป่งออกไปข้างหลังครู่หนึ่งแล้วสั่นกลับ
 * (ฉากเป็นผู้กำหนดจังหวะผ่าน NetDrive.push) · ตาข่ายเป็น geometry ของฉากนี้เอง แก้ตำแหน่ง vertex ในที่เดิม ไม่สร้างใหม่ระหว่างเล่น
 */
export function Goal({ net, color, deep, shadows }: { net: RefObject<NetDrive>; color: string; deep: string; shadows: boolean }) {
  const kit = useKit();
  const frame = kit.geo(`kick-goal-frame|${deep}`, () => goalFrameGeometry(deep));
  const netGeo = useMemo(() => kit.own(netGeometry()), [kit]);
  const rest = useMemo(() => Float32Array.from(netGeo.getAttribute("position").array), [netGeo]);
  const netMat = useMemo(
    () =>
      kit.own(
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(C.white).lerp(new THREE.Color(color), 0.3),
          alphaMap: netTexture(kit),
          transparent: true,
          opacity: 0.92,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    [kit, color],
  );
  const shown = useRef(0);

  useFrame(() => {
    const d = net.current;
    if (d.push === shown.current) return; // at rest (or unchanged): nothing to upload
    shown.current = d.push;
    const attr = netGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    if (d.push === 0) arr.set(rest);
    else {
      for (let i = 0; i < arr.length; i += 3) {
        const dx = rest[i] - d.x;
        const dy = rest[i + 1] - d.y;
        arr[i + 2] = rest[i + 2] - d.push * Math.exp(-(dx * dx + dy * dy) / BULGE_SPREAD) * netGive(rest[i + 2]);
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <group>
      <mesh geometry={frame} material={kit.clay(C.white, { vertexColors: true, roughness: 0.6 })} castShadow={shadows} receiveShadow />
      <mesh geometry={netGeo} material={netMat} renderOrder={1} />
    </group>
  );
}

/* ---------- Ball: white with dark pentagons ---------- */

/** The 12 pentagon centres of a football = the vertices of an icosahedron. */
const PENTAGONS = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  return raw.map((v) => new THREE.Vector3(...v).normalize());
})();

function ballGeometry(detail: number, patch: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(BALL_R, detail); // non-indexed, smooth normals
  g.deleteAttribute("uv");
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const white = new THREE.Color(C.white);
  const dark = new THREE.Color(C.ink);
  const c = new THREE.Vector3();
  const minDot = Math.cos(patch);
  for (let f = 0; f < pos.count; f += 3) {
    c.set(0, 0, 0);
    for (let v = 0; v < 3; v++) c.x += pos.getX(f + v);
    for (let v = 0; v < 3; v++) c.y += pos.getY(f + v);
    for (let v = 0; v < 3; v++) c.z += pos.getZ(f + v);
    c.normalize();
    const onPatch = PENTAGONS.some((p) => p.dot(c) >= minDot);
    const col = onPatch ? dark : white;
    for (let v = 0; v < 3; v++) colors.set([col.r, col.g, col.b], (f + v) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** The football (radius BALL_R, centred on its origin). The scene moves and spins it through `ref`. */
export function SoccerBall({ ref }: { ref?: Ref<THREE.Mesh> }) {
  const kit = useKit();
  const low = kit.tier === "low";
  // finer sphere = rounder pentagons (two rings of triangles around each corner of the icosahedron)
  const geometry = kit.geo(`kick-ball|${low ? "lo" : "hi"}`, () => (low ? ballGeometry(3, THREE.MathUtils.degToRad(13)) : ballGeometry(5, THREE.MathUtils.degToRad(19))));
  return <mesh ref={ref} geometry={geometry} material={kit.clay(C.white, { vertexColors: true, roughness: 0.5 })} />;
}

/* ---------- Stands and crowd ---------- */

const STAND_X = 7.4;
const STAND_Z0 = -3.0;
const ROW_D = 0.82;
const STEP = 0.42;
const ROWS = 3;
const BOARD_Z = -2.68;
/** One jump-and-wave rolls across the stand in about this long (s). */
const WAVE_S = 2.1;

function pennant(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.11, 0);
  s.lineTo(0.11, 0);
  s.lineTo(0, -0.21);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

function standGeometry(color: string, deep: string): THREE.BufferGeometry {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string): Part => ({ geo: new THREE.BoxGeometry(w, h, d), color: c, at: [x, y, z] });
  const W = STAND_X * 2;
  const team = [color, C.cream, deep];
  // a sandy track between the pitch and the stand
  const parts: Part[] = [flat(W + 4, PITCH_END - STAND_Z0, 0, (PITCH_END + STAND_Z0) / 2, C.path, 0.004)];
  // plain boards in the team colours along the end of the pitch (no words or logos)
  const boards = 12;
  const bw = (W + 1) / boards;
  for (let i = 0; i < boards; i++) parts.push(box(bw - 0.05, 0.3, 0.08, -(W + 1) / 2 + bw * (i + 0.5), 0.15, BOARD_Z, team[i % 3]));
  // three tiers, each with a strip of seats in the team colour along its front edge
  for (let row = 0; row < ROWS; row++) {
    const h = (row + 1) * STEP;
    const z = STAND_Z0 - ROW_D * (row + 0.5);
    parts.push(box(W, h, ROW_D, 0, h / 2, z, row % 2 ? C.lilacLight : C.creamShade));
    parts.push(box(W - 0.1, 0.07, 0.14, 0, h + 0.035, z + ROW_D / 2 - 0.09, row % 2 ? deep : color));
  }
  // back wall with a team-coloured top, short side walls, bunting along the top
  const backZ = STAND_Z0 - ROW_D * ROWS - 0.12;
  const wallH = ROWS * STEP + 0.85;
  parts.push(box(W + 0.5, wallH, 0.24, 0, wallH / 2, backZ, C.lilac));
  parts.push(box(W + 0.6, 0.12, 0.32, 0, wallH + 0.06, backZ, deep));
  const sideD = ROW_D * ROWS + 0.24;
  for (const sx of [-1, 1]) parts.push(box(0.24, wallH - 0.3, sideD, sx * (STAND_X + 0.12), (wallH - 0.3) / 2, STAND_Z0 - sideD / 2, C.lilac));
  parts.push(box(W, 0.018, 0.018, 0, wallH - 0.1, backZ + 0.14, C.white));
  const flags = 26;
  for (let i = 0; i < flags; i++) parts.push({ geo: pennant(), color: team[i % 3], at: [-STAND_X + (i + 0.5) * (W / flags), wallH - 0.1, backZ + 0.15] });
  return colored(parts);
}

/** Blob fan facing +z: a round body (white = tinted per fan) with two ink eyes and a small smile. */
function fanGeometry(): THREE.BufferGeometry {
  // coarse on purpose: a fan is only ~20–40 px tall on screen and there are dozens of them
  const eye = (x: number): Part => ({ geo: new THREE.SphereGeometry(1, 6, 4), color: C.ink, at: [x, 0.35, 0.158], scale: [0.03, 0.036, 0.02] });
  return colored([
    { geo: new THREE.SphereGeometry(1, 12, 8), color: C.white, at: [0, 0.27, 0], scale: [0.2, 0.27, 0.18] },
    eye(-0.065),
    eye(0.065),
    { geo: new THREE.TorusGeometry(0.035, 0.009, 3, 8, Math.PI), color: C.ink, at: [0, 0.29, 0.172], rot: [0.25, 0, Math.PI] },
  ]);
}

/** Fan's arms lift out from the middle of the body (not its top, or they read as ears). */
const ARM_Y = 0.25;
/** Two arms thrown up and out ("yay!") with round hands; origin = middle of the body, so scaling pops them out of it. */
function armsGeometry(): THREE.BufferGeometry {
  const tilt = 0.85;
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    const dx = side * Math.sin(tilt);
    const dy = Math.cos(tilt);
    const base: V3 = [side * 0.15, 0, 0.03];
    parts.push({ geo: new THREE.CapsuleGeometry(0.042, 0.15, 2, 6), color: C.white, at: [base[0] + dx * 0.12, dy * 0.12, base[2]], rot: [0, 0, -side * tilt] });
    parts.push({ geo: new THREE.SphereGeometry(0.06, 8, 6), color: C.white, at: [base[0] + dx * 0.26, dy * 0.26, base[2]] });
  }
  return colored(parts);
}

interface Fan {
  x: number;
  y: number;
  z: number;
  s: number;
  /** Phase of its sway. */
  p: number;
  /** When it joins the wave after a goal (s). */
  delay: number;
  /** 0 = team colour, 1 = deep team colour, 2 = cream. */
  tint: number;
}

function fanLayout(dense: boolean): Fan[] {
  const r = seeded(19);
  const perRow = dense ? 19 : 9;
  const span = STAND_X - 0.5;
  const out: Fan[] = [];
  for (let row = 0; row < ROWS; row++) {
    const z = STAND_Z0 - ROW_D * (row + 0.5) + 0.05;
    for (let i = 0; i < perRow; i++) {
      const u = (i + 0.5 + (row % 2 ? 0.25 : -0.25)) / perRow;
      const x = -span + 2 * span * u + (r() - 0.5) * 0.12;
      const pick = r();
      out.push({
        x,
        y: (row + 1) * STEP,
        z: z + (r() - 0.5) * 0.08,
        s: 0.92 + r() * 0.16,
        p: r() * Math.PI * 2,
        delay: ((x + span) / (2 * span)) * 0.55 + row * 0.05,
        tint: pick < 0.55 ? 0 : pick < 0.8 ? 1 : 2,
      });
    }
  }
  return out;
}

export interface CrowdDrive {
  /** Increment on every goal: a jump-and-wave rolls across the stand. */
  cheer: number;
  /** 0..1: the child is speaking right now (the crowd bobs a little more). */
  excite: number;
  /** The match is over: everyone keeps cheering. */
  party: boolean;
  reduced: boolean;
}

const scratch = new THREE.Object3D();

/**
 * อัฒจันทร์เล็ก ๆ หลังประตูกับกองเชียร์ตัวกลม ๆ สีทีม (สองชุด instanced = 2 draw call ทั้งกองเชียร์)
 * โยกตัวเบา ๆ ตลอด · ตอนเด็กพูดโยกถี่ขึ้นนิด ๆ · ได้ประตู = กระโดดชูแขนไล่เป็นคลื่นจากซ้ายไปขวา · จบเกม = เชียร์ต่อเนื่อง
 * ลดการเคลื่อนไหว: ท่าเดิมครึ่งขนาดและช้าลง
 */
export function Stands({ color, deep, crowd, dense }: { color: string; deep: string; crowd: RefObject<CrowdDrive>; dense: boolean }) {
  const kit = useKit();
  const stand = kit.geo(`kick-stand|${color}|${deep}`, () => standGeometry(color, deep));
  const body = kit.geo("kick-fan", fanGeometry);
  const armGeo = kit.geo("kick-fan-arms", armsGeometry);
  const mat = kit.clay(C.white, { vertexColors: true });
  const fans = useMemo(() => fanLayout(dense), [dense]);
  const bodies = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const st = useRef({ t: 0, excite: 0, party: 0, cheerT: -1, cheerSeen: crowd.current.cheer });

  useLayoutEffect(() => {
    const tints = [new THREE.Color(color), new THREE.Color(deep), new THREE.Color(C.cream)];
    const b = bodies.current;
    const a = arms.current;
    if (!b || !a) return;
    fans.forEach((f, i) => {
      scratch.position.set(f.x, f.y, f.z);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.setScalar(f.s);
      scratch.updateMatrix();
      b.setMatrixAt(i, scratch.matrix);
      b.setColorAt(i, tints[f.tint]);
      scratch.scale.setScalar(0);
      scratch.updateMatrix();
      a.setMatrixAt(i, scratch.matrix);
      a.setColorAt(i, tints[f.tint]);
    });
    for (const m of [b, a]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    a.visible = false;
  }, [fans, color, deep]);

  useFrame((_, dtRaw) => {
    const b = bodies.current;
    const a = arms.current;
    if (!b || !a) return;
    const dt = frameDt(dtRaw);
    const d = crowd.current;
    const s = st.current;
    const amp = d.reduced ? CALM.amp : 1;
    s.t += dt * (d.reduced ? 0.6 : 1);
    s.excite = damp(s.excite, d.excite, 3, dt);
    s.party = damp(s.party, d.party ? 1 : 0, 2, dt);
    if (d.cheer !== s.cheerSeen) {
      s.cheerSeen = d.cheer;
      s.cheerT = 0;
    }
    if (s.cheerT >= 0) {
      s.cheerT += dt;
      if (s.cheerT > WAVE_S) s.cheerT = -1;
    }
    let raised = false;
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      const sway = Math.sin(s.t * 1.3 + f.p) * 0.08 * amp;
      let y = f.y + Math.abs(Math.sin(s.t * (1.7 + 3.3 * s.excite) + f.p)) * (0.012 + 0.04 * s.excite) * amp;
      let up = 0;
      if (s.cheerT >= 0) {
        const k = (s.cheerT - f.delay) / 0.55;
        if (k > 0 && k < 1) y += bump(k) * 0.3 * amp;
        const h = (s.cheerT - f.delay) / 1.25;
        if (h > 0 && h < 1) up = clamp01(h * 6) * clamp01((1 - h) * 4);
      }
      if (s.party > 0.01) {
        y += Math.abs(Math.sin(s.t * 4.4 + f.p * 2)) * 0.14 * amp * s.party;
        up = Math.max(up, s.party);
      }
      scratch.position.set(f.x, y, f.z);
      scratch.rotation.set(0, 0, sway);
      scratch.scale.setScalar(f.s);
      scratch.updateMatrix();
      b.setMatrixAt(i, scratch.matrix);
      if (up > 0.01) {
        raised = true;
        const shoulder = ARM_Y * f.s;
        scratch.position.set(f.x - Math.sin(sway) * shoulder, y + Math.cos(sway) * shoulder, f.z);
        scratch.rotation.set(0, 0, sway + Math.sin(s.t * 11 + f.p) * 0.22 * amp * up);
        scratch.scale.setScalar(f.s * up);
      } else {
        scratch.scale.setScalar(0);
      }
      scratch.updateMatrix();
      a.setMatrixAt(i, scratch.matrix);
    }
    b.instanceMatrix.needsUpdate = true;
    a.instanceMatrix.needsUpdate = true;
    a.visible = raised;
  });

  return (
    <group>
      <mesh geometry={stand} material={mat} receiveShadow />
      <instancedMesh key={`fans-${fans.length}`} ref={bodies} args={[body, mat, fans.length]} frustumCulled={false} />
      <instancedMesh key={`arms-${fans.length}`} ref={arms} args={[armGeo, mat, fans.length]} frustumCulled={false} />
    </group>
  );
}

/* ---------- Corner flag ---------- */

function flagPoleGeometry(): THREE.BufferGeometry {
  return colored([
    { geo: new THREE.CylinderGeometry(0.022, 0.026, 1.0, 8), color: C.white, at: [0, 0.5, 0] },
    { geo: new THREE.SphereGeometry(0.04, 10, 8), color: C.gold, at: [0, 1.02, 0] },
  ]);
}

function flagClothGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.36, -0.1);
  s.lineTo(0, -0.22);
  s.closePath();
  return new THREE.ShapeGeometry(s);
}

/** A corner flag in the team colour; the pennant flutters (less with reduced motion). Stands on its origin. */
export function CornerFlag({ color, reduced, phase = 0 }: { color: string; reduced: boolean; phase?: number }) {
  const kit = useKit();
  const cloth = useRef<THREE.Mesh>(null);
  const t = useRef(phase);
  useFrame((_, dtRaw) => {
    t.current += frameDt(dtRaw) * (reduced ? 0.5 : 1);
    const c = cloth.current;
    if (!c) return;
    const a = reduced ? 0.12 : 0.32;
    c.rotation.y = Math.sin(t.current * 3.1) * a + Math.sin(t.current * 7.3) * a * 0.25;
  });
  return (
    <group>
      <mesh geometry={kit.geo("kick-flag-pole", flagPoleGeometry)} material={kit.clay(C.white, { vertexColors: true })} />
      <mesh ref={cloth} geometry={kit.geo("kick-flag-cloth", flagClothGeometry)} material={kit.clay(color, { doubleSide: true })} position={[0.02, 0.98, 0]} />
    </group>
  );
}

/* ---------- Trophy ---------- */

function starShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

function trophyGeometry(): THREE.BufferGeometry {
  const deepGold = "#e0a92a";
  // cup: outer wall up to the rim, then the inside back down to the middle (so it looks hollow from above)
  const cup = new THREE.LatheGeometry(
    (
      [
        [0.0, 0.0],
        [0.06, 0.0],
        [0.11, 0.03],
        [0.18, 0.1],
        [0.23, 0.2],
        [0.255, 0.31],
        [0.265, 0.4],
        [0.245, 0.415],
        [0.225, 0.38],
        [0.0, 0.24],
      ] as const
    ).map(([r, y]) => new THREE.Vector2(r, y)),
    28,
  );
  const handle = () => new THREE.TorusGeometry(0.1, 0.022, 8, 18, Math.PI);
  return colored([
    { geo: new THREE.CylinderGeometry(0.19, 0.21, 0.1, 24), color: C.cream, at: [0, 0.05, 0] },
    { geo: new THREE.CylinderGeometry(0.13, 0.16, 0.07, 24), color: deepGold, at: [0, 0.135, 0] },
    { geo: new THREE.CylinderGeometry(0.035, 0.05, 0.16, 12), color: C.gold, at: [0, 0.25, 0] },
    { geo: new THREE.SphereGeometry(0.06, 12, 8), color: deepGold, at: [0, 0.33, 0] },
    { geo: cup, color: C.gold, at: [0, 0.35, 0] },
    { geo: handle(), color: C.gold, at: [0.245, 0.6, 0], rot: [0, 0, -Math.PI / 2] },
    { geo: handle(), color: C.gold, at: [-0.245, 0.6, 0], rot: [0, 0, Math.PI / 2] },
    { geo: new THREE.ExtrudeGeometry(starShape(0.075), { depth: 0.02, bevelEnabled: false }), color: C.cream, at: [0, 0.6, 0.232] },
  ]);
}

/** Gold cup with two handles and a cream star on a small plinth (≈ 0.76 tall, stands on its origin). */
export function Trophy() {
  const kit = useKit();
  return <mesh geometry={kit.geo("kick-trophy", trophyGeometry)} material={kit.clay(C.white, { vertexColors: true, roughness: 0.38 })} />;
}
