import { retry3D, setGfxPref, type StageMode } from "../three/gfx";
import { Icon } from "./Icon";

/** Tells the player plainly why the scene is shown in 2D (no blank stage, no silent downgrade). */
export function StageNote({ mode }: { mode: StageMode }) {
  if (mode.kind === "3d") return null;
  if (mode.reason === "pref") {
    // 2D was chosen on this device earlier: offer 3D plainly; the new choice is remembered the same way.
    return (
      <p className="kid-note kid-note--stage">
        <Icon name="info" size={16} />
        <span>
          แสดงภาพแบบ 2D ตามที่เลือกไว้ในเครื่องนี้{" "}
          <button type="button" className="link-btn" onClick={() => setGfxPref("auto")}>
            ลองฉาก 3D
          </button>
        </span>
      </p>
    );
  }
  return (
    <p className="kid-note kid-note--stage" role="status">
      <Icon name="info" size={16} />
      <span>
        {mode.reason === "no-webgl"
          ? "เบราว์เซอร์หรืออุปกรณ์นี้เปิดฉาก 3D ไม่ได้ จึงแสดงภาพแบบ 2D แทน เล่นและนับผลได้เหมือนเดิม"
          : `${mode.message ?? "ฉาก 3D มีปัญหา"} · แสดงภาพแบบ 2D แทน เล่นต่อได้เหมือนเดิม`}
        {mode.reason === "failed" ? (
          <>
            {" "}
            <button type="button" className="link-btn" onClick={retry3D}>
              ลองเปิด 3D อีกครั้ง
            </button>
          </>
        ) : null}
      </span>
    </p>
  );
}
