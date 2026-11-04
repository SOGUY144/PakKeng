/**
 * การเคลื่อนไหวของภาพ: ค่าเริ่มต้นทำตามเครื่อง (prefers-reduced-motion)
 * เครื่องมือเดโมเลือก “ลดลง” หรือ “เต็ม” ได้ (จำไว้ใน localStorage) เพื่อทดสอบทั้งสองแบบบนเครื่องเดียว
 * ค่าที่ใช้จริงเขียนลง <html data-motion="reduce|full"> ให้ CSS ใช้ร่วมกับฉาก 3D
 */
export type MotionPref = "system" | "reduce" | "full";

const KEY = "nasal-trainer-demo:motion";
const listeners = new Set<() => void>();
let pref: MotionPref = read();
let mq: MediaQueryList | null = null;

function read(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "reduce" || v === "full" || v === "system") return v;
  } catch {
    // storage blocked
  }
  return "system";
}

function systemReduced(): boolean {
  mq ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return mq.matches;
}

export function motionReduced(): boolean {
  return pref === "reduce" || (pref === "system" && systemReduced());
}

function apply(): void {
  document.documentElement.dataset.motion = motionReduced() ? "reduce" : "full";
  listeners.forEach((l) => l());
}

export function getMotionPref(): MotionPref {
  return pref;
}

export function setMotionPref(p: MotionPref): void {
  pref = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // applies for this visit only
  }
  apply();
}

export function subscribeMotion(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Call once at startup: sets data-motion and follows OS changes while pref is "system". */
export function initMotion(): void {
  systemReduced();
  mq?.addEventListener("change", apply);
  apply();
}
