import { useEffect, useRef } from "react";
import { showToast } from "../lib/toast";
import { signalKind, useSignalSource } from "../signal/mock";
import type { SignalKind } from "../data/schema";

/**
 * A round belongs to one signal source. If the adult switches between the labelled demo and a real device in the
 * middle of a round, the round starts again (nothing from one source is saved as the other) and a short note says why.
 * Returns the source of the current round.
 */
export function useSourceGuard(restart: () => void): SignalKind {
  useSignalSource(); // re-render when the source changes
  const kind = signalKind();
  const roundKind = useRef<SignalKind>(kind);
  const restartRef = useRef(restart);
  useEffect(() => {
    restartRef.current = restart;
  });
  useEffect(() => {
    if (kind === roundKind.current) return;
    roundKind.current = kind;
    showToast(kind === "device" ? "เปลี่ยนไปใช้อุปกรณ์จริง เริ่มรอบใหม่ (รอบโหมดสาธิตไม่นับรวม)" : "เปลี่ยนกลับเป็นโหมดสาธิต เริ่มรอบใหม่ (ไม่นับรวมกับอุปกรณ์)");
    restartRef.current();
  }, [kind]);
  return kind;
}
