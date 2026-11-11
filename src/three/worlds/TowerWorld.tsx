import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { floorSpot, TOWER_RISE, type TowerPathId } from "../../data/towerPaths";
import { climbView, TOWER_FLOORS } from "../../logic/tower";
import { bump, clamp01, damp, easeInOutSine, frameDt, lerp } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { cloudPillar, cloudPlatform, rainbowArch, rainbowFlag, smilingMoon, starLantern } from "../models/CloudTower";
import { bunnyDrive } from "../models/drives";
import { petDrive } from "../models/petDrives";
import { Pet, type PetKind } from "../models/Pets";
import { C } from "../palette";
import { BlobShadow, Burst, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { TowerSpec } from "../spec";

/* ---------- Layout (world units; the same clouds as the 2D side stack: floorSpot) ---------- */
const PLATFORM_R = 0.78;
const GROUND_R = 1.25;
const CLIMBER_SCALE = 0.72;
const PET_SCALE = 0.85;
/** Height of the jump arc above the straight line between two clouds (the same for every jump). */
const ARC = 0.95;
/** The lift cloud rides this far under the character's feet. */
const LIFT_UNDER = 0.08;
const TOP_Y = TOWER_FLOORS * TOWER_RISE;
const Z = 0.12;
const FOV = 30;
/** Normal view: the cloud the character stands on and the next one, never more zoom than this. */
const VIEW_W = 4.7;
const VIEW_H = 4.9;
/** Reduced motion: one still view of the whole tower (the camera never moves), with room for the top bar above the goal. */
const STILL_H = TOP_Y + 4.4;
const DIR = new THREE.Vector3(0, 0.17, 1).normalize();

/** Where the character stands on a cloud: a little towards the outside; the pet stands on the inner side. */
function standX(x: number): number {
  return x === 0 ? 0.12 : x + Math.sign(x) * 0.16;
}
function petX(x: number): number {
  return x === 0 ? -0.5 : x - Math.sign(x) * 0.4;
}

function decor(path: TowerPathId, low: boolean) {
  const clouds: Placement[] = [
    { x: -4.2, y: 1.6, z: -7, s: 1.1, ry: 0.4 },
    { x: 4.4, y: 3.8, z: -7.5, s: 1.2, ry: 2.2 },
    { x: -4.4, y: 6.0, z: -7.5, s: 1.0, ry: 1.1 },
    { x: 4.0, y: 8.2, z: -7, s: 1.0, ry: 2.8 },
    { x: -3.4, y: 10.2, z: -7, s: 0.9, ry: 0.2 },
    { x: 3.2, y: -0.4, z: -6.5, s: 0.9, ry: 1.7 },
  ];
  const stars: Placement[] =
    path === "star"
      ? [
          { x: -2.6, y: 2.6, z: -3.2, s: 0.07 },
          { x: 2.9, y: 4.9, z: -3.4, s: 0.06 },
          { x: -2.2, y: 7.1, z: -3.0, s: 0.08 },
          { x: 2.3, y: 8.8, z: -3.2, s: 0.06 },
          { x: -3.1, y: 9.9, z: -3.6, s: 0.07 },
          { x: 1.9, y: 1.4, z: -3.0, s: 0.05 },
        ]
      : [];
  return { clouds: low ? clouds.slice(0, 4) : clouds, stars };
}

/**
 * ฉากหอคอยเมฆ 3D (มุมกล้องบุคคลที่สาม มองหอคอยจากด้านหน้าเยื้องบนเล็กน้อย)
 * - ทุกอย่างอ่านจาก TowerClimb ทุกเฟรมผ่าน climbView (ชุดเดียวกับฉาก 2D): ตำแหน่งกลางอากาศคำนวณจาก moveK ของเกมโดยตรง
 *   พัก/ซ่อนหน้า = เกมไม่เดิน ตัวละครจึงค้างอยู่ตรงเดิมของท่ากระโดด กลับมาแล้วไปต่อจากจุดนั้น (ไม่วาร์ป)
 * - เด็กพูด → ย่อตัว (ท่าเท่านั้น ไม่ขึ้นกับความดัง) · ได้คำที่ใช้ได้ → กระโดดโค้งขึ้นเมฆชั้นถัดไป สูงเท่ากันทุกครั้ง ·
 *   ลงแท่น → ยุบตัวนุ่ม ๆ ของประดับชั้นนั้นสว่าง ประกาย · ข้ามชั้น → ลิฟต์เมฆก้อนเล็กพาขึ้นช้า ๆ ของประดับชั้นนั้นไม่สว่าง (ไม่ใช่โทษ แค่ไม่นับ)
 * - สัตว์เลี้ยงของเด็กกระโดดตามไปช้ากว่านิดหนึ่งและยืนข้างตัวละครบนแท่นเดียวกัน
 * - กล้องไม่หมุนและไม่ซูม: เลื่อนขึ้นตามแนวตั้งแบบนุ่มให้เห็นแท่นปัจจุบันกับแท่นถัดไปเสมอ
 *   ลดการเคลื่อนไหว: กล้องนิ่งเห็นทั้งหอคอย ท่าเปลี่ยนแบบสลับท่า (ย่อ → อยู่บนแท่นใหม่) ไม่มีการลอยโค้ง ผลของรอบเท่ากันทุกอย่าง
 */
export function TowerWorld({ gameRef, path: pathId, outfit, species, buddy, reduced, tier }: TowerSpec) {
  const kit = useKit();
  const path: TowerPathId = pathId === "star" ? "star" : "rainbow";
  const low = tier === "low";
  const spots = useMemo(() => Array.from({ length: TOWER_FLOORS + 1 }, (_, f) => floorSpot(path, f)), [path]);
  const L = useMemo(() => decor(path, low), [path, low]);
  const geo = useMemo(
    () => ({
      platform: kit.geo(`tower-cloud-${PLATFORM_R}`, () => cloudPlatform(PLATFORM_R, kit.seg)),
      ground: kit.geo(`tower-cloud-${GROUND_R}`, () => cloudPlatform(GROUND_R, kit.seg)),
      lift: kit.geo("tower-cloud-lift", () => cloudPlatform(0.42, kit.seg)),
      pillar: kit.geo("tower-pillar", () => cloudPillar(TOP_Y - 0.6, kit.seg)),
      keepLit: kit.geo(`tower-keep-${path}-lit`, () => (path === "star" ? starLantern(true) : rainbowFlag(true))),
      keepDim: kit.geo(`tower-keep-${path}-dim`, () => (path === "star" ? starLantern(false) : rainbowFlag(false))),
      goal: kit.geo(`tower-goal-${path}`, () => (path === "star" ? smilingMoon(kit.seg) : rainbowArch(kit.seg))),
      cloud: kit.geo("cloud", S.cloud),
      star: kit.geo("sparkle", S.sparkle),
    }),
    [kit, path],
  );
  const mats = useMemo(
    () => ({
      clay: kit.clay(C.white, { vertexColors: true }),
      glow: kit.clay(C.white, { vertexColors: true, emissive: path === "star" ? C.butter : C.pinkSoft, emissiveIntensity: path === "star" ? 0.45 : 0.18 }),
      ring: kit.own(new THREE.MeshBasicMaterial({ color: C.creamShade })),
      starSky: kit.basic(C.butter),
      // far clouds: a little self-light, so the warm sky never turns them grey
      far: kit.clay(C.white, { vertexColors: true, emissive: "#ffffff", emissiveIntensity: 0.28 }),
    }),
    [kit, path],
  );
  const ringIdle = useMemo(() => new THREE.Color(C.creamShade), []);
  const ringLive = useMemo(() => new THREE.Color(C.gold), []);

  const bunny = useRef(bunnyDrive({ reduced }));
  const pet = useRef(petDrive({ reduced }));
  const climber = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const climberShadow = useRef<THREE.Mesh>(null);
  const petRoot = useRef<THREE.Group>(null);
  const petShadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lift = useRef<THREE.Mesh>(null);
  const goal = useRef<THREE.Group>(null);
  const keepLit = useRef<(THREE.Mesh | null)[]>([]);
  const keepDim = useRef<(THREE.Mesh | null)[]>([]);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  /** What the scene has already shown (a scene mounted mid-round — 3D retried, rotated, resized — never replays old cues). */
  const seen = useRef<{ game: unknown; land: number; done: boolean; popFloor: number; popT: number; goalT: number; camY: number | null; ry: number; petRy: number }>({
    game: null,
    land: 0,
    done: false,
    popFloor: 0,
    popT: 1,
    goalT: 1,
    camY: null,
    ry: 0,
    petRy: 0,
  });

  // nothing of a celebration shows before it happens
  useLayoutEffect(() => {
    if (lift.current) lift.current.visible = false;
  }, []);

  useFrame((state, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const v = climbView(g);
    const s = seen.current;
    if (s.game !== g) {
      s.game = g;
      s.land = g.landSeq;
      s.done = g.done;
      s.popT = 1;
      s.goalT = 1;
      s.camY = null;
    }

    // ---- cues from the game (each once) ----
    if (g.landSeq !== s.land) {
      s.land = g.landSeq;
      s.popFloor = g.at;
      s.popT = 0;
      const p = spots[g.at];
      fire.current = { seq: fire.current.seq + 1, x: standX(p.x), y: p.y + 0.9, z: Z + 0.2 };
      if (!reduced) {
        bunny.current.cheer += 1;
        pet.current.cheer += 1;
      }
    }
    if (g.done && !s.done) {
      s.done = true;
      if (g.at >= TOWER_FLOORS) s.goalT = 0;
    }
    s.popT = Math.min(1, s.popT + dt / 0.45);
    s.goalT = Math.min(1, s.goalT + dt / 0.6);

    // ---- the climber: on its cloud, in the air (arc), or riding the lift ----
    const P0 = spots[v.from];
    const P1 = spots[v.to];
    let k = v.moving ? v.k : 0;
    if (reduced && v.moving) k = v.k < 0.5 ? 0 : 1; // pose swap: crouched on the old cloud, then standing on the new one
    const e = v.moving === "lift" && !reduced ? easeInOutSine(k) : v.moving === "jump" && !reduced ? easeInOutSine(k) : k;
    const x = lerp(standX(P0.x), standX(P1.x), e);
    let y = lerp(P0.y, P1.y, e);
    if (v.moving === "jump" && !reduced) y += bump(k) * ARC;
    if (v.moving === "lift") y += LIFT_UNDER;
    const c = climber.current;
    if (c) c.position.set(x, y, Z);

    // squash & stretch (a pose, never from loudness); reduced motion: two poses only
    let sy = 1;
    if (reduced) {
      const crouched = (v.moving === "jump" && v.k < 0.5) || (g.phase === "aim" && v.speaking);
      sy = crouched ? 0.88 : 1;
    } else if (v.moving === "jump") {
      sy = 1 + 0.12 * Math.sin(Math.PI * v.k);
    } else if (g.phase === "land") {
      sy = 1 - 0.16 * bump(Math.min(1, v.landK / 0.35));
    } else {
      sy = 1 - 0.15 * v.crouch;
    }
    const b = body.current;
    if (b) b.scale.set(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5);

    // face the next cloud while climbing, the child once landed or at the top
    const next = spots[Math.min(TOWER_FLOORS, g.at + 1)];
    const towards = g.done || g.phase === "land" ? 0 : Math.sign(next.x - spots[g.at].x) * 0.75;
    s.ry = reduced ? towards : damp(s.ry, towards, 7, dt);
    if (c) c.rotation.y = s.ry;
    const bd = bunny.current;
    bd.reduced = reduced;
    bd.pose = g.done || (reduced && g.phase === "land") ? "wave" : "stand";

    // shadow on the cloud below (the one left until halfway, then the one ahead), smaller while high in the air
    const cs = climberShadow.current;
    if (cs) {
      const under = e < 0.5 ? P0.y : P1.y;
      const lifted = Math.max(0, y - under);
      cs.position.set(x, under + 0.015, Z);
      cs.scale.setScalar(Math.max(0.35, 1 - lifted * 0.45));
      cs.visible = v.moving !== "lift";
    }

    // the lift cloud under the feet while skipping
    const lf = lift.current;
    if (lf) {
      lf.visible = v.moving === "lift";
      lf.position.set(x, y - LIFT_UNDER, Z);
    }

    // listening ring: only while the game listens for this floor's word; gold while a voice is coming in
    const rg = ring.current;
    if (rg) {
      const listening = g.phase === "aim" && g.call.state.phase === "turn";
      rg.visible = listening;
      rg.position.set(standX(P0.x), P0.y + 0.02, Z);
      mats.ring.color.copy(g.speaking ? ringLive : ringIdle);
    }

    // ---- the pet: follows a beat later and stands on the inner side of the same cloud ----
    const pr = petRoot.current;
    if (pr) {
      let pk = v.moving ? clamp01((k - 0.25) / 0.75) : 0;
      if (reduced && v.moving) pk = v.k < 0.75 ? 0 : 1;
      const pe = reduced ? pk : easeInOutSine(pk);
      const px = lerp(petX(P0.x), petX(P1.x), pe);
      let py = lerp(P0.y, P1.y, pe);
      if (v.moving === "jump" && !reduced) py += bump(pk) * ARC * 0.75;
      if (v.moving === "lift") py += LIFT_UNDER;
      pr.position.set(px, py, Z - 0.05);
      s.petRy = reduced ? towards * 0.6 : damp(s.petRy, towards * 0.6, 6, dt);
      pr.rotation.y = s.petRy;
      pet.current.reduced = reduced;
      pet.current.speed = 0;
      const ps = petShadow.current;
      if (ps) {
        const under = pe < 0.5 ? P0.y : P1.y;
        ps.position.set(px, under + 0.015, Z - 0.05);
        ps.visible = v.moving !== "lift";
      }
    }

    // ---- keepsakes: lit on floors reached by a jump; the newest one pops in (reduced: just appears) ----
    for (let f = 1; f < TOWER_FLOORS; f++) {
      const litNow = f <= g.at && v.results[f - 1] === "jump";
      const lm = keepLit.current[f];
      const dm = keepDim.current[f];
      if (lm) {
        lm.visible = litNow;
        const pop = f === s.popFloor && !reduced ? 0.4 + 0.6 * easeOutBack(s.popT) : 1;
        lm.scale.setScalar(pop);
      }
      if (dm) dm.visible = !litNow;
    }
    const gl = goal.current;
    if (gl) {
      const reached = g.at >= TOWER_FLOORS;
      const pop = reached && !reduced ? 0.85 + 0.15 * easeOutBack(s.goalT) : 1;
      gl.scale.setScalar(reached ? pop : 0.85);
    }

    // ---- camera: no turning, no zoom; it glides up with the climb (reduced motion: one still view of the whole tower) ----
    const cam = state.camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    let ty: number;
    let h: number;
    if (reduced) {
      h = STILL_H;
      ty = (TOP_Y + 1.4) / 2 + 0.35;
      s.camY = ty;
    } else {
      h = VIEW_H;
      const base = lerp(P0.y, P1.y, v.moving ? easeInOutSine(v.k) : 0);
      ty = Math.min(base + 1.3, TOP_Y + 0.9);
      s.camY = s.camY === null ? ty : damp(s.camY, ty, 2.4, dt);
    }
    const d = Math.max(h / (2 * t), VIEW_W / (2 * t * aspect));
    const cy = s.camY ?? ty;
    if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    cam.position.set(DIR.x * d, cy + DIR.y * d, DIR.z * d);
    cam.lookAt(0, cy, 0);
  });

  return (
    <group dispose={null}>
      <Lights tier={tier} sun={[-3, 9, 7]} box={5} intensity={2.4} />
      {/* the tower: a soft column behind, the ground cloud, one cloud per floor (zig-zag), the goal on top */}
      <mesh geometry={geo.pillar} material={mats.clay} position={[0, 0, -1.5]} />
      <mesh geometry={geo.ground} material={mats.clay} position={[0, 0, 0]} />
      {spots.slice(1).map((p, i) => (
        <mesh key={i} geometry={geo.platform} material={mats.clay} position={[p.x, p.y, 0]} />
      ))}
      {spots.slice(1, TOWER_FLOORS).map((p, i) => {
        const f = i + 1;
        const at: [number, number, number] = [p.x - Math.sign(p.x) * 0.42, p.y, -0.32];
        return (
          <group key={f}>
            <mesh
              ref={(m) => {
                keepLit.current[f] = m;
              }}
              geometry={geo.keepLit}
              material={mats.glow}
              position={at}
              visible={false}
            />
            <mesh
              ref={(m) => {
                keepDim.current[f] = m;
              }}
              geometry={geo.keepDim}
              material={mats.clay}
              position={at}
            />
          </group>
        );
      })}
      <group ref={goal} position={[0, TOP_Y + 0.02 + (path === "star" ? 0.45 : 0), -0.42]} scale={0.85}>
        <mesh geometry={geo.goal} material={path === "star" ? mats.glow : mats.clay} />
      </group>
      <mesh ref={lift} geometry={geo.lift} material={mats.clay} />

      <mesh ref={ring} geometry={kit.torus(0.42, 0.03)} material={mats.ring} rotation-x={-Math.PI / 2} />
      <group ref={climber} scale={CLIMBER_SCALE}>
        <group ref={body}>
          <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
        </group>
      </group>
      <BlobShadow ref={climberShadow} size={[0.62, 0.5]} />
      {buddy ? (
        <>
          <group ref={petRoot} scale={PET_SCALE}>
            <Pet kind={buddy as PetKind} drive={pet} />
          </group>
          <BlobShadow ref={petShadow} size={[0.42, 0.34]} />
        </>
      ) : null}

      {L.clouds.map((p, i) => (
        <mesh key={`c${i}`} geometry={geo.cloud} material={mats.far} position={[p.x, p.y ?? 0, p.z]} rotation-y={p.ry ?? 0} scale={p.s ?? 1} />
      ))}
      {L.stars.map((p, i) => (
        <mesh key={i} geometry={geo.star} material={mats.starSky} position={[p.x, p.y ?? 0, p.z]} scale={p.s ?? 0.06} />
      ))}
      <Burst fire={fire} reduced={reduced} max={low ? 10 : 18} />
    </group>
  );
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = clamp01(t) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
