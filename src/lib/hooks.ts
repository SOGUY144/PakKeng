import { useEffect, useReducer, useRef, useSyncExternalStore } from "react";

/**
 * One requestAnimationFrame loop per screen. `running=false` stops calling `tick`,
 * and the first frame after resuming gets dt = 0 so paused time is never counted.
 */
export function useGameLoop(tick: (now: number, dtMs: number) => void, running: boolean): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      const dt = last === null ? 0 : now - last;
      last = now;
      tickRef.current(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Force a re-render (used once per frame by the game screens). */
export function useFrameRender(): () => void {
  const [, bump] = useReducer((x: number) => (x + 1) % 1_000_000, 0);
  return bump;
}

function subscribeReducedMotion(cb: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** Calls `onHidden` when the tab is hidden (auto-pause so scoring time never runs in the background). */
export function useOnHidden(onHidden: () => void): void {
  const ref = useRef(onHidden);
  ref.current = onHidden;
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "hidden") ref.current();
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
}

/** Escape-key handler while `active`. */
export function useEscape(active: boolean, onEscape: () => void): void {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") ref.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);
}
