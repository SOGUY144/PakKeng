import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { damp, frameDt } from "../anim";
import { useKit } from "../kitContext";
import { Bunny } from "../models/Bunny";
import { bunnyDrive } from "../models/drives";
import { Egg, type EggKind } from "../models/Egg";
import { Bee, Fence, GARDEN_SOIL_Y, GardenPlot, Plant, Scarecrow, WateringCan, type PlantKind } from "../models/Garden";
import { Pet, type PetKind } from "../models/Pets";
import { eggDrive, petDrive, plantDrive, wateringDrive } from "../models/petDrives";
import { C } from "../palette";
import { BlobShadow, Burst, Field, Lights, type BurstFire, type Placement } from "../parts";
import * as S from "../shapes";
import type { IslandSpec } from "../spec";

type V3 = [number, number, number];

/** Where things stand on the island (y = 0 is the grass). The character faces the camera (+Z). */
const AVATAR: V3 = [0, 0, 0.75];
const BUDDY: V3 = [0.95, 0, 1.05];
const NEST: V3 = [-1.85, 0, 0.35];
const BED_X = [1.3, 2.55, 3.8];
const BED_Z = -0.45;
// the first ones stand near the middle of the phone framing (a just-hatched pet must not land at the frame edge)
const PET_SPOTS: V3[] = [
  [-1.05, 0, -0.3],
  [0.75, 0, -1.25],
  [-2.5, 0, -0.75],
  [-1.6, 0, -1.65],
  [-3.2, 0, 0.3],
];
/** Plants are modelled at pot size; in the island beds they are drawn larger so a phone can read them. */
const PLANT_SCALE = 2.2;
/** Colour of each bed's little name stake (same family as the fruit), so even a fresh seed shows what was planted. */
const STAKE: Record<PlantKind, string> = { carrot: "#ff9a3c", sunflower: "#ffcf3a", strawberry: "#ff5d73", starfruit: "#b39cf0" };

/** Fixed decoration around the island edge (same every visit). */
const DECOR: Record<"trees" | "flowersPink" | "flowersWhite" | "tufts" | "bushes", Placement[]> = {
  trees: [
    { x: -4.0, z: -0.6, s: 1.15, ry: 0.4 },
    { x: 3.9, z: -2.3, s: 1.2, ry: 1.2 },
    { x: 1.0, z: -3.5, s: 1.1, ry: 2.1 },
    { x: -1.7, z: -3.3, s: 1.25, ry: 0.9 },
    // front-left (a front-right tree hid the third bed in the garden framing on phones)
    { x: -3.6, z: 2.2, s: 0.95, ry: 2.8 },
  ],
  flowersPink: [
    { x: -0.9, z: 2.7, s: 1.1 },
    { x: 3.2, z: 2.1, s: 1.0 },
    { x: -3.6, z: 1.4, s: 1.2 },
  ],
  flowersWhite: [
    { x: 1.9, z: 2.5, s: 1.1 },
    { x: -2.6, z: 2.6, s: 1.0 },
  ],
  tufts: [
    { x: -2.2, z: 2.0, s: 1.2 },
    { x: 0.8, z: 3.1, s: 1.0 },
    { x: 2.8, z: 3.2, s: 1.1 },
    { x: -1.2, z: -2.4, s: 1.0 },
  ],
  bushes: [
    { x: -4.1, z: 1.0, s: 0.9 },
    { x: 4.2, z: -1.2, s: 0.85 },
    { x: -0.2, z: -2.9, s: 0.8 },
  ],
};

/** Camera framing per tab: a world rectangle (w × h around `target`) kept in view, seen along `dir`. */
const FOCUS: Record<IslandSpec["focus"], { target: V3; dir: V3; w: number; h: number }> = {
  // the character with its pet (pet stands at +0.95)
  me: { target: [0.45, 0.75, 0.85], dir: [0.05, 0.36, 1], w: 3.1, h: 2.4 },
  // egg nest (−1.85) … character … pet (+0.95), all in view on a phone
  pets: { target: [-0.45, 0.55, 0.6], dir: [-0.06, 0.42, 1], w: 4.5, h: 2.6 },
  garden: { target: [2.45, 0.45, -0.35], dir: [0.08, 0.6, 1], w: 4.4, h: 2.5 },
};

function parseEgg(s: string): { kind: EggKind; crack: 0 | 1 | 2 | 3; ready: boolean } | null {
  if (!s) return null;
  const [kind, crack, ready] = s.split(":");
  return { kind: kind as EggKind, crack: Math.max(0, Math.min(3, Number(crack) || 0)) as 0 | 1 | 2 | 3, ready: ready === "1" };
}

function parseBeds(s: string): ({ kind: PlantKind; stage: 0 | 1 | 2 | 3 } | null)[] {
  return s.split(",").map((b) => {
    if (!b) return null;
    const [kind, stage] = b.split(":");
    return { kind: kind as PlantKind, stage: Math.max(0, Math.min(3, Number(stage) || 0)) as 0 | 1 | 2 | 3 };
  });
}

/** Smooth camera between the framings (reduced motion: cuts straight to the new framing). */
function IslandCamera({ focus, reduced }: { focus: IslandSpec["focus"]; reduced: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const look = useRef(new THREE.Vector3(...FOCUS[focus].target));
  const want = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);
  const first = useRef(true);
  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const f = FOCUS[focus];
    const aspect = size.width / Math.max(1, size.height);
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(f.h / (2 * t), f.w / (2 * t * aspect));
    wantLook.set(...f.target);
    want.set(...f.dir).normalize().multiplyScalar(d).add(wantLook);
    if (first.current || reduced) {
      camera.position.copy(want);
      look.current.copy(wantLook);
      first.current = false;
    } else {
      camera.position.set(damp(camera.position.x, want.x, 3, dt), damp(camera.position.y, want.y, 3, dt), damp(camera.position.z, want.z, 3, dt));
      look.current.set(damp(look.current.x, wantLook.x, 3, dt), damp(look.current.y, wantLook.y, 3, dt), damp(look.current.z, wantLook.z, 3, dt));
    }
    camera.lookAt(look.current);
  });
  return null;
}

/** One bed: the plot, its plant (a happy wiggle when it was just watered), and the pick animation (it lifts out, spins, shrinks). */
function Bed({
  x,
  index,
  bed,
  pickSeq,
  pickBed,
  water,
  reduced,
}: {
  x: number;
  index: number;
  bed: { kind: PlantKind; stage: 0 | 1 | 2 | 3 } | null;
  pickSeq: number;
  pickBed: number;
  water: number;
  reduced: boolean;
}) {
  const kit = useKit();
  const stakeGeo = kit.geo("island-bed-stake", () => new THREE.CylinderGeometry(0.02, 0.026, 0.42, 8));
  const signGeo = kit.geo("island-bed-sign", () => new THREE.BoxGeometry(0.2, 0.14, 0.03));
  const lift = useRef<THREE.Group>(null);
  const plant = useRef(plantDrive({ reduced }));
  // t ≥ 0: lifting out · gone: picked and lifted, stays hidden until the bed holds a new plant
  const st = useRef({ seen: pickSeq, t: -1, gone: false, plant: bed ? bed.kind : "", water });
  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    const s = st.current;
    plant.current.reduced = reduced;
    if (water !== s.water) {
      s.water = water;
      plant.current.wiggle += 1;
    }
    // only a new pick of THIS bed lifts it (another bed's pick must not replay it)
    if (pickSeq !== s.seen) {
      s.seen = pickSeq;
      if (pickBed === index && bed) s.t = 0;
    }
    const kind = bed ? bed.kind : "";
    if (kind !== s.plant) {
      s.plant = kind;
      s.gone = false;
    }
    const g = lift.current;
    if (!g) return;
    if (s.t >= 0) {
      s.t += dt / (reduced ? 0.45 : 1);
      const k = Math.min(1, s.t);
      g.position.y = ((reduced ? 0.2 : 0.9) / PLANT_SCALE) * k; // world units, inside the scaled plant group
      g.rotation.y = reduced ? 0 : k * Math.PI * 2;
      g.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (k >= 1) {
        s.t = -1;
        s.gone = true;
      }
    } else if (s.gone) {
      g.scale.setScalar(0.001);
    } else {
      g.position.y = 0;
      g.rotation.y = 0;
      g.scale.setScalar(1);
    }
  });
  return (
    <group position={[x, 0, BED_Z]}>
      <GardenPlot />
      {bed ? (
        <>
          <group position={[-0.43, 0, -0.24]} rotation-y={0.25}>
            <mesh geometry={stakeGeo} material={kit.clay(C.wood)} position={[0, 0.27, 0]} />
            <mesh geometry={signGeo} material={kit.clay(STAKE[bed.kind])} position={[0, 0.44, 0.03]} />
          </group>
          <group position={[0, GARDEN_SOIL_Y, 0]} scale={PLANT_SCALE}>
            <group ref={lift}>
              <Plant kind={bed.kind} stage={bed.stage} drive={plant} />
            </group>
          </group>
        </>
      ) : null}
    </group>
  );
}

/**
 * เกาะของฉัน 3D: ตัวละครที่เด็กเลือก (ชนิด + ชุด) สัตว์ที่พาไปด้วย ไข่ในรัง และแปลงผักสามแปลง
 * - ทุกอย่างมาจากข้อมูลรางวัล (src/data/rewards.ts) ผ่าน props: ไข่แตกตามความคืบหน้า ต้นไม้โตตามระยะ ชุดตามที่ใส่
 * - เหตุการณ์ (ฟัก / เก็บ / เปลี่ยนชุด) เล่นครั้งเดียวต่อ seq — ฉากไม่นับหรือให้รางวัลเอง
 * - แท็บที่เด็กดูเลื่อนกล้องไปส่วนนั้น (ลดการเคลื่อนไหว: ตัดภาพ ไม่เลื่อน)
 */
export function IslandWorld(spec: IslandSpec) {
  const { tier, reduced, species, outfit, buddy, pets, egg, beds, focus, hatchSeq, pickSeq, pickBed, cheerSeq } = spec;
  const kit = useKit();
  const geo = useMemo(
    () => ({
      tree: kit.geo("tree", S.tree),
      bush: kit.geo("bush", S.bush),
      flowerPink: kit.geo("flower-pink", () => S.flower(C.pink)),
      flowerWhite: kit.geo("flower-white", () => S.flower(C.white)),
      tuft: kit.geo("tuft", S.grassTuft),
      rock: kit.geo("rock", S.rock),
      cloud: kit.geo("cloud", S.cloud),
      sea: kit.geo("island-sea", () => new THREE.CircleGeometry(30, 48)),
      top: kit.geo("island-top", () => new THREE.CylinderGeometry(4.6, 4.9, 0.5, 48)),
      cliff: kit.geo("island-cliff", () => new THREE.CylinderGeometry(4.9, 3.6, 1.4, 48)),
      sand: kit.geo("island-sand", () => new THREE.RingGeometry(4.55, 5.25, 48)),
      house: kit.geo("island-house", () => new THREE.BoxGeometry(1.5, 1.1, 1.2)),
      roof: kit.geo("island-roof", () => new THREE.ConeGeometry(1.25, 0.8, 4)),
      door: kit.geo("island-door", () => new THREE.BoxGeometry(0.36, 0.6, 0.05)),
    }),
    [kit],
  );
  const low = tier === "low";
  const shadows = !low;
  const others = (pets ? pets.split(",") : []).filter(Boolean).slice(0, PET_SPOTS.length) as PetKind[];
  const eggState = parseEgg(egg);
  const bedList = parseBeds(beds);

  const avatar = useRef(bunnyDrive({ reduced }));
  const buddyDrive = useRef(petDrive({ reduced }));
  const otherDrives = useRef(PET_SPOTS.map(() => petDrive({ reduced })));
  const eggD = useRef(eggDrive({ reduced }));
  const can = useRef(wateringDrive({ reduced }));
  // a bed that grew since the last props: the can pours and that plant wiggles (the plant itself pops to its new stage)
  const [water, setWater] = useState<number[]>(() => BED_X.map(() => 0));
  const prevStages = useRef<number[] | null>(null);
  useEffect(() => {
    const now = bedList.map((b) => (b ? b.stage : -1));
    const prev = prevStages.current;
    prevStages.current = now;
    if (!prev) return;
    const grew = now.map((st, i) => st > (prev[i] ?? -1) && (prev[i] ?? -1) >= 0);
    if (grew.some(Boolean)) {
      can.current.pour += 1;
      setWater((w) => w.map((n, i) => (grew[i] ? n + 1 : n)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beds]);
  const fire = useRef<BurstFire>({ seq: 0, x: 0, y: 0, z: 0 });
  const seen = useRef({ hatch: hatchSeq, pick: pickSeq, cheer: cheerSeq });
  const sea = useRef<THREE.Mesh>(null);
  const clock = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = frameDt(dtRaw);
    clock.current += dt;
    const s = seen.current;
    const a = avatar.current;
    a.reduced = reduced;
    a.pose = "stand";
    if (cheerSeq !== s.cheer) {
      s.cheer = cheerSeq;
      a.cheer += 1;
    }
    if (hatchSeq !== s.hatch) {
      s.hatch = hatchSeq;
      eggD.current.hatch += 1;
      a.cheer += 1;
      buddyDrive.current.cheer += 1;
      fire.current = { seq: fire.current.seq + 1, x: NEST[0], y: 0.6, z: NEST[2] };
    }
    if (pickSeq !== s.pick) {
      s.pick = pickSeq;
      a.cheer += 1;
      const x = BED_X[Math.max(0, Math.min(BED_X.length - 1, pickBed))];
      fire.current = { seq: fire.current.seq + 1, x, y: 0.8, z: BED_Z };
    }
    eggD.current.reduced = reduced;
    can.current.reduced = reduced;
    eggD.current.wobble = eggState ? (eggState.ready ? 1 : eggState.crack * 0.18) : 0;
    // no egg on the island: the next egg must mount closed (a hatch count above 0 at mount shows it open)
    if (!eggState) eggD.current.hatch = 0;
    buddyDrive.current.reduced = reduced;
    for (const d of otherDrives.current) d.reduced = reduced;
    if (sea.current && !reduced) sea.current.position.y = -0.62 + Math.sin(clock.current * 0.8) * 0.02;
  });

  return (
    <>
      <color attach="background" args={["#dff2ff"]} />
      <fog attach="fog" args={["#dff2ff", 18, 40]} />
      <Lights tier={tier} sun={[-3, 9, 7]} box={7} />
      <IslandCamera focus={focus} reduced={reduced} />

      {/* sea, sand and the grassy island */}
      <mesh ref={sea} geometry={geo.sea} material={kit.clay("#9fd8f0", { roughness: 0.6 })} rotation-x={-Math.PI / 2} position={[0, -0.62, 0]} />
      <mesh geometry={geo.sand} material={kit.clay("#f4e2b8")} rotation-x={-Math.PI / 2} position={[0, -0.5, 0]} />
      <mesh geometry={geo.cliff} material={kit.clay("#c99a6a")} position={[0, -0.95, 0]} />
      <mesh geometry={geo.top} material={kit.clay(C.grass)} position={[0, -0.25, 0]} receiveShadow={shadows} />

      {/* house at the back left */}
      <group position={[-3.0, 0, -2.0]} rotation-y={0.35}>
        <mesh geometry={geo.house} material={kit.clay("#fff3e0")} position={[0, 0.55, 0]} castShadow={shadows} />
        <mesh geometry={geo.roof} material={kit.clay(C.pink)} position={[0, 1.5, 0]} rotation-y={Math.PI / 4} castShadow={shadows} />
        <mesh geometry={geo.door} material={kit.clay("#c98b4c")} position={[0, 0.3, 0.62]} />
      </group>

      {/* trees, bushes and flowers around the edge */}
      <Field geometry={geo.tree} items={low ? DECOR.trees.slice(0, 2) : DECOR.trees} castShadow={shadows} />
      {!low ? <Field geometry={geo.flowerPink} items={DECOR.flowersPink} /> : null}
      {!low ? <Field geometry={geo.flowerWhite} items={DECOR.flowersWhite} /> : null}
      {!low ? <Field geometry={geo.tuft} items={DECOR.tufts} /> : null}
      <Field geometry={geo.bush} items={low ? DECOR.bushes.slice(0, 1) : DECOR.bushes} />

      {/* the child's character and the pet that comes along */}
      <group position={AVATAR}>
        <Bunny drive={avatar} outfit={outfit} species={species as never} />
        <BlobShadow size={[0.9, 0.7]} />
      </group>
      {buddy ? (
        <group position={BUDDY} rotation-y={-0.4}>
          <Pet kind={buddy as PetKind} drive={buddyDrive} />
          <BlobShadow size={[0.6, 0.5]} />
        </group>
      ) : null}
      {others.map((p, i) => (
        <group key={`${p}-${i}`} position={PET_SPOTS[i]} rotation-y={0.3 - i * 0.2}>
          <Pet kind={p} drive={{ current: otherDrives.current[i] }} />
        </group>
      ))}

      {/* the egg being warmed */}
      {eggState ? (
        <group position={NEST}>
          <Egg kind={eggState.kind} crack={eggState.crack} drive={eggD} />
        </group>
      ) : null}

      {/* the garden: fence, scarecrow, three beds, a watering can and a bee */}
      <group position={[2.55, 0, -1.35]}>
        <Fence />
      </group>
      {!low ? (
        <group position={[4.6, 0, -0.9]} rotation-y={-0.5}>
          <Scarecrow reduced={reduced} />
        </group>
      ) : null}
      {BED_X.map((x, i) => (
        <Bed key={i} x={x} index={i} bed={bedList[i] ?? null} pickSeq={pickSeq} pickBed={pickBed} water={water[i] ?? 0} reduced={reduced} />
      ))}
      <group position={[1.0, 0, 0.35]} rotation-y={0.6}>
        <WateringCan drive={can} />
      </group>
      {!low ? (
        <group position={[2.6, 1.1, -0.4]}>
          <Bee reduced={reduced} />
        </group>
      ) : null}

      <Burst fire={fire} reduced={reduced} />
    </>
  );
}
