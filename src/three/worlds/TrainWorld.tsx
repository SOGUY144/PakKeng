import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { BRANCH_END, cargoById, JUNCTION, stopSpot } from "../../data/trainCargo";
import { lineFor, otherBranch, railGeometry, uOf, v3 } from "../models/trainTrack";
import { TRAIN_LEGS, trainView } from "../../logic/train";
import { clamp01, damp, easeInOutSine, frameDt, lerp } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import { Friend, type FriendKind, type FriendPose } from "../models/Friends";
import { Locomotive, Sleepers, SwitchLever, Wagon } from "../models/Train";
import { beachGeo, bigTreeGeo, cargoGeo, stationGeo } from "../models/trainShapes";
import { C } from "../palette";
import { BlobShadow, Burst, Field, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { TrainSpec } from "../spec";
import { StopFlag } from "./RunnerWorld";

/* ---------- Layout (world units, y up; the track runs away from the camera towards −z; same stops as the 2D track) ---------- */
const WAGON_GAP = 1.2;
const FOV = 30;
/** Normal view: the whole width of the line around the train and the stop ahead — never more zoom than this. */
const VIEW_W = 6.4;
const VIEW_H = 6.2;
/** How far ahead of the engine the camera looks (so the next stop is in view). */
const LOOK_AHEAD = 1.5;
/** Reduced motion: one still view of the whole line (the camera never moves). */
const STILL_W = 7.4;
const STILL_H = 17.5;
const DIR = new THREE.Vector3(0.5, 0.82, 1).normalize();
const FLAG_COLORS = ["#ff9cbc", "#ffd877", "#a8e3c8"];

function decor(low: boolean) {
  const trees: Placement[] = [
    { x: -3.6, z: 1.2, s: 1.2 },
    { x: 3.4, z: -1.6, s: 1.1, ry: 2 },
    { x: -3.9, z: -6.2, s: 1.3, ry: 1 },
    { x: 3.8, z: -9.4, s: 1.2, ry: 3 },
    { x: -0.4, z: -16.5, s: 1.4 },
    { x: 4.6, z: -4.6, s: 0.9 },
  ];
  const flowers: Placement[] = [
    { x: 1.2, z: 1.4 },
    { x: -2.2, z: -1.8 },
    { x: 2.5, z: -5.2 },
    { x: -2.6, z: -8.6 },
    { x: 1.6, z: -11.6 },
    { x: -1.1, z: 1.9 },
  ];
  return { trees: low ? trees.slice(0, 4) : trees, flowers: low ? flowers.slice(0, 3) : flowers };
}

/**
 * ฉากรถไฟส่งของ 3D (มุมกล้องแบบ isometric จากด้านหลังเยื้องขวาบน มองไปทางที่รถวิ่ง)
 * - ทุกอย่างอ่านจาก TrainTrip ทุกเฟรมผ่าน trainView (ชุดเดียวกับฉาก 2D): ตำแหน่งบนรางคำนวณจาก moveK ของเกมโดยตรง
 *   พัก/ซ่อนหน้า = เกมไม่เดิน รถค้างกลางรางจริง กลับมาแล้ววิ่งต่อจากจุดนั้น (ไม่วาร์ป) · ล้อหมุนตามระยะทาง (ไม่ใช่เวลา)
 * - เด็กพูด → ปล่องเริ่มมีไอ (ท่าเท่านั้น ไม่ขึ้นกับความดัง) · คำที่ใช้ได้ → รถออกวิ่งหนึ่งช่วง ความเร็วเท่ากันทุกครั้ง ·
 *   ถึงสถานีด้วยเสียง → ธงขึ้น ประกาย · ข้ามช่วง → รถไหลไปช้า ๆ ไม่มีธง (ไม่ใช่โทษ แค่ไม่นับ) ·
 *   ช่วงสุดท้าย: สับรางไปทางผู้รับ · ถึงปลายทาง → ผู้รับดีใจ สินค้าย้ายจากตู้ไปวางข้างผู้รับ
 * - กล้องไม่หมุนไม่ซูม เลื่อนตามรถแบบนุ่ม เห็นสถานีถัดไป · ลดการเคลื่อนไหว: กล้องนิ่งเห็นทั้งราง ล้อไม่หมุน ไม่มีไอควัน ผลเท่าเดิม
 */
export function TrainWorld({ gameRef, cargo: cargoId, outfit, species, reduced, tier }: TrainSpec) {
  const kit = useKit();
  const cargo = cargoById(cargoId);
  const low = tier === "low";
  const L = useMemo(() => decor(low), [low]);
  const track = useMemo(() => {
    const line = lineFor(cargo.id);
    const other = otherBranch(cargo.id);
    const stopsU = [0, 1, 2, 3, 4].map((s) => uOf(line, v3(stopSpot(cargo.id, s))));
    const length = line.getLength();
    const main = railGeometry(line, 0, 1);
    const side = railGeometry(other, uOf(other, v3(JUNCTION)), 1);
    [main.left, main.right, side.left, side.right].forEach((g) => kit.own(g));
    return { line, stopsU, length, main, side };
  }, [kit, cargo.id]);
  const mats = useMemo(
    () => ({
      clay: kit.clay(C.white, { vertexColors: true }),
      rail: kit.clay("#9a8fae", { roughness: 0.5 }),
      ring: kit.own(new THREE.MeshBasicMaterial({ color: C.creamShade })),
      puff: kit.clay(C.white, { emissive: "#ffffff", emissiveIntensity: 0.35, opacity: 0.92 }),
    }),
    [kit],
  );
  const geo = useMemo(
    () => ({
      station: kit.geo("train-station", stationGeo),
      beach: kit.geo("train-beach", () => beachGeo(kit.seg)),
      tree: kit.geo("train-bigtree", bigTreeGeo),
      smallTree: kit.geo("tree", S.tree),
      flower: kit.geo("flower-pink", () => S.flower(C.pink)),
      ground: kit.geo("train-ground", () => new THREE.PlaneGeometry(26, 34)),
      cargo: kit.geo(`train-cargo-${cargo.id}`, () => cargoGeo(cargo.id, kit.seg)),
    }),
    [kit, cargo.id],
  );
  const ringIdle = useMemo(() => new THREE.Color(C.creamShade), []);
  const ringLive = useMemo(() => new THREE.Color(C.gold), []);

  const bunny = useRef(bunnyDrive({ reduced }));
  const loco = useRef<THREE.Group>(null);
  const wagon = useRef<THREE.Group>(null);
  const locoWheels = useRef<THREE.Group>(null);
  const wagonWheels = useRef<THREE.Group>(null);
  const wagonCargo = useRef<THREE.Group>(null);
  const delivered = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lever = useRef<THREE.Group>(null);
  const flags = useRef<(THREE.Group | null)[]>([]);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const receiver = useRef<FriendPose>({ listening: false, happy: 0, asking: 0, reduced });
  const bystander = useRef<FriendPose>({ listening: false, happy: 0, asking: 0, reduced });
  const tmp = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), w: new THREE.Vector3(), wt: new THREE.Vector3() }), []);
  /** What the scene has already shown (mounted mid-round — 3D retried, rotated, resized — it never replays old cues). */
  const seen = useRef({ game: null as unknown, arrive: 0, popStop: 0, popT: 1, deliverT: 1, delivered: false, camX: null as number | null, camZ: 0, lever: 0, time: 0 });

  const end = stopSpot(cargo.id, TRAIN_LEGS);
  const otherEnd = BRANCH_END[cargo.branch === "left" ? "right" : "left"];
  const branchSide = cargo.branch === "left" ? -1 : 1;
  const stationAt = (s: number): [number, number, number] => {
    const p = stopSpot(cargo.id, s);
    const side = p.x >= 0 ? 1 : -1;
    return [p.x + side * 0.85, 0, p.z];
  };
  const beachAt = BRANCH_END.left;
  const treeAt = BRANCH_END.right;
  const receiverKind = cargo.receiver as FriendKind;
  const otherKind: FriendKind = cargo.receiver === "turtle" ? "bird" : "turtle";
  const receiverSpot = (spot: { x: number; z: number }): [number, number, number] => [spot.x + Math.sign(spot.x) * 0.95, 0.08, spot.z - 0.35];

  useFrame((state, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const v = trainView(g);
    const s = seen.current;
    s.time += dt;
    if (s.game !== g) {
      s.game = g;
      s.arrive = g.arriveSeq;
      s.popT = 1;
      s.deliverT = 1;
      s.delivered = g.at >= TRAIN_LEGS;
      s.camX = null;
      s.lever = g.at >= TRAIN_LEGS - 1 && (g.phase !== "aim" || g.at >= TRAIN_LEGS) ? 1 : 0;
    }

    // ---- cues from the game (each once) ----
    if (g.arriveSeq !== s.arrive) {
      s.arrive = g.arriveSeq;
      s.popStop = g.at;
      s.popT = 0;
      const p = stopSpot(cargo.id, g.at);
      fire.current = { seq: fire.current.seq + 1, x: p.x, y: 1.2, z: p.z };
      if (!reduced) bunny.current.cheer += 1;
      if (g.at >= TRAIN_LEGS) s.deliverT = 0;
    }
    // the receiver is glad whenever the cargo arrives — also after coasting (then without the sparkles)
    if (v.delivered && !s.delivered) {
      s.delivered = true;
      receiver.current.happy += 1;
    }
    s.popT = Math.min(1, s.popT + dt / 0.45);
    s.deliverT = Math.min(1, s.deliverT + dt / 0.7);

    // ---- the train on the rails: position from the game's own progress (frozen while paused) ----
    const { line, stopsU, length } = track;
    const e = v.moving ? (reduced ? v.k : easeInOutSine(v.k)) : 0;
    const u = lerp(stopsU[v.from], stopsU[v.to], e);
    line.getPointAt(u, tmp.p);
    line.getTangentAt(u, tmp.t);
    const lc = loco.current;
    if (lc) {
      lc.position.set(tmp.p.x, 0.06, tmp.p.z);
      lc.rotation.y = Math.atan2(-tmp.t.x, -tmp.t.z);
    }
    const uw = Math.max(0, u - WAGON_GAP / length);
    line.getPointAt(uw, tmp.w);
    line.getTangentAt(uw, tmp.wt);
    const wg = wagon.current;
    if (wg) {
      wg.position.set(tmp.w.x, 0.06, tmp.w.z);
      wg.rotation.y = Math.atan2(-tmp.wt.x, -tmp.wt.z);
    }
    // wheels roll with the distance travelled (not with time); reduced motion: still wheels
    const roll = reduced ? 0 : (u * length) / 0.13;
    for (const group of [locoWheels.current, wagonWheels.current]) group?.children.forEach((w) => (w.rotation.x = -roll));
    const sh = shadow.current;
    if (sh) {
      sh.position.set((tmp.p.x + tmp.w.x) / 2, 0.02, (tmp.p.z + tmp.w.z) / 2);
      sh.rotation.z = -Math.atan2(-tmp.t.x, -tmp.t.z);
    }

    // steam: builds while the child speaks (a pose), puffs while rolling — none with reduced motion
    const moving = v.moving !== null;
    puffs.current.forEach((m, i) => {
      if (!m) return;
      if (reduced) {
        m.visible = i === 0 && v.speaking;
        m.scale.setScalar(0.12);
        m.position.set(0, 1.15, -0.42);
        return;
      }
      const cyc = (s.time * (moving ? 1.6 : 0.9) + i / puffs.current.length) % 1;
      const amount = moving ? 1 : v.steam;
      m.visible = amount > 0.05;
      m.scale.setScalar((0.06 + cyc * 0.16) * amount);
      m.position.set(Math.sin(i * 2.1) * 0.06 * cyc, 1.08 + cyc * 0.7, -0.42 + cyc * 0.35);
    });

    // the child's character in the cab
    const bd = bunny.current;
    bd.reduced = reduced;
    bd.pose = v.delivered || (reduced && g.phase === "arrive") ? "wave" : "stand";

    // listening ring around the engine: only while the game listens for this leg's word; gold while a voice comes in
    const rg = ring.current;
    if (rg) {
      rg.visible = g.phase === "aim" && g.call.state.phase === "turn";
      rg.position.set(tmp.p.x, 0.04, tmp.p.z);
      mats.ring.color.copy(g.speaking ? ringLive : ringIdle);
    }

    // stop flags: up on stops reached by a ride; the newest pops up (reduced: just appears)
    for (let st = 1; st < TRAIN_LEGS; st++) {
      const f = flags.current[st];
      if (!f) continue;
      const up = st <= g.at && v.results[st - 1] === "ride";
      f.visible = up;
      f.scale.setScalar(up ? (st === s.popStop && !reduced ? 0.25 + 0.35 * easeOutBack(s.popT) : 0.6) : 0.6);
    }

    // the track switch tilts towards the receiver's branch once the train sets off on the last leg
    const lastLeg = g.at >= TRAIN_LEGS || (g.at === TRAIN_LEGS - 1 && v.moving !== null);
    s.lever = reduced ? (lastLeg ? 1 : 0) : damp(s.lever, lastLeg ? 1 : 0, 6, dt);
    if (lever.current) lever.current.rotation.z = -branchSide * 0.7 * s.lever;
    receiver.current.reduced = reduced;
    receiver.current.listening = g.at === TRAIN_LEGS - 1 && v.moving !== null;
    bystander.current.reduced = reduced;

    // the delivery: the cargo leaves the wagon and sits beside the receiver
    const dl = delivered.current;
    const wc = wagonCargo.current;
    if (wc) wc.visible = !v.delivered;
    if (dl) {
      dl.visible = v.delivered;
      dl.scale.setScalar(v.delivered && !reduced ? 0.4 + 0.6 * easeOutBack(s.deliverT) : 1);
    }

    // ---- camera: no turning, no zoom; it glides along with the train (reduced motion: one still view of the line) ----
    const cam = state.camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(1, state.size.height);
    const tn = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    let tx: number;
    let tz: number;
    let w: number;
    let h: number;
    if (reduced) {
      tx = 0;
      tz = -6.6;
      w = STILL_W;
      h = STILL_H;
      s.camX = tx;
      s.camZ = tz;
    } else {
      w = VIEW_W;
      h = VIEW_H;
      // across: stay on the middle of the line (the whole width of the track stays in view); on the last leg slide
      // towards the receiver's branch · along: follow the engine, looking a little ahead
      tx = lastLeg ? end.x * 0.55 : 0;
      tz = tmp.p.z - LOOK_AHEAD;
      if (s.camX === null) {
        s.camX = tx;
        s.camZ = tz;
      } else {
        s.camX = damp(s.camX, tx, 2.2, dt);
        s.camZ = damp(s.camZ, tz, 2.2, dt);
      }
    }
    const d = Math.max(h / (2 * tn), w / (2 * tn * aspect));
    if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    const cx = s.camX ?? tx;
    cam.position.set(cx + DIR.x * d, DIR.y * d, s.camZ + DIR.z * d);
    cam.lookAt(cx, 0, s.camZ);
  });

  return (
    <group dispose={null}>
      <Lights tier={tier} sun={[-4, 10, 6]} box={9} intensity={2.4} />
      <mesh geometry={geo.ground} material={kit.clay(C.grass)} rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow />

      {/* the line this delivery runs, and the other branch beyond the switch */}
      <mesh geometry={track.main.left} material={mats.rail} />
      <mesh geometry={track.main.right} material={mats.rail} />
      <Sleepers items={track.main.sleepers} />
      <mesh geometry={track.side.left} material={mats.rail} />
      <mesh geometry={track.side.right} material={mats.rail} />
      <Sleepers items={track.side.sleepers} />

      {/* the depot and the three stops (their flags go up when the train arrives by voice) */}
      {[0, 1, 2, 3].map((st) => {
        const [x, y, z] = stationAt(st);
        return (
          <group key={st} position={[x, y, z]}>
            <mesh geometry={geo.station} material={mats.clay} receiveShadow />
            {st > 0 ? (
              <group
                ref={(gr) => {
                  flags.current[st] = gr;
                }}
                position={[-0.25, 0.08, -0.05]}
                scale={0.6}
                visible={false}
              >
                <StopFlag color={FLAG_COLORS[(st - 1) % FLAG_COLORS.length]} shadows={false} />
              </group>
            ) : null}
          </group>
        );
      })}
      <group position={[JUNCTION.x + 0.6 * branchSide * -1, 0, JUNCTION.z - 0.2]}>
        <SwitchLever lever={lever} />
      </group>

      {/* the two receivers' stations: the beach (turtle) and the big tree (bird) */}
      <mesh geometry={geo.beach} material={mats.clay} position={[beachAt.x - 1.0, 0, beachAt.z - 0.6]} receiveShadow />
      <mesh geometry={geo.tree} material={mats.clay} position={[treeAt.x + 1.3, 0, treeAt.z - 0.9]} scale={2.1} castShadow />
      <group position={receiverSpot(end)} rotation-y={-Math.sign(end.x) * 0.9}>
        <Friend kind={receiverKind} pose={receiver} />
      </group>
      <group position={receiverSpot(otherEnd)} rotation-y={-Math.sign(otherEnd.x) * 0.9} scale={0.85}>
        <Friend kind={otherKind} pose={bystander} />
      </group>
      {/* in front of the receiver (towards the camera), clear of where the train stops */}
      <group ref={delivered} position={[receiverSpot(end)[0], 0.08, receiverSpot(end)[2] + 1.0]} visible={false}>
        <mesh geometry={geo.cargo} material={mats.clay} castShadow />
      </group>

      {/* the train: engine (the child's character in the cab) and the wagon with the cargo */}
      <mesh ref={ring} geometry={kit.torus(0.62, 0.03)} material={mats.ring} rotation-x={-Math.PI / 2} />
      <group ref={loco}>
        <Locomotive wheels={locoWheels}>
          {/* the driver looks back at the child (the camera is behind the train) */}
          <group position={[0, 0.27, 0.45]} scale={0.42} rotation-y={0.35}>
            <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
          </group>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              ref={(m) => {
                puffs.current[i] = m;
              }}
              geometry={kit.sphere()}
              material={mats.puff}
              visible={false}
            />
          ))}
        </Locomotive>
      </group>
      <group ref={wagon}>
        <Wagon cargo={cargo.id} wheels={wagonWheels} cargoRef={wagonCargo} />
      </group>
      <BlobShadow ref={shadow} size={[0.9, 2.4]} />

      <Field geometry={geo.smallTree} items={L.trees} castShadow={!low} />
      <Field geometry={geo.flower} items={L.flowers} />
      <Burst fire={fire} reduced={reduced} max={low ? 10 : 18} />
    </group>
  );
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

