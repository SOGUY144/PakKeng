import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TOPPINGS } from "../../logic/bakery";
import { CALM, clamp01, easeOutCubic, frameDt, lerp } from "../anim";
import { Cake, Counter, ShopBack, ToppingSet } from "../models/Bakery";
import { CAKE_TOP, COUNTER_TOP } from "../models/bakeryLayout";
import { Bunny, type AvatarSpecies } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import { Friend, type FriendKind, type FriendPose } from "../models/Friends";
import { C } from "../palette";
import { BlobShadow, Burst, FitCamera, Lights, type BurstFire } from "../parts";
import type { BakerySpec } from "../spec";

/* ---------- Layout (world units; front view of the counter) ---------- */
/** Wide stage and narrow stage (phone): the baker, the cake and the friend stand closer together on a phone. */
const WIDE = { cakeX: -0.55, customerX: 1.65, bakerX: -2.45, shelfX: -2.6, width: 6.6, targetY: 1.05 };
const NARROW = { cakeX: -0.3, customerX: 1.2, bakerX: -1.55, shelfX: -1.25, width: 4.5, targetY: 1.15 };
const CAKE_Z = 0.05;
const CUSTOMER_Z = -0.85;
/** The friends stand on a step behind the counter so they look over it. */
const STEP_Y = 0.34;
const FRIEND_SCALE = 1.15;
const BAKER_SCALE = 0.85;
const DROP_FROM = 2.3;
const ENTER = 4.2;
const ENTER_S = 1.1;
const MAX_SLOTS = 3;

/** Where topping `i` of `n` stands on the cake top (relative to the cake). */
function slot(i: number, n: number): [number, number] {
  return [(i - (n - 1) / 2) * 0.3, 0.1];
}

const kindIndex = (t: string) => Math.max(0, TOPPINGS.indexOf(t as (typeof TOPPINGS)[number]));

/**
 * ร้านขนมของเพื่อน 3D (มองเคาน์เตอร์จากด้านหน้า เยื้องบนเล็กน้อย)
 * - ทุกอย่างอ่านจาก BakeryShop ทุกเฟรม (ตรรกะ/การนับอยู่ใน src/logic/bakery.ts เท่านั้น ฉากแค่แสดงผล)
 * - เพื่อนสัตว์เดินเข้ามาหลังเคาน์เตอร์ ตั้งใจฟังตอนเด็กพูด · คำที่ใช้ได้ → หน้าขนมที่เด็กเลือกตกลงบนเค้ก ·
 *   ครบตามที่สั่ง → เค้กเลื่อนไปหาเพื่อน เพื่อนกินแล้วดีใจ ตัวละครของเด็ก (คนทำขนม) ดีใจด้วย
 * - ลดการเคลื่อนไหว: หน้าขนมตกตรง ๆ ช้าลง เพื่อนเดินเข้าช้าลง ท่าทางครึ่งเดียว ผลของรอบเท่ากันทุกอย่าง
 */
export function BakeryWorld({ gameRef, customers, outfit, species, reduced, tier }: BakerySpec) {
  const low = tier === "low";
  const narrow = useThree((st) => st.size.width / Math.max(1, st.size.height) < 1.15);
  const lay = narrow ? NARROW : WIDE;
  const CAKE_X = lay.cakeX;
  const CUSTOMER_X = lay.customerX;
  const order = useMemo(() => customers.split(",").filter(Boolean) as FriendKind[], [customers]);
  const kindOf = (c: number): FriendKind => order[c % Math.max(1, order.length)] ?? "dog";
  // the first frame sets the friend at the counter from the game (a scene mounted mid-round shows the right one)
  const [who, setWho] = useState<FriendKind>(order[0] ?? "dog");

  const bunny = useRef(bunnyDrive({ reduced }));
  const friend = useRef<FriendPose>({ listening: false, happy: 0, asking: 0, reduced });
  const friendRoot = useRef<THREE.Group>(null);
  const friendShadow = useRef<THREE.Mesh>(null);
  const cake = useRef<THREE.Group>(null);
  const placed = useRef<(THREE.Mesh | null)[][]>(Array.from({ length: MAX_SLOTS }, () => []));
  const slotGroups = useRef<(THREE.Group | null)[]>([]);
  const falling = useRef<(THREE.Mesh | null)[]>([]);
  const fallGroup = useRef<THREE.Group>(null);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 1, z: 0 });
  const seen = useRef({ game: null as unknown, cust: -1, eat: 0, drop: 0, enterT: ENTER_S * 2 });

  useFrame((_, dtRaw) => {
    const g = gameRef.current;
    if (!g) return;
    const dt = frameDt(dtRaw);
    const s = seen.current;
    if (s.game !== g) {
      s.game = g;
      s.cust = g.customer;
      s.eat = g.eatSeq;
      s.drop = g.dropSeq;
      s.enterT = ENTER_S * 2;
      setWho(kindOf(g.customer));
    }
    friend.current.reduced = reduced;
    bunny.current.reduced = reduced;

    // ---- cues from the game (each once) ----
    if (g.customer !== s.cust) {
      s.cust = g.customer;
      s.enterT = 0;
      if (g.customer < g.customers) setWho(kindOf(g.customer));
    }
    if (g.eatSeq !== s.eat) {
      s.eat = g.eatSeq;
      friend.current.happy += 1;
      bunny.current.cheer += 1;
      fire.current = { seq: fire.current.seq + 1, x: CUSTOMER_X, y: STEP_Y + 1.1, z: CUSTOMER_Z + 0.4 };
    }
    if (g.dropSeq !== s.drop) s.drop = g.dropSeq;

    // ---- the friend: walks in behind the counter, listens while the child speaks ----
    s.enterT += dt;
    const ek = easeOutCubic(clamp01(s.enterT / (reduced ? ENTER_S * CALM.slow : ENTER_S)));
    const fr = friendRoot.current;
    if (fr) {
      fr.visible = !g.done;
      fr.position.set(CUSTOMER_X + ENTER * (1 - ek), STEP_Y, CUSTOMER_Z);
      fr.rotation.y = ek < 0.98 ? -0.9 * (1 - ek) : -0.25;
    }
    const fsh = friendShadow.current;
    if (fsh) {
      fsh.visible = !g.done;
      fsh.position.x = CUSTOMER_X + ENTER * (1 - ek);
    }
    friend.current.listening = g.phase === "order" && g.call.state.inAttempt;

    // ---- the cake: toppings placed so far; slides to the friend and is eaten ----
    const n = g.orderSize;
    const ck = cake.current;
    if (ck) {
      ck.visible = !g.done;
      const k = g.phase === "eat" ? g.eatK : 0;
      const kk = reduced ? (k < 0.5 ? 0 : 1) * 0.5 + k * 0.5 : k;
      ck.position.set(lerp(CAKE_X, CUSTOMER_X - 0.9, Math.min(1, kk * 1.6)), COUNTER_TOP, CAKE_Z);
      ck.scale.setScalar(Math.max(0.05, 1 - 0.95 * clamp01((kk - 0.35) / 0.65)));
    }
    for (let i = 0; i < MAX_SLOTS; i++) {
      const grp = slotGroups.current[i];
      const on = i < g.placed && i < n;
      if (grp) {
        grp.visible = on;
        const [x, z] = slot(i, n);
        grp.position.set(x, CAKE_TOP, z);
      }
      const want = on ? kindIndex(g.cake[i]) : -1;
      placed.current[i].forEach((m, j) => {
        if (m) m.visible = j === want;
      });
    }

    // ---- the topping falling onto the cake on a usable word ----
    const fg = fallGroup.current;
    if (fg) {
      const dropping = g.phase === "drop";
      fg.visible = dropping;
      if (dropping) {
        const [x, z] = slot(g.placed, n);
        const k = reduced ? g.dropK : g.dropK * g.dropK;
        fg.position.set(x, CAKE_TOP + DROP_FROM * (1 - k), z);
        fg.rotation.y = reduced ? 0 : g.dropK * 2.5;
        const want = kindIndex(g.cake[g.placed] ?? g.next);
        falling.current.forEach((m, j) => {
          if (m) m.visible = j === want;
        });
      }
    }

    bunny.current.pose = g.done ? "wave" : "stand";
  });

  return (
    <group dispose={null}>
      <Lights tier={tier} sun={[-2, 9, 3.5]} box={4.5} intensity={2.3} hemi={1.6} />
      <FitCamera target={[0, lay.targetY, 0]} dir={[0, 0.3, 1]} width={lay.width} height={3.5} fov={34} />
      <ShopBack shelfX={lay.shelfX} />

      {/* the child's character bakes behind the counter, left */}
      <group position={[lay.bakerX, STEP_Y - 0.1, -0.8]} rotation-y={0.35} scale={BAKER_SCALE}>
        <Bunny drive={bunny} outfit={outfit} species={species as AvatarSpecies | undefined} />
      </group>

      {/* today's customer on the step behind the counter, right */}
      <group ref={friendRoot} position={[CUSTOMER_X + ENTER, STEP_Y, CUSTOMER_Z]} scale={FRIEND_SCALE}>
        <Friend key={who} kind={who} pose={friend} />
      </group>
      <BlobShadow ref={friendShadow} at={[CUSTOMER_X, STEP_Y, CUSTOMER_Z]} size={[0.8, 0.6]} />

      <Counter />

      <group ref={cake} position={[CAKE_X, COUNTER_TOP, CAKE_Z]}>
        <Cake />
        {Array.from({ length: MAX_SLOTS }, (_, i) => (
          <group
            key={i}
            ref={(gr) => {
              slotGroups.current[i] = gr;
            }}
            visible={false}
          >
            <ToppingSet
              set={(j, m) => {
                placed.current[i][j] = m;
              }}
            />
          </group>
        ))}
        <group ref={fallGroup} visible={false}>
          <ToppingSet
            set={(j, m) => {
              falling.current[j] = m;
            }}
          />
        </group>
      </group>

      <Burst fire={fire} reduced={reduced} max={low ? 10 : 18} color={C.pink} />
    </group>
  );
}
