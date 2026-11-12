import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { bump, CALM, clamp01, damp, easeInOutSine, easeOutCubic, frameDt, lerp, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { rainbowArch } from "../models/CloudTower";
import { bunnyDrive } from "../models/drives";
import { Airplane, Bubble, Hailstone, MoodCloud } from "../models/Sky";
import { COCKPIT, easeOutBack, moodDrive, NOSE_X } from "../models/skyDrives";
import { C } from "../palette";
import { Burst, FitCamera, Lights, type BurstFire } from "../parts";
import * as S from "../shapes";
import type { PlaneSpec } from "../spec";

/* ---------- Layout (world units; side view, flying towards +x) ---------- */
const PLANE_Y = 1.75;
const FOE_Y = 1.8;
/** Wide stage (desktop, tablet landscape) and narrow stage (phone): the plane and the cloud come closer on a phone. */
const WIDE = { planeX: -2.35, foeX: 2.35, scale: 0.95, width: 7.9 };
const NARROW = { planeX: -1.6, foeX: 1.65, scale: 0.8, width: 5.6 };
/** The cloud / hail slides in from this far to the right, slowly. */
const ENTER = 5.5;
const ENTER_S = 1.8;
/** Sky drift while flying, and the slow-motion share of it while a cloud waits for the child. */
const BASE_SPEED = 2.2;
const SLOW = 0.1;
const WRAP = 11;
const SHOT_R = 0.36;

interface Drifter {
  x: number;
  y: number;
  z: number;
  s: number;
  ry: number;
  /** Parallax: near things move faster. */
  f: number;
}

function decor(low: boolean) {
  const r = seeded(11);
  const far: Drifter[] = Array.from({ length: low ? 6 : 9 }, (_, i) => ({
    x: -WRAP + (i / (low ? 6 : 9)) * 2 * WRAP + r() * 1.5,
    y: 0.5 + r() * 3.4,
    z: -6 - r() * 3,
    s: 0.9 + r() * 0.7,
    ry: r() * 3,
    f: 0.32,
  }));
  const isles: Drifter[] = Array.from({ length: 3 }, (_, i) => ({ x: -8 + i * 7.5 + r() * 2, y: -0.2 + r() * 0.8, z: -7.5, s: 0.9 + r() * 0.4, ry: r() * 3, f: 0.22 }));
  const sea: Drifter[] = Array.from({ length: low ? 7 : 11 }, (_, i) => ({
    x: -WRAP + (i / (low ? 7 : 11)) * 2 * WRAP + r(),
    y: -0.55 + r() * 0.3,
    z: -1.2 - r() * 2.2,
    s: 1.3 + r() * 0.6,
    ry: r() * 3,
    f: 0.85,
  }));
  const lines: Drifter[] = Array.from({ length: low ? 4 : 7 }, (_, i) => ({ x: -WRAP + r() * 2 * WRAP, y: 0.6 + (i / 7) * 2.8 + r() * 0.2, z: -0.6 - r() * 0.8, s: 0.6 + r() * 0.6, ry: 0, f: 2.6 }));
  return { far, isles, sea, lines };
}

/**
 * นักบินฟองสบู่ 3D (มองจากด้านข้าง เครื่องบินบินไปทางขวา)
 * - ทุกอย่างอ่านจาก PlaneFlight ทุกเฟรม (ตรรกะ/การนับอยู่ใน src/logic/plane.ts เท่านั้น ฉากแค่แสดงผล)
 * - เมฆหรือลูกเห็บลอยเข้ามาช้า ๆ แล้วโลกช้าลงจนเกือบหยุด (slow motion) ระหว่างรอเด็กพูด — ไม่มีจับเวลา
 * - เด็กกำลังพูด → ฟองที่จมูกเครื่องบินโตขึ้น (ตามเวลาที่พูด ไม่ขึ้นกับความดัง) · คำที่ใช้ได้ → ฟองลอยไปโดนเมฆ
 *   เมฆเปลี่ยนเป็นสีขาว ยิ้ม มีรุ้ง · ลูกเห็บ → เครื่องบินตีลังกาหลบ · ต่ำกว่าเป้า (ผจญภัย) → ฟองลอยเฉียดข้ามไป ไม่มีอะไรเสีย
 * - ลดการเคลื่อนไหว: ไม่ตีลังกา (ยกตัวขึ้นเล็กน้อยแทน) ฟ้าเลื่อนช้าลง ไม่มีเส้นความเร็ว ผลของรอบเท่ากันทุกอย่าง
 */
export function PlaneWorld({ gameRef, outfit, species, reduced, tier }: PlaneSpec) {
  const kit = useKit();
  const low = tier === "low";
  const narrow = useThree((st) => st.size.width / Math.max(1, st.size.height) < 1.15);
  const lay = narrow ? NARROW : WIDE;
  const PLANE_X = lay.planeX;
  const FOE_X = lay.foeX;
  const NOSE = PLANE_X + NOSE_X * lay.scale;
  const L = useMemo(() => decor(low), [low]);
  const geo = useMemo(
    () => ({
      cloud: kit.geo("cloud", S.cloud),
      island: kit.geo("island", S.island),
      rainbow: kit.geo("tower-goal-rainbow", () => rainbowArch(kit.seg)),
      line: kit.capsule(0.018, 1.1),
    }),
    [kit],
  );
  const mats = useMemo(
    () => ({
      clay: kit.clay(C.white, { vertexColors: true }),
      far: kit.clay(C.white, { vertexColors: true, emissive: "#ffffff", emissiveIntensity: 0.28 }),
      line: kit.own(new THREE.MeshBasicMaterial({ color: C.white, transparent: true, opacity: 0, depthWrite: false })),
    }),
    [kit],
  );

  const bunny = useRef(bunnyDrive({ pose: "ride", reduced }));
  const mood = useRef(moodDrive({ reduced }));
  const plane = useRef<THREE.Group>(null);
  const prop = useRef<THREE.Group>(null);
  const charge = useRef<THREE.Group>(null);
  const shot = useRef<THREE.Group>(null);
  const foe = useRef<THREE.Group>(null);
  const cloudG = useRef<THREE.Group>(null);
  const hailG = useRef<THREE.Group>(null);
  const rainbow = useRef<THREE.Mesh>(null);
  const drift = useRef<(THREE.Object3D | null)[]>([]);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const all = useMemo(() => [...L.far, ...L.isles, ...L.sea, ...L.lines], [L]);
  /** What the scene has already shown (a scene mounted mid-round never replays old cues), and where the drifting sky is. */
  const seen = useRef({ game: null as unknown, enc: 0, hit: 0, speed: 1, enterT: ENTER_S, t: 0, xs: [] as number[] });

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = seen.current;
    const amp = reduced ? CALM.amp : 1;
    s.t += dt;
    if (s.game !== g) {
      s.game = g;
      s.enc = g.encounter;
      s.hit = g.hitSeq;
      s.enterT = ENTER_S * 2;
      mood.current.mood = g.phase === "cheer" && g.kind === "cloud" ? 1 : 0;
    }
    mood.current.reduced = reduced;
    bunny.current.reduced = reduced;

    // ---- cues from the game (each once) ----
    if (g.encounter !== s.enc) {
      s.enc = g.encounter;
      s.enterT = 0;
      mood.current.mood = 0;
    }
    const hail = g.kind === "hail";
    if (g.hitSeq !== s.hit) {
      s.hit = g.hitSeq;
      bunny.current.cheer += 1;
      mood.current.bounce += 1;
      fire.current = hail ? { seq: fire.current.seq + 1, x: PLANE_X, y: PLANE_Y + 0.6, z: 0.3 } : { seq: fire.current.seq + 1, x: FOE_X, y: FOE_Y + 0.4, z: 0.4 };
    }

    // ---- slow motion: the sky nearly stops while a cloud waits for the child ----
    const target = g.phase === "approach" && !g.done ? SLOW : 1;
    s.speed = damp(s.speed, target, 2.6, dt);
    const move = BASE_SPEED * s.speed * dt * (reduced ? 0.5 : 1);
    if (s.xs.length !== all.length) s.xs = all.map((d) => d.x);
    const lineOpacity = reduced ? 0 : 0.6 * clamp01((s.speed - 0.35) / 0.65);
    for (let i = 0; i < all.length; i++) {
      let x = s.xs[i] - move * all[i].f;
      if (x < -WRAP) x += 2 * WRAP;
      s.xs[i] = x;
      const o = drift.current[i];
      if (!o) continue;
      o.position.x = x;
      // the speed lines (one shared material) fade out while the world slows down
      if (all[i].f > 2) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = lineOpacity;
    }
    if (prop.current) prop.current.rotation.x += dt * (reduced ? 5 : 8 + 26 * s.speed);

    // ---- the plane: bobs; rolls past hail on a usable word; wobbles on a near miss ----
    let py = PLANE_Y + Math.sin(s.t * 1.6) * 0.07 * amp;
    let rx = 0;
    let rz = Math.sin(s.t * 1.1) * 0.03 * amp;
    if (hail && g.phase === "shot" && g.outcome === "hit") {
      const k = g.shotK;
      if (reduced) py += bump(k) * 0.35;
      else {
        rx = -Math.PI * 2 * easeInOutSine(k);
        py += bump(k) * 0.95;
      }
    }
    if (hail && (g.phase === "near" || (g.phase === "shot" && g.outcome === "near"))) rz += Math.sin(s.t * 16) * 0.1 * amp;
    if (g.charging) rz += 0.05;
    const p = plane.current;
    if (p) {
      p.position.set(PLANE_X, py, 0);
      p.rotation.set(rx, 0, rz);
    }
    bunny.current.pose = g.done ? "wave" : "ride";

    // ---- the cloud / hail: slides in slowly, then waits; happy cloud + rainbow, or hail drifting past ----
    s.enterT += dt;
    const ek = easeOutCubic(clamp01(s.enterT / (reduced ? ENTER_S * CALM.slow : ENTER_S)));
    let fx = FOE_X + ENTER * (1 - ek);
    let fy = FOE_Y;
    if (hail && g.phase === "cheer") {
      fx -= g.cheerK * 7.5;
      fy -= g.cheerK * 0.7;
    }
    const f = foe.current;
    if (f) {
      f.position.set(fx, fy, 0);
      f.rotation.z = !hail && g.phase === "near" ? Math.sin(s.t * 9) * 0.06 * amp : 0;
      f.visible = !g.done;
    }
    if (hailG.current) {
      hailG.current.visible = hail;
      hailG.current.rotation.z = -s.t * 0.4 * amp;
    }
    if (cloudG.current) cloudG.current.visible = !hail;
    const happy = !hail && g.phase === "cheer" ? 1 : 0;
    mood.current.mood = reduced ? happy : damp(mood.current.mood, happy, 7, dt);

    const rb = rainbow.current;
    if (rb) {
      rb.visible = !hail && g.phase === "cheer";
      rb.scale.setScalar(1.7 * (reduced ? 1 : easeOutBack(clamp01(g.cheerK * 2.4))));
      rb.position.set(fx, FOE_Y - 0.55, -0.9);
    }

    // ---- bubbles: one grows at the nose while the child speaks; it flies when a usable word ends ----
    const ch = charge.current;
    if (ch) {
      const show = !hail && g.phase === "approach" && !g.done && g.charge > 0.02;
      ch.visible = show;
      const r = 0.08 + 0.3 * g.charge;
      ch.position.set(NOSE + r * 0.9, py, 0);
      ch.scale.setScalar(r);
    }
    const sh = shot.current;
    if (sh) {
      const flying = !hail && (g.phase === "shot" || g.phase === "near");
      sh.visible = flying && !(g.phase === "near" && g.nearK > 0.95);
      if (g.phase === "shot") {
        const k = g.shotK;
        const near = g.outcome === "near";
        const x = lerp(NOSE + SHOT_R, fx - (near ? 0.2 : 0.75), k);
        const y = lerp(py, fy, k) + (near ? k * k * 1.3 : bump(k) * 0.25);
        sh.position.set(x, y, 0.1);
        sh.scale.setScalar(SHOT_R);
      } else if (g.phase === "near") {
        // below the target: it sails over the cloud and floats away (nothing is lost)
        const k = g.nearK;
        sh.position.set(fx - 0.2 + k * 1.4, fy + 1.3 + k * 1.5, 0.1);
        sh.scale.setScalar(SHOT_R * (1 - k * 0.6));
      }
    }
  });

  return (
    <group dispose={null}>
      <Lights tier={tier} sun={[-3, 8, 7]} box={6} intensity={2.3} hemi={1.6} />
      <FitCamera target={[0, 1.65, 0]} dir={[0, 0.1, 1]} width={lay.width} height={4.4} fov={34} />

      {/* drifting sky: far clouds, floating islands, a sea of clouds below and (while flying) speed lines */}
      {all.map((d, i) => {
        const isFar = i < L.far.length;
        const isIsle = !isFar && i < L.far.length + L.isles.length;
        const isLine = i >= L.far.length + L.isles.length + L.sea.length;
        const ref = (o: THREE.Object3D | null) => {
          drift.current[i] = o;
        };
        if (isLine)
          return <mesh key={i} ref={ref} geometry={geo.line} material={mats.line} position={[d.x, d.y, d.z]} rotation-z={Math.PI / 2} scale={[1, d.s, 1]} />;
        return (
          <mesh
            key={i}
            ref={ref}
            geometry={isIsle ? geo.island : geo.cloud}
            material={isIsle ? mats.clay : mats.far}
            position={[d.x, d.y, d.z]}
            rotation-y={d.ry}
            scale={isFar || isIsle ? d.s : [d.s * 1.4, d.s * 0.55, d.s]}
          />
        );
      })}

      <mesh ref={rainbow} geometry={geo.rainbow} material={mats.clay} visible={false} />
      <group ref={foe} position={[FOE_X + ENTER, FOE_Y, 0]}>
        <group ref={cloudG}>
          <MoodCloud drive={mood} />
        </group>
        <group ref={hailG} visible={false} scale={0.9}>
          <Hailstone />
        </group>
      </group>

      <group ref={plane} position={[PLANE_X, PLANE_Y, 0]}>
        <group scale={lay.scale}>
          <Airplane prop={prop}>
            <group position={COCKPIT} scale={0.42} rotation-y={0.55}>
              <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
            </group>
          </Airplane>
        </group>
      </group>

      <Bubble ref={charge} />
      <Bubble ref={shot} />
      <Burst fire={fire} reduced={reduced} max={low ? 10 : 18} color={C.butter} />
    </group>
  );
}
