import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { KitProvider } from "./KitProvider";
import { StudioScene, type StudioSubject } from "./worlds/Showcase";

/**
 * Dev-only tool (open /?studio while `npm run dev` runs): renders the real 3D models once and saves
 * still images to public/renders/*.webp through the dev-server endpoint in vite.config.ts.
 * Home and Result show these files, so those pages never need to load three.js.
 */
const FRIENDS = ["crab", "dog", "fish", "bird", "turtle"] as const;
/** The child's character choices (Home shows the one picked on the island). */
const SPECIES = ["bunny", "puppy", "dino", "kitty"] as const;
const ROUTE_IDS = ["flower", "mushroom"] as const;
const DOOR_IDS = ["flower", "star", "shell"] as const;
const PETS = ["puppy", "kitten", "chick", "dino", "dragon", "unicorn"] as const;
const EGGS = ["sun", "leaf", "sky", "star"] as const;

const ALL_SHOTS: { name: StudioSubject; w: number; h: number }[] = [
  { name: "thumb-runner", w: 360, h: 252 },
  { name: "thumb-balloon", w: 360, h: 252 },
  { name: "thumb-frog", w: 360, h: 252 },
  { name: "thumb-kick", w: 360, h: 252 },
  ...SPECIES.map((s) => ({ name: `avatar-${s}` as const, w: 176, h: 176 })),
  { name: "item-cap", w: 128, h: 128 },
  { name: "item-shoes", w: 128, h: 128 },
  { name: "item-scarf", w: 128, h: 128 },
  { name: "item-crown", w: 128, h: 128 },
  ...FRIENDS.flatMap((f) => [
    { name: `friend-${f}` as const, w: 200, h: 200 },
    { name: `friend-${f}-back` as const, w: 200, h: 200 },
  ]),
  // welcome screen: bigger, so they stay sharp on tablets and desktops
  ...SPECIES.map((s) => ({ name: `hero-${s}` as const, w: 440, h: 580 })),
  ...FRIENDS.map((f) => ({ name: `hero-${f}` as const, w: 360, h: 360 })),
  // entry maps: each route as its own little world with the child's character at the start
  ...ROUTE_IDS.flatMap((r) => SPECIES.map((s) => ({ name: `route-${r}-${s}` as const, w: 900, h: 600 }))),
  ...DOOR_IDS.map((d) => ({ name: `door-${d}` as const, w: 540, h: 720 })),
  { name: "thumb-gate", w: 360, h: 252 },
  { name: "chest-closed", w: 200, h: 200 },
  { name: "chest-open", w: 200, h: 200 },
  // Home's island card: the buddy pet, or the egg at its crack stage
  ...PETS.map((p) => ({ name: `pet-${p}` as const, w: 160, h: 160 })),
  ...EGGS.flatMap((e) => ([0, 1, 2, 3] as const).map((c) => ({ name: `egg-${e}-${c}` as const, w: 160, h: 160 }))),
];

/** `/?studio&only=friend` re-renders just the shots whose name starts with "friend" (several: `only=thumb-kick,hero-dino`). */
const only = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("only") : null;
const SHOTS = only ? ALL_SHOTS.filter((s) => only.split(",").some((p) => s.name.startsWith(p))) : ALL_SHOTS;

function Capture({ onShot }: { onShot: (dataUrl: string) => void }) {
  const frames = useRef(0);
  useFrame(({ gl }) => {
    frames.current += 1;
    if (frames.current === 15) onShot(gl.domElement.toDataURL("image/webp", 0.9));
  });
  return null;
}

export function RenderStudio() {
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const shot = SHOTS[index];

  const save = async (dataUrl: string) => {
    const res = await fetch("/__dev/save-render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: shot.name, dataUrl }),
    });
    const kb = Math.round((dataUrl.length * 0.75) / 1024);
    const msg = res.ok ? `saved (${kb} KB)` : `failed: ${await res.text()}`;
    setLog((l) => [...l, `${shot.name}: ${msg}`]);
    setIndex((i) => i + 1);
  };

  return (
    <main style={{ padding: 16, fontFamily: "sans-serif" }}>
      <h1>Render studio (dev only)</h1>
      {shot ? (
        <div style={{ width: shot.w / 2, height: shot.h / 2, background: "#eee" }}>
          <Canvas key={shot.name} dpr={2} flat shadows="percentage" gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ fov: 34 }}>
            <KitProvider tier="high">
              <StudioScene subject={shot.name} />
              <Capture onShot={(u) => void save(u)} />
            </KitProvider>
          </Canvas>
        </div>
      ) : (
        <p id="studio-done">done: {SHOTS.length} images</p>
      )}
      <ul>
        {log.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </main>
  );
}
