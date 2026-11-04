import * as THREE from "three";

/** Frame-rate independent smoothing toward a target (λ ≈ 1/τ). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

/** 0→1→0 bump over t ∈ [0, 1]. */
export function bump(t: number): number {
  return Math.sin(Math.PI * clamp01(t));
}

/** Delta time for scene animation: capped so a long frame (tab switch, GC) never jumps the scene. */
export function frameDt(dt: number): number {
  return Math.min(dt, 0.05);
}

/** Deterministic PRNG (mulberry32) so decor layouts are identical on every visit. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
