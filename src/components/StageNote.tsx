import { retry3D, type StageMode } from "../three/gfx";
import { Icon } from "./Icon";

/** Tells the player plainly why the scene is shown in 2D (no blank stage, no silent downgrade). */
export function StageNote({ mode }: { mode: StageMode }) {
  if (mode.kind === "3d") return null;
  if (mode.reason === "pref") {
    return (
      <p className="kid-note kid-note--stage">
        <Icon name="info" size={16} /> แสดงภาพแบบ 2D ตามที่เลือกในเครื่องมือเดโม
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
