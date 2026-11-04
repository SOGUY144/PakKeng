import { useSyncExternalStore } from "react";

/**
 * การแสดงผลฉากเกม: 3D สามระดับคุณภาพ หรือ 2D (ภาพเดิม) เป็นทางเลือกสำรอง
 * - ตรวจ WebGL ครั้งเดียวต่อการเปิดหน้า ถ้าใช้ไม่ได้ → 2D พร้อมคำอธิบาย
 * - ระดับคุณภาพเริ่มจากชนิดอุปกรณ์ แล้วลดลงเองเมื่อเฟรมช้า (เฉพาะโหมดอัตโนมัติ ไม่เพิ่มกลับเองระหว่างเปิดหน้า)
 * - ผู้ทดสอบเลือกเองได้ในเครื่องมือเดโม (จำไว้ใน localStorage ของเครื่องนี้)
 * ไฟล์นี้อยู่ใน bundle หลัก จึงไม่ import three
 */
export type GfxPref = "auto" | "high" | "low" | "2d";
export type Tier = "high" | "medium" | "low";
export type WebGLSupport = "ok" | "slow" | "none";

export interface GfxStats {
  fps: number;
  calls: number;
  triangles: number;
  dpr: number;
  tier: Tier;
}

export interface GfxState {
  pref: GfxPref;
  webgl: WebGLSupport;
  detected: Tier;
  autoTier: Tier | null;
  failure: string | null;
  stats: GfxStats | null;
}

export type StageMode =
  | { kind: "3d"; tier: Tier }
  | { kind: "2d"; reason: "pref" | "no-webgl" | "failed"; message?: string };

const KEY = "nasal-trainer-demo:gfx";
const TIERS: Tier[] = ["low", "medium", "high"];
export const TIER_LABEL: Record<Tier, string> = { high: "สูง", medium: "กลาง", low: "ประหยัด" };

let state: GfxState | null = null;
const listeners = new Set<() => void>();

function readPref(): GfxPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "auto" || v === "high" || v === "low" || v === "2d") return v;
  } catch {
    // storage blocked: use the default
  }
  return "auto";
}

function probe(attrs: WebGLContextAttributes): boolean {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2", attrs) ?? c.getContext("webgl", attrs);
  if (!gl) return false;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

function probeWebGL(): WebGLSupport {
  try {
    if (probe({ failIfMajorPerformanceCaveat: true })) return "ok";
    return probe({}) ? "slow" : "none";
  } catch {
    return "none";
  }
}

function detectTier(webgl: WebGLSupport): Tier {
  if (webgl !== "ok") return "low";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency || 4;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch) return mem <= 3 || cores <= 4 ? "low" : "medium";
  return mem <= 2 || cores <= 2 ? "medium" : "high";
}

function get(): GfxState {
  if (!state) {
    const webgl = probeWebGL();
    state = { pref: readPref(), webgl, detected: detectTier(webgl), autoTier: null, failure: null, stats: null };
  }
  return state;
}

function set(patch: Partial<GfxState>): void {
  state = { ...get(), ...patch };
  listeners.forEach((l) => l());
}

export function subscribeGfx(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getGfx(): GfxState {
  return get();
}

export function useGfx(): GfxState {
  return useSyncExternalStore(subscribeGfx, getGfx, getGfx);
}

export function effectiveTier(s: GfxState): Tier {
  if (s.pref === "high") return "high";
  if (s.pref === "low") return "low";
  if (s.autoTier && TIERS.indexOf(s.autoTier) < TIERS.indexOf(s.detected)) return s.autoTier;
  return s.detected;
}

export function stageMode(s: GfxState): StageMode {
  if (s.pref === "2d") return { kind: "2d", reason: "pref" };
  if (s.webgl === "none") return { kind: "2d", reason: "no-webgl" };
  if (s.failure) return { kind: "2d", reason: "failed", message: s.failure };
  return { kind: "3d", tier: effectiveTier(s) };
}

export function setGfxPref(pref: GfxPref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // not persisted; still applies for this visit
  }
  set({ pref, failure: null, autoTier: null, stats: null });
}

export function reportGfxFailure(message: string): void {
  if (get().failure !== message) set({ failure: message, stats: null });
}

export function retry3D(): void {
  set({ failure: null });
}

export function publishGfxStats(stats: GfxStats): void {
  set({ stats });
}

/** One tier down (auto mode only). Returns false when nothing changed. */
export function lowerAutoTier(): boolean {
  const s = get();
  if (s.pref !== "auto") return false;
  const i = TIERS.indexOf(effectiveTier(s));
  if (i <= 0) return false;
  set({ autoTier: TIERS[i - 1] });
  return true;
}
