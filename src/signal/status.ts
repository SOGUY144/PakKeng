import type { SignalFrame } from "./SignalProcessor";

export type StatusKind = "pass" | "try" | "idle" | "warn" | "done";

export interface MeterStatus {
  kind: StatusKind;
  text: string;
}

/** Status line shared by all games for the "no usable data" cases. */
export function signalProblem(frame: SignalFrame): MeterStatus | null {
  if (frame.status === "disconnected") return { kind: "warn", text: "อุปกรณ์หลุด (จำลอง) · เกมหยุดนับไว้ก่อน" };
  if (frame.status === "connecting") return { kind: "warn", text: "กำลังเชื่อมต่ออุปกรณ์… ยังไม่นับคะแนน" };
  if (frame.status === "stale") return { kind: "warn", text: "สัญญาณไม่พร้อม · รอสักครู่ ยังไม่นับคะแนน" };
  return null;
}
