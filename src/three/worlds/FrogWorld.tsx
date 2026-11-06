import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FriendId } from "../../data/callWords";
import { CALM, damp, easeInOutSine, frameDt, seeded } from "../anim";
import { useKit } from "../kitContext";
import { Frog, type FrogPose } from "../models/Frog";
import { Friend, type FriendPose } from "../models/Friends";
import { C } from "../palette";
import { BlobShadow, Burst, Field, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { FrogSpec } from "../spec";

const PAD_X = [0, -0.85, 0.75, -0.7, 0.85, -0.8, 0.7, -0.2];
const STEP_Z = 1.55;
const RIPPLES = 4;
const HOP_S = 0.55;
/** Pause between the friend turning around and the frog hopping over, so the child sees the reply first. */
const HOP_DELAY_S = 0.7;
/** Facing the child (camera) vs. showing its back. */
const FACE_CHILD = 0.15;
const FACE_AWAY = Math.PI;
const CAM_DIR = new THREE.Vector3(0.18, 0.62, 0.77).normalize();

const bankZ = (n: number) => -(n + 1) * STEP_Z - 0.9;
const padPos = (i: number, n: number): THREE.Vector3 =>
  i > n ? new THREE.Vector3(0, 0.2, bankZ(n) - 0.2) : new THREE.Vector3(PAD_X[i % PAD_X.length], 0.06, -i * STEP_Z);
/** End of the round: the friends that heard the child stand in a row on the far bank (the fish waits in the water in front). */
const bankSpot = (slot: number, count: number, id: FriendId, n: number): THREE.Vector3 => {
  const x = (slot - (count - 1) / 2) * 0.78;
  return id === "fish" ? new THREE.Vector3(x, 0, bankZ(n) + 0.7) : new THREE.Vector3(x, 0.26, bankZ(n) - 0.75);
};

/** Friend k waits on a small islet beside pad k + 1 (the fish swims in the water instead). */
const friendPos = (k: number, id: FriendId): THREE.Vector3 => {
  const px = PAD_X[(k + 1) % PAD_X.length];
  return new THREE.Vector3(px - Math.sign(px || 1) * 1.05, id === "fish" ? 0 : 0.12, -(k + 1) * STEP_Z - 0.2);
};

type Move = { from: THREE.Vector3; to: THREE.Vector3; t: number } | null;

function layout(n: number) {
  const r = seeded(31);
  const rnd = (a: number, b: number) => a + (b - a) * r();
  const far = bankZ(n);
  const side = (count: number, s0: number, s1: number): Placement[] =>
    Array.from({ length: count }, () => {
      const sx = r() < 0.5 ? -1 : 1;
      return { x: sx * rnd(2.3, 3.6), z: rnd(1.5, far + 1), s: rnd(s0, s1), ry: rnd(0, 6) };
    });
  return {
    reeds: side(14, 0.8, 1.3),
    rocks: side(5, 0.7, 1.2).map((p) => ({ ...p, y: -0.08 })),
    floaters: Array.from({ length: 6 }, () => ({ x: rnd(-1.9, 1.9), y: 0.012, z: rnd(1, far + 1), s: rnd(0.35, 0.5), ry: rnd(0, 6) })),
    bankTrees: [
      { x: -2.2, z: far - 1.4, s: 1.3, ry: 1 },
      { x: 2.4, z: far - 1.8, s: 1.5, ry: 2 },
      { x: 0.6, z: far - 2.6, s: 1.1, ry: 3 },
    ] as Placement[],
    bankFlowers: Array.from({ length: 9 }, () => ({ x: rnd(-2.6, 2.6), z: far + rnd(-1.2, 0.2), s: rnd(0.9, 1.3), ry: rnd(0, 6) })),
    far,
  };
}

/**
 * บึงของด่านเรียกเพื่อน 3D: เพื่อนสัตว์รออยู่ข้างใบบัวแต่ละใบโดยหันหลังให้
 * - เด็กพูดอยู่ → เพื่อนตัวปัจจุบันเงี่ยหูฟัง (listening)
 * - ได้ช่วงเสียงที่สัญญาณใช้ได้ → เพื่อนหันมาหาเด็ก ดีใจสั้น ๆ แล้วกบกระโดดไปอยู่ข้างเพื่อน (ทั้งหมดมาจาก state ของตรรกะ ฉากไม่ตัดสินเอง)
 * - สัญญาณใช้ไม่ได้ → เพื่อนเอียงหัวสงสัย (ไม่มีท่าเสียใจ ไม่มีการตกน้ำ)
 * วงแหวนใต้เพื่อนตัวปัจจุบันเป็นสีทอง ไม่ใช่น้ำเงิน/ส้ม เพราะด่านนี้ไม่ได้ตัดสินค่าด้านปากหรือจมูก
 */
export function FrogWorld({ gameRef, frameRef, reduced, tier, friends: friendList, bubbleRef }: FrogSpec) {
  const kit = useKit();
  const ids = useMemo(() => friendList.split(",").filter(Boolean) as FriendId[], [friendList]);
  const n = ids.length;
  const L = useMemo(() => layout(n), [n]);
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
      water: kit.geo("pond", () => new THREE.PlaneGeometry(14, 30)),
      bank: kit.geo("frog-bank", () => new THREE.SphereGeometry(1, 28, 12)),
      islet: kit.geo("friend-islet", () => new THREE.SphereGeometry(1, 20, 10)),
      ripple: kit.geo("ripple", () => new THREE.RingGeometry(0.82, 1, 40)),
      floater: kit.geo("floater", () => new THREE.CircleGeometry(0.2, 10)),
    }),
    [kit],
  );
  const pads = useMemo<Placement[]>(() => Array.from({ length: n + 1 }, (_, i) => ({ x: PAD_X[i % PAD_X.length], z: -i * STEP_Z, ry: i * 1.7 + 0.4 })), [n]);
  const lotus = useMemo(() => [1, 3].filter((i) => i <= n).map((i) => ({ x: PAD_X[i] + (i % 2 ? 0.22 : -0.22), y: 0.08, z: -i * STEP_Z + 0.12, s: 1 })), [n]);
  const islets = useMemo(() => ids.map((id, k) => ({ id, p: friendPos(k, id) })).filter((x) => x.id !== "fish"), [ids]);
  const shadows = tier !== "low";

  const frogPose = useRef<FrogPose>({ crouch: false, airborne: false, land: 0, reduced });
  const poses = useMemo(() => ids.map(() => ({ current: { listening: false, happy: 0, asking: 0, reduced } as FriendPose })), [ids, reduced]);
  const friends = useRef<(THREE.Group | null)[]>([]);
  const frog = useRef<THREE.Group>(null);
  const frogShadow = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ripples = useRef<(THREE.Mesh | null)[]>([]);
  const rippleT = useMemo(() => new Float32Array(RIPPLES).fill(-1), []);
  const rippleMats = useMemo(
    () => Array.from({ length: RIPPLES }, () => kit.own(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }))),
    [kit],
  );
  const sparkle = useRef<BurstFire>({ seq: 0, x: 0, y: 0.8, z: 0 });
  // who is listening: a warm pool of light under the friend + a ring that is gold while the game listens, pale while it plays a sound
  const glow = useRef<THREE.Mesh>(null);
  const glowMat = useMemo(
    () =>
      kit.own(
        new THREE.MeshBasicMaterial({
          map: kit.tex("glow", () => {
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const g = c.getContext("2d") as CanvasRenderingContext2D;
            const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            grd.addColorStop(0, "rgba(255,244,196,0.95)");
            grd.addColorStop(0.5, "rgba(255,228,150,0.45)");
            grd.addColorStop(1, "rgba(255,228,150,0)");
            g.fillStyle = grd;
            g.fillRect(0, 0, 64, 64);
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            return t;
          }),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      ),
    [kit],
  );
  const ringMat = useMemo(() => kit.own(new THREE.MeshBasicMaterial({ color: C.gold })), [kit]);
  const ringIdle = useMemo(() => new THREE.Color(C.creamShade), []);
  const ringLive = useMemo(() => new THREE.Color(C.gold), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const st = useRef<{ game: unknown; ids: string; pad: number; move: Move; pos: THREE.Vector3; cam: THREE.Vector3 | null; face: number[]; show: number[]; spot: THREE.Vector3[]; cheered: boolean; heardSeq: number; askSeq: number; frogFace: number; rip: number; t: number }>({
    game: null,
    ids: friendList,
    pad: 0,
    move: null,
    pos: padPos(0, n),
    cam: null,
    face: ids.map(() => FACE_AWAY),
    show: ids.map(() => 0),
    spot: ids.map((id, k) => friendPos(k, id)),
    cheered: false,
    heardSeq: 0,
    askSeq: 0,
    frogFace: 0,
    rip: 0,
    t: 0,
  });

  const fireRipple = (p: THREE.Vector3) => {
    const w = st.current;
    const i = w.rip;
    w.rip = (i + 1) % RIPPLES;
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
    const done = s.phase === "done";
    const current = Math.min(s.index, n - 1);
    const targetPad = done ? n + 1 : s.index + (s.words[s.index]?.heard ? 1 : 0);
    if (w.game !== g) {
      // new round (restart): everyone back to the start at once
      w.game = g;
      w.pad = targetPad;
      w.pos = padPos(targetPad, n);
      w.move = null;
      w.cam = null;
      w.heardSeq = s.heardSeq;
      w.askSeq = s.askSeq;
      w.face = ids.map((_, k) => (s.words[k]?.heard || s.words[k]?.skipped ? FACE_CHILD : FACE_AWAY));
      w.show = ids.map((_, k) => (k <= s.index ? 1 : 0));
      w.spot = ids.map((id, k) => friendPos(k, id));
      w.cheered = false;
      w.ids = friendList;
    }
    if (w.ids !== friendList) {
      // the child picked who comes next: only friends still waiting (hidden) swapped places, so they move at once
      w.ids = friendList;
      for (let k = s.index; k < n; k++) {
        w.spot[k] = friendPos(k, ids[k]);
        w.face[k] = FACE_AWAY;
      }
    }

    // react to the logic: the friend that heard the child cheers; an unusable call gets a curious tilt
    if (s.heardSeq !== w.heardSeq) {
      w.heardSeq = s.heardSeq;
      poses[current].current.happy += 1;
      const fp = friendPos(current, ids[current]);
      sparkle.current = { seq: sparkle.current.seq + 1, x: fp.x, y: fp.y + 0.9, z: fp.z };
    }
    if (s.askSeq !== w.askSeq) {
      w.askSeq = s.askSeq;
      poses[current].current.asking += 1;
    }
    if (targetPad > w.pad) {
      // the frog joins the friend once it has turned around (skipping moves on without waiting)
      const heardJoin = !done && s.words[s.index]?.heard;
      w.move = { from: w.pos.clone(), to: padPos(targetPad, n), t: heardJoin ? -HOP_DELAY_S / HOP_S : 0 };
      w.pad = targetPad;
    }

    // friends hide until their turn (then pop up), keep their back to the child until they have heard
    // (or were passed), then face the child; at the end the ones that heard gather on the far bank and cheer
    const heardIds = done ? ids.filter((_, k) => s.words[k]?.heard) : [];
    const gathering = done && !w.move;
    for (let k = 0; k < n; k++) {
      const word = s.words[k];
      const want = word && (word.heard || word.skipped || k < s.index) ? FACE_CHILD : FACE_AWAY;
      w.face[k] = damp(w.face[k], want, reduced ? 3 : 6, dt);
      const shown = done || k <= s.index ? 1 : 0;
      w.show[k] = damp(w.show[k], shown, reduced ? 4 : 7, dt);
      const slot = heardIds.indexOf(ids[k]);
      const home = gathering && slot >= 0 ? bankSpot(slot, heardIds.length, ids[k], n) : friendPos(k, ids[k]);
      const sp = w.spot[k];
      const glide = reduced ? 1.8 : 3;
      sp.x = damp(sp.x, home.x, glide, dt);
      sp.y = damp(sp.y, home.y, glide, dt);
      sp.z = damp(sp.z, home.z, glide, dt);
      const p = poses[k].current;
      p.reduced = reduced;
      p.listening = !done && k === s.index && s.inAttempt && f.valid;
      if (gathering && !w.cheered && slot >= 0) p.happy += 1;
      const grp = friends.current[k];
      if (grp) {
        grp.position.copy(sp);
        grp.rotation.y = w.face[k];
        grp.visible = w.show[k] > 0.02;
        grp.scale.setScalar(Math.max(0.001, w.show[k]));
      }
    }
    if (gathering) w.cheered = true;

    // frog hop (reduced motion: the same hop, slower and lower — never a jump cut)
    const fp = frogPose.current;
    fp.reduced = reduced;
    fp.crouch = false;
    let airborne = false;
    const m = w.move;
    if (m) {
      m.t += dt / (reduced ? HOP_S * CALM.slow : HOP_S);
      const k = THREE.MathUtils.clamp(m.t, 0, 1);
      const e = easeInOutSine(k);
      w.pos.lerpVectors(m.from, m.to, e);
      w.pos.y = THREE.MathUtils.lerp(m.from.y, m.to.y, e) + Math.sin(Math.PI * k) * (reduced ? 0.3 : 0.75);
      airborne = m.t > 0 && m.t < 1;
      fp.crouch = m.t < 0;
      if (m.t >= 1) {
        fp.land += 1;
        fireRipple(m.to);
        w.move = null;
      }
    } else {
      w.pos.copy(padPos(w.pad, n));
    }
    fp.airborne = airborne;

    // the frog looks at the friend it is calling, or toward the next pad while hopping
    const look = done ? padPos(n + 1, n) : friendPos(current, ids[current]);
    const lookAt = w.move ? w.move.to : look;
    const wantFace = Math.atan2(lookAt.x - w.pos.x, lookAt.z - w.pos.z);
    w.frogFace = damp(w.frogFace, wantFace, reduced ? 5 : 9, dt);
    if (frog.current) {
      frog.current.position.copy(w.pos);
      frog.current.rotation.y = w.frogFace;
    }
    if (frogShadow.current) {
      const air = Math.max(0, w.pos.y - 0.06);
      frogShadow.current.position.set(w.pos.x, 0.07, w.pos.z);
      frogShadow.current.scale.setScalar(0.85 - air * 0.4);
    }

    // the friend being called: gold ring + warm light while the game listens; pale and dim while it plays a sound
    // (no blue/orange: nothing about oral/nasal is judged here). While the child speaks the ring holds still.
    const rp = friendPos(current, ids[current]);
    const gameSpeaking = s.phase === "playing" || s.phase === "settle";
    const listeningNow = !done && !gameSpeaking && f.valid;
    const speakingNow = s.inAttempt && f.valid;
    if (ring.current) {
      ring.current.visible = !done;
      if (!done) {
        ring.current.position.set(rp.x, ids[current] === "fish" ? 0.02 : 0.15, rp.z);
        const pulse = speakingNow ? 0 : Math.sin(w.t * 3) * 0.03 * (reduced ? CALM.amp : 1);
        ring.current.scale.setScalar(1 + pulse + (speakingNow ? 0.08 : 0));
        ringMat.color.lerpColors(ringIdle, ringLive, listeningNow ? 1 : 0);
      }
    }
    if (glow.current) {
      glow.current.position.set(rp.x, ids[current] === "fish" ? 0.03 : 0.155, rp.z);
      const want = done ? 0 : listeningNow ? (speakingNow ? 0.85 : 0.6) : 0.12;
      glowMat.opacity = damp(glowMat.opacity, want, 6, dt);
    }

    // keep the HTML speech bubble above the friend's head (never over it, and never as a texture)
    const bubble = bubbleRef.current;
    if (bubble) {
      head.set(rp.x, rp.y + (ids[current] === "fish" ? 0.95 : 1.1), rp.z).project(camera);
      bubble.style.translate = `${Math.round((head.x * 0.5 + 0.5) * size.width)}px ${Math.round((-head.y * 0.5 + 0.5) * size.height)}px`;
    }

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

    // camera: frames the frog's pad and the friend ahead; moves only while the frog is settled (no swinging mid-hop)
    const settled = !w.move;
    const focus = done ? padPos(n + 1, n) : padPos(Math.min(w.pad, n), n);
    const aspect = size.width / Math.max(1, size.height);
    // close enough that the friend being called reads clearly on a phone; wide screens see more of the pond around it
    const dist = Math.max(5.6, 3.4 / aspect + 2.5);
    // looks a bit down from above, centred nearer the friend than the frog, so the frog does not crowd the friend
    const want = new THREE.Vector3(focus.x * 0.3 + 0.05, 0.3, focus.z - (done ? 0.5 : 1.6)).add(CAM_DIR.clone().multiplyScalar(dist));
    if (!w.cam) w.cam = want.clone();
    else if (settled) {
      // reduced motion: the same glide, slower (no cut)
      const glide = reduced ? 1.2 : 2.4;
      w.cam.x = damp(w.cam.x, want.x, glide, dt);
      w.cam.y = damp(w.cam.y, want.y, glide, dt);
      w.cam.z = damp(w.cam.z, want.z, glide, dt);
    }
    camera.position.copy(w.cam);
    camera.lookAt(w.cam.x - CAM_DIR.x * dist, w.cam.y - CAM_DIR.y * dist, w.cam.z - CAM_DIR.z * dist);
  }, -1);

  return (
    <>
      <fog attach="fog" args={[C.fog, 9, 24]} />
      <group dispose={null}>
        <Lights tier={tier} sun={[-3, 9, 4]} box={9} />
        <mesh geometry={geo.water} material={kit.clay(C.water, { roughness: 0.3 })} rotation-x={-Math.PI / 2} position={[0, 0, -6]} receiveShadow />
        <Field geometry={geo.pad} items={pads} receiveShadow />
        <Field geometry={geo.lotus} items={lotus} />
        <Field geometry={geo.reeds} items={L.reeds} castShadow={shadows} />
        <Field geometry={geo.rock} items={L.rocks} castShadow={shadows} />
        {L.floaters.map((p, i) => (
          <mesh key={i} geometry={geo.floater} material={kit.clay(i % 3 ? C.padDeep : C.pinkSoft)} rotation={[-Math.PI / 2, 0, p.ry ?? 0]} position={[p.x, 0.012, p.z]} scale={p.s} />
        ))}
        {/* far bank = where everyone meets at the end */}
        <mesh geometry={geo.bank} material={kit.clay(C.grass)} position={[0, -0.55, L.far - 1.2]} scale={[4.2, 0.85, 1.9]} receiveShadow />
        <Field geometry={geo.tree} items={L.bankTrees} castShadow={shadows} />
        <Field geometry={geo.flower} items={L.bankFlowers.map((p) => ({ ...p, y: 0.22 }))} />

        {islets.map(({ id, p }) => (
          <mesh key={id} geometry={geo.islet} material={kit.clay(C.moss)} position={[p.x, 0.02, p.z]} scale={[0.5, 0.12, 0.46]} receiveShadow />
        ))}
        {ids.map((id, k) => {
          const p = friendPos(k, id);
          return (
            <group key={id} ref={(el) => void (friends.current[k] = el)} position={[p.x, p.y, p.z]} rotation-y={FACE_AWAY} visible={false}>
              <Friend kind={id} pose={poses[k]} />
              {id === "fish" ? null : <BlobShadow at={[0, 0.002, 0]} size={[0.78, 0.66]} materialKey="friend" opacity={0.75} />}
            </group>
          );
        })}
        <mesh ref={glow} geometry={kit.plane()} material={glowMat} rotation-x={-Math.PI / 2} scale={[1.9, 1.9, 1]} renderOrder={1} />
        <mesh ref={ring} geometry={kit.torus(0.62, 0.035)} material={ringMat} rotation-x={-Math.PI / 2} />

        {Array.from({ length: RIPPLES }, (_, i) => (
          <mesh key={i} ref={(el) => void (ripples.current[i] = el)} geometry={geo.ripple} material={rippleMats[i]} rotation-x={-Math.PI / 2} visible={false} />
        ))}

        <group ref={frog}>
          <Frog pose={frogPose} />
        </group>
        <BlobShadow ref={frogShadow} size={[0.8, 0.8]} materialKey="frog" opacity={0.7} />
        <Burst fire={sparkle} reduced={reduced} max={16} />
      </group>
    </>
  );
}
