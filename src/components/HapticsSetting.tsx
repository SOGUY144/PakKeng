import { useId, useState, useSyncExternalStore } from "react";
import { haptics } from "../lib/haptics";
import { Icon } from "./Icon";

/** Re-render on any change of the saved choice (both places that show it stay in step). */
function useHapticsSnapshot(): string {
  return useSyncExternalStore(
    (l) => haptics.subscribe(l),
    () => `${haptics.supported}|${haptics.pref}`,
    () => "false|off",
  );
}

/**
 * “แรงสั่น” in the adult corner: on / off, remembered on this device. Optional — the games show and say everything
 * without it. `compact` (inside a game's caregiver drawer) has no test button: a round may be listening there.
 * The test button only sends the vibrate call; whether the device really vibrates is up to its hardware and settings.
 */
export function HapticsSetting({ compact = false }: { compact?: boolean }) {
  useHapticsSnapshot();
  const id = useId();
  const supported = haptics.supported;
  const on = haptics.pref === "on";
  const [tried, setTried] = useState<"sent" | "refused" | null>(null);
  const note = supported
    ? "ใช้ได้ในบางอุปกรณ์ (เช่นมือถือ Android) · สั่นสั้น ๆ เมื่อแตะเลือก เมื่อเกมได้ยินเสียงที่ใช้ได้ และเมื่อได้รางวัล · ไม่สั่นตอนเกมกำลังฟัง พัก หรือสัญญาณใช้ไม่ได้"
    : "เบราว์เซอร์นี้ไม่มีคำสั่งสั่น (เช่น iPhone, iPad และคอมพิวเตอร์ส่วนใหญ่) · เกมทำงานเหมือนเดิมโดยไม่สั่น";
  return (
    <div className="haptics-set">
      <div className="haptics-set__row">
        {/* both places that show this already have a visible "แรงสั่น" heading: the group keeps the name for screen readers */}
        <span id={`${id}-label`} className="sr-only">
          แรงสั่น
        </span>
        <div className="seg" role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-note`}>
          <button type="button" className="seg__btn" aria-pressed={supported && on} disabled={!supported} onClick={() => haptics.setPref("on")}>
            เปิด
          </button>
          <button type="button" className="seg__btn" aria-pressed={!supported || !on} onClick={() => haptics.setPref("off")}>
            ปิด
          </button>
        </div>
      </div>
      <p id={`${id}-note`} className="haptics-set__note">
        {note}
      </p>
      {compact ? null : (
        <div className="haptics-set__row">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={!supported || !on}
            onClick={() => setTried(haptics.test().fired ? "sent" : "refused")}
          >
            <Icon name="wave" size={16} /> ลองสั่น
          </button>
          <span className="haptics-set__status" role="status">
            {tried === "sent"
              ? "ส่งคำสั่งสั่นแล้ว · ถ้าไม่รู้สึกว่าสั่น แปลว่าเครื่องนี้ไม่มีหรือปิดการสั่นไว้"
              : tried === "refused"
                ? "เบราว์เซอร์ไม่รับคำสั่งสั่นตอนนี้"
                : ""}
          </span>
        </div>
      )}
    </div>
  );
}
