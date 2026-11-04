import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { KitProvider } from "./KitProvider";
import { StudioScene, type StudioSubject } from "./worlds/Showcase";

/**
 * Dev-only tool (open /?studio while `npm run dev` runs): renders the real 3D models once and saves
 * still images to public/renders/*.webp through the dev-server endpoint in vite.config.ts.
 * Home and Result show these files, so those pages never need to load three.js.
 */
const SHOTS: { name: StudioSubject; w: number; h: number }[] = [
  { name: "thumb-runner", w: 360, h: 252 },
  { name: "thumb-balloon", w: 360, h: 252 },
  { name: "thumb-frog", w: 360, h: 252 },
  { name: "avatar-bunny", w: 176, h: 176 },
  { name: "item-cap", w: 128, h: 128 },
  { name: "item-shoes", w: 128, h: 128 },
  { name: "item-scarf", w: 128, h: 128 },
  { name: "item-crown", w: 128, h: 128 },
];

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
