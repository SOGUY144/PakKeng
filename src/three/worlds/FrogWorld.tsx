import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { damp, easeInOutSine, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Frog, type FrogPose } from "../models/Frog";
import { C } from "../palette";
import { BlobShadow, Burst, Field, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { FrogSpec } from "../spec";

const PAD_X = [0, -0.85, 0.75, -0.7, 0.85, -0.8, 0.7, -0.2];
const STEP_Z = 1.55;
const padPos = (i: number): THREE.Vector3 =>
  i >= PAD_X.length ? new THREE.Vector3(0, 0.2, -PAD_X.length * STEP_Z - 0.9) : new THREE.Vector3(PAD_X[i], 0.06, -i * STEP_Z);
const RIPPLES = 4;
const HOP_S = 0.55;

/** hop = a scored step; splash = short hop into shallow water; back = hop back to the safe pad (no reward). */
type Move = { kind: "hop" | "splash" | "back"; from: THREE.Vector3; to: THREE.Vector3; t: number; back?: THREE.Vector3 } | null;

function layout() {
  const r = seeded(31);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const side = (n: number, s0: number, s1: number): Placement[] =>
    Array.from({ length: n }, () => {
      const sx = r() < 0.5 ? -1 : 1;
      return { x: sx * rnd(2.0, 3.6), z: rnd(1.5, -13.5), s: rnd(s0, s1), ry: rnd(0, 6) };
    });
  const end = -PAD_X.length * STEP_Z - 0.9;
  return {
    reeds: side(16, 0.8, 1.3),
    rocks: side(6, 0.7, 1.2).map((p) => ({ ...p, y: -0.08 })),
    lotus: [1, 3, 4, 6].map((i) => ({ x: PAD_X[i] + (i % 2 ? 0.22 : -0.22), y: 0.08, z: -i * STEP_Z + 0.12, s: 1 })),
    floaters: Array.from({ length: 7 }, () => ({ x: rnd(-1.9, 1.9), y: 0.012, z: rnd(1, -12), s: rnd(0.35, 0.5), ry: rnd(0, 6) })),
    bankTrees: [
      { x: -2.2, z: end - 1.4, s: 1.3, ry: 1 },
      { x: 2.4, z: end - 1.8, s: 1.5, ry: 2 },
      { x: 0.6, z: end - 2.6, s: 1.1, ry: 3 },
    ] as Placement[],
    bankFlowers: Array.from({ length: 9 }, () => ({ x: rnd(-2.6, 2.6), z: end + rnd(-1.2, 0.2), s: rnd(0.9, 1.3), ry: rnd(0, 6) })),
    end,
  };
}

/**
 * กบข้ามบึง 3D: ใบบัว 8 ใบเรียงซิกแซกออกไปข้างหน้า มีฝั่งปลายทางเป็นเนินหญ้า
 * - หนึ่งช่วงเสียงที่ผ่านเกณฑ์ = กระโดด 1 ก้าว (ก้าวมาจาก state.step ของตรรกะเท่านั้น ฉากไม่สร้างก้าวเอง)
 * - ไม่ผ่าน = กระโดดสั้น ๆ ตกน้ำตื้นมีน้ำกระเซ็นเบา ๆ แล้วกลับขึ้นใบบัวเดิม (ไม่จม ไม่มีท่าเจ็บ)
 * - ใบบัวถัดไปมีวงแหวนสีน้ำเงิน (เกมนี้ใช้ค่าด้านปาก) กล้องเลื่อนตามช้า ๆ หลังกบลงจอดเท่านั้น
 */
export function FrogWorld({ gameRef, frameRef, reduced, tier }: FrogSpec) {
  const kit = useKit();
  const L = useMemo(() => layout(), []);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const geo = useMemo(
    () => ({
      pad: kit.geo("lily-pad", () => S.lilyPad(0.55)),
      reeds: kit.geo("reeds", S.reeds),
      lotus: kit.geo("lotus", S.lotus),
      rock: kit.geo("rock", S.rock),
      tree: kit.geo("tree", S.tree),
      flower: kit.geo("flower-pink", () => S.flower(C.pink)),
      bush: kit.geo("bush", S.bush),
      water: kit.geo("pond", () => new THREE.PlaneGeometry(14, 30)),
      bank: kit.geo("frog-bank", () => new THREE.SphereGeometry(1, 28, 12)),
      ripple: kit.geo("ripple", () => new THREE.RingGeometry(0.82, 1, 40)),
      floater: kit.geo("floater", () => new THREE.CircleGeometry(0.2, 10)),
    }),
    [kit],
  );
  const pads = useMemo<Placement[]>(() => PAD_X.map((x, i) => ({ x, z: -i * STEP_Z, ry: i * 1.7 + 0.4 })), []);
  const shadows = tier !== "low";

  const pose = useRef<FrogPose>({ crouch: false, airborne: false, land: 0, reduced });
  const frog = useRef<THREE.Group>(null);
  const frogShadow = useRef<THREE.Mesh>(null);
  const target = useRef<THREE.Mesh>(null);
  const ripples = useRef<(THREE.Mesh | null)[]>([]);
  const rippleT = useMemo(() => new Float32Array(RIPPLES).fill(-1), []);
  const rippleMats = useMemo(
    () => Array.from({ length: RIPPLES }, () => kit.own(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }))),
    [kit],
  );
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 0.6, z: 0 });
  const splash = useRef<BurstFire>({ seq: 0, x: 0, y: 0.1, z: 0 });
  const st = useRef<{ game: unknown; step: number; attempts: number; move: Move; pos: THREE.Vector3; cam: THREE.Vector3 | null; face: number; rip: number; t: number }>({
    game: null,
    step: 0,
    attempts: 0,
    move: null,
    pos: padPos(0),
    cam: null,
    face: 0,
    rip: 0,
    t: 0,
  });

  const fireRipple = (p: THREE.Vector3) => {
    const s = st.current;
    const i = s.rip;
    s.rip = (i + 1) % RIPPLES;
    rippleT[i] = 0;
    const m = ripples.current[i];
    if (m) m.position.set(p.x, 0.015, p.z);
  };

  useLayoutEffect(() => {
    camera.fov = 38;
    camera.updateProjectionMatrix();
  }, [camera]);

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = g.state;
    const f = frameRef.current;
    const w = st.current;
    w.t += dt;
    if (w.game !== g) {
      // new round (restart): back to the first pad at once
      w.game = g;
      w.step = s.step;
      w.attempts = s.attempts.length;
      w.move = null;
      w.pos = padPos(s.step);
      w.cam = null;
    }

    // react to the logic: a new step = one hop; a new failed attempt = splash and back
    if (s.step > w.step) {
      w.move = { kind: "hop", from: w.pos.clone(), to: padPos(s.step), t: 0 };
      w.step = s.step;
      w.attempts = s.attempts.length;
    } else if (s.attempts.length > w.attempts) {
      w.attempts = s.attempts.length;
      if (!s.attempts[s.attempts.length - 1].passed && !w.move) {
        const from = padPos(s.step);
        const to = from.clone().lerp(padPos(s.step + 1), 0.42).setY(-0.02);
        w.move = { kind: "splash", from, to, t: 0, back: from.clone() };
      }
    }

    const p = pose.current;
    p.reduced = reduced;
    p.crouch = s.inSegment && f.valid;
    let airborne = false;
    const m = w.move;
    if (m) {
      const dur = m.kind === "splash" ? 0.42 : HOP_S;
      m.t += reduced ? Math.max(1, -m.t + 1) : dt / dur;
      const k = THREE.MathUtils.clamp(m.t, 0, 1); // t < 0 = short pause before the hop (after a splash)
      const e = easeInOutSine(k);
      const h = m.kind === "hop" ? 0.75 : m.kind === "back" ? 0.5 : 0.35;
      w.pos.lerpVectors(m.from, m.to, e);
      w.pos.y = THREE.MathUtils.lerp(m.from.y, m.to.y, e) + Math.sin(Math.PI * k) * h * (reduced ? 0 : 1);
      airborne = m.t > 0 && m.t < 1 && !reduced;
      if (m.t >= 1) {
        if (m.kind === "splash" && m.back) {
          // soft droplets + ripple, then hop back to the safe pad (no scolding, no sinking)
          fireRipple(m.to);
          splash.current = { seq: splash.current.seq + 1, x: m.to.x, y: 0.05, z: m.to.z };
          w.move = { kind: "back", from: m.to.clone(), to: m.back, t: -0.35 / HOP_S };
        } else {
          p.land += 1;
          fireRipple(m.to);
          if (m.kind === "hop") fire.current = { seq: fire.current.seq + 1, x: m.to.x, y: m.to.y + 0.5, z: m.to.z };
          w.move = null;
        }
      }
    } else {
      w.pos.copy(padPos(w.step));
    }
    p.airborne = airborne;

    // face the next pad while getting ready / hopping, otherwise turn toward the player
    const next = padPos(Math.min(w.step + 1, PAD_X.length));
    const towardNext = Math.atan2(next.x - w.pos.x, next.z - w.pos.z);
    const wantFace = w.move || p.crouch ? towardNext : 0.35;
    w.face = reduced ? wantFace : damp(w.face, wantFace, 9, dt);
    if (frog.current) {
      frog.current.position.copy(w.pos);
      frog.current.rotation.y = w.face;
    }
    if (frogShadow.current) {
      const air = Math.max(0, w.pos.y - 0.06);
      frogShadow.current.position.set(w.pos.x, 0.07, w.pos.z);
      frogShadow.current.scale.setScalar(0.85 - air * 0.4);
    }

    // next-pad target ring (blue: this game uses the oral value)
    if (target.current) {
      const show = !s.done && w.step < PAD_X.length - 1;
      target.current.visible = show;
      if (show) {
        const tp = padPos(w.step + 1);
        target.current.position.set(tp.x, 0.09, tp.z);
        const k = 1 + (reduced ? 0 : Math.sin(w.t * 3) * 0.03) + (s.passingLive ? 0.06 : 0);
        target.current.scale.setScalar(k);
      }
    }

    // ripples expand and fade
    for (let i = 0; i < RIPPLES; i++) {
      const rm = ripples.current[i];
      if (!rm) continue;
      if (rippleT[i] >= 0) {
        rippleT[i] += dt / 0.9;
        const k = rippleT[i];
        rm.scale.setScalar(0.25 + k * 0.75);
        rippleMats[i].opacity = 0.7 * (1 - k);
        rm.visible = true;
        if (k >= 1) rippleT[i] = -1;
      } else {
        rm.visible = false;
      }
    }

    // camera: eases forward only when the frog is settled on a pad (no swinging during a hop)
    const settled = !w.move;
    const focus = padPos(Math.min(w.step, PAD_X.length));
    const aspect = size.width / Math.max(1, size.height);
    const dist = Math.max(5.4, 4.8 / aspect + 2.4);
    const want = new THREE.Vector3(focus.x * 0.35 + 0.3, 0.2, focus.z - 1.5).add(new THREE.Vector3(0.2, 0.5, 0.84).multiplyScalar(dist));
    if (!w.cam) w.cam = want.clone();
    else if (settled) {
      if (reduced) w.cam.copy(want);
      else {
        w.cam.x = damp(w.cam.x, want.x, 2.4, dt);
        w.cam.y = damp(w.cam.y, want.y, 2.4, dt);
        w.cam.z = damp(w.cam.z, want.z, 2.4, dt);
      }
    }
    camera.position.copy(w.cam);
    camera.lookAt(w.cam.x - 0.2 * dist, w.cam.y - 0.5 * dist, w.cam.z - 0.84 * dist);
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 9, 24]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-3, 9, 4]} box={9} />
        <mesh geometry={geo.water} material={kit.clay(C.water, { roughness: 0.3 })} rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow />
        <mesh geometry={geo.floater} material={kit.clay(C.padDeep)} rotation-x={-Math.PI / 2} position={[1.6, 0.01, -2]} />
        <Field geometry={geo.pad} items={pads} receiveShadow />
        <Field geometry={geo.lotus} items={L.lotus} />
        <Field geometry={geo.reeds} items={L.reeds} castShadow={shadows} />
        <Field geometry={geo.rock} items={L.rocks} castShadow={shadows} />
        {L.floaters.map((p, i) => (
          <mesh key={i} geometry={geo.floater} material={kit.clay(i % 3 ? C.padDeep : C.pinkSoft)} rotation={[-Math.PI / 2, 0, p.ry ?? 0]} position={[p.x, 0.012, p.z]} scale={p.s} />
        ))}
        {/* far bank = the goal */}
        <mesh geometry={geo.bank} material={kit.clay(C.grass)} position={[0, -0.55, L.end - 1.2]} scale={[4.2, 0.85, 1.9]} receiveShadow />
        <Field geometry={geo.tree} items={L.bankTrees} castShadow={shadows} />
        <Field geometry={geo.flower} items={L.bankFlowers.map((p) => ({ ...p, y: 0.22 }))} />
        <group position={[0.9, 0.2, L.end - 0.5]}>
          <mesh geometry={kit.cylinder(0.025, 0.025, 0.9)} material={kit.clay(C.cream)} position={[0, 0.45, 0]} />
          <mesh geometry={kit.sphereLo()} material={kit.clay(C.gold)} position={[0, 0.92, 0]} scale={0.05} />
          <mesh geometry={kit.geo("frog-flag", () => new THREE.PlaneGeometry(0.36, 0.22))} material={kit.clay(C.pink, { doubleSide: true })} position={[0.19, 0.76, 0]} />
        </group>

        <mesh ref={target} geometry={kit.torus(0.66, 0.035)} material={kit.basic(C.oral)} rotation-x={-Math.PI / 2} />
        {Array.from({ length: RIPPLES }, (_, i) => (
          <mesh key={i} ref={(el) => void (ripples.current[i] = el)} geometry={geo.ripple} material={rippleMats[i]} rotation-x={-Math.PI / 2} visible={false} />
        ))}

        <group ref={frog}>
          <Frog pose={pose} />
        </group>
        <BlobShadow ref={frogShadow} size={[0.8, 0.8]} materialKey="frog" opacity={0.7} />
        <Burst fire={fire} reduced={reduced} max={14} />
        <Burst fire={splash} color="#e8fbff" reduced={reduced} max={14} />
      </group>
    </>
  );
}
