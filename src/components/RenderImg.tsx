import { useState, type ReactNode } from "react";

/**
 * Still image rendered from the real 3D models (public/renders/<name>.webp, made with the dev render studio).
 * Falls back to the 2D SVG art if the file cannot load, so a card is never empty.
 */
export function RenderImg({ name, fallback, className }: { name: string; fallback: ReactNode; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}renders/${name}.webp`}
      alt=""
      draggable={false}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
