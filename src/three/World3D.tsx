import { Component, lazy, memo, Suspense, type ReactNode } from "react";
import { reportGfxFailure } from "./gfx";
import type { WorldSpec } from "./spec";

// three.js + ฉากทั้งหมดอยู่ใน chunk แยก: หน้า Home/แดชบอร์ดไม่ต้องโหลด
const WorldCanvas = lazy(() => import("./WorldCanvas"));

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    reportGfxFailure(/webgl|context/i.test(msg) ? "อุปกรณ์นี้สร้างฉาก 3D ไม่ได้" : "โหลดฉาก 3D ไม่สำเร็จ");
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Memoised: props are refs/primitives, so the per-frame screen re-render never reaches the canvas. */
export const World3D = memo(function World3D(spec: WorldSpec) {
  return (
    <Boundary>
      <Suspense
        fallback={
          <div className="stage3d__loading" role="status">
            <span className="stage3d__spinner" aria-hidden="true" />
            กำลังเตรียมฉาก 3D…
          </div>
        }
      >
        <WorldCanvas {...spec} />
      </Suspense>
    </Boundary>
  );
});
