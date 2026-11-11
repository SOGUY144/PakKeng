import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { lowerAutoTier, publishGfxStats, reportGfxFailure, type Tier } from "./gfx";
import { KitProvider } from "./KitProvider";
import type { WorldSpec } from "./spec";
import { CelebrateWorld } from "./worlds/Showcase";
import { BalloonWorld } from "./worlds/BalloonWorld";
import { FrogWorld } from "./worlds/FrogWorld";
import { GateWorld } from "./worlds/GateWorld";
import { IslandWorld } from "./worlds/IslandWorld";
import { KickWorld } from "./worlds/KickWorld";
import { RunnerWorld } from "./worlds/RunnerWorld";
import { TowerWorld } from "./worlds/TowerWorld";
import { TrainWorld } from "./worlds/TrainWorld";

const MAX_DPR: Record<Tier, number> = { high: 2, medium: 1.5, low: 1 };

/**
 * วัดเฟรมจริงระหว่างเล่น → แสดงในเครื่องมือเดโม และลดระดับคุณภาพเองเมื่อช้าต่อเนื่อง (โหมดอัตโนมัติ)
 * ไม่นับช่วงที่เบราว์เซอร์หน่วงเฟรมเพราะแท็บ/หน้าต่างถูกซ่อน
 */
function PerfProbe({ tier }: { tier: Tier }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ frames: 0, time: 0, slowWindows: 0, start: performance.now() });
  useFrame((_, dt) => {
    const a = acc.current;
    if (dt > 0.25 || document.visibilityState !== "visible") {
      a.frames = 0;
      a.time = 0;
      return;
    }
    a.frames += 1;
    a.time += dt;
    if (a.time < 1) return;
    const fps = a.frames / a.time;
    const info = gl.info.render;
    publishGfxStats({ fps: Math.round(fps), calls: info.calls, triangles: info.triangles, dpr: gl.getPixelRatio(), tier });
    // ignore the first seconds (shader compile / layout), then step down after 3 slow seconds in a row
    const warm = performance.now() - a.start > 4000;
    a.slowWindows = warm && fps < 40 ? a.slowWindows + 1 : 0;
    if (a.slowWindows >= 3) {
      a.slowWindows = 0;
      lowerAutoTier();
    }
    a.frames = 0;
    a.time = 0;
  });
  return null;
}

function World(spec: WorldSpec) {
  switch (spec.kind) {
    case "runner":
      return <RunnerWorld {...spec} />;
    case "gate":
      return <GateWorld {...spec} />;
    case "balloon":
      return <BalloonWorld {...spec} />;
    case "frog":
      return <FrogWorld {...spec} />;
    case "kick":
      return <KickWorld {...spec} />;
    case "tower":
      return <TowerWorld {...spec} />;
    case "train":
      return <TrainWorld {...spec} />;
    case "island":
      return <IslandWorld {...spec} />;
    case "celebrate":
      return <CelebrateWorld {...spec} />
  }
}

/** Default export for React.lazy: the only entry point into the three.js chunk. */
export default function WorldCanvas(spec: WorldSpec) {
  const { tier, active } = spec;
  return (
    <Canvas
      key={tier}
      className="stage3d"
      style={{ position: "absolute", inset: 0 }}
      aria-hidden="true"
      dpr={[1, MAX_DPR[tier]]}
      shadows={tier === "low" ? false : "percentage"}
      flat
      frameloop={active ? "always" : "never"}
      gl={{ antialias: tier !== "low", alpha: true, powerPreference: "default", stencil: false }}
      camera={{ fov: 34, near: 0.1, far: 120, position: [0, 4, 10] }}
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener(
          "webglcontextlost",
          (e) => {
            e.preventDefault();
            // R3F also drops the context on purpose when a scene unmounts (page change): only a loss
            // while the canvas is still on screen is a real failure → switch to the 2D scene.
            setTimeout(() => {
              if (canvas.isConnected) reportGfxFailure("ฉาก 3D หยุดทำงานกลางคัน (WebGL context lost)");
            }, 0);
          },
          { once: true },
        );
      }}
    >
      <KitProvider tier={tier}>
        <PerfProbe tier={tier} />
        <World {...spec} />
      </KitProvider>
    </Canvas>
  );
}
