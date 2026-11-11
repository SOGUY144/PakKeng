import type { Route } from "../data/routes";

/** Stop flag in the route colour (map, dock, side strip, 2D scene). */
export function RouteFlag({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <ellipse cx="13" cy="36" rx="8" ry="2.6" fill="#000" opacity="0.1" />
      <rect x="11" y="5" width="3.2" height="31" rx="1.6" fill="#c48d5c" />
      <path d="M14.2 7 L33 12.5 L14.2 18.5 Z" fill={color} stroke="#2b2433" strokeOpacity="0.15" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="12.6" cy="5" r="2.6" fill="#ffd877" />
    </svg>
  );
}

/** The destination of a route as a small picture: ferris wheel (flower route) or mushroom house. */
export function Destination({ route, size = 72 }: { route: Route; size?: number }) {
  if (route.id === "mushroom") {
    return (
      <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
        <ellipse cx="36" cy="66" rx="22" ry="4" fill="#000" opacity="0.1" />
        <rect x="21" y="34" width="30" height="31" rx="9" fill="#fffaf2" stroke="#e8dcc8" strokeWidth="2" />
        <path d="M30 65 v-12 a6 6 0 0 1 12 0 v12 z" fill="#a26f45" />
        <circle cx="45" cy="44" r="4" fill={route.flagDeep} />
        <path d="M6 38 C6 14 24 6 36 6 C48 6 66 14 66 38 Z" fill={route.flag} />
        <circle cx="24" cy="22" r="4.5" fill="#fff" />
        <circle cx="44" cy="15" r="3.5" fill="#fff" />
        <circle cx="53" cy="29" r="4" fill="#fff" />
        <circle cx="16" cy="33" r="3" fill="#fff" />
      </svg>
    );
  }
  const spokes = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <ellipse cx="36" cy="67" rx="20" ry="3.5" fill="#000" opacity="0.1" />
      <path d="M36 32 L22 66 M36 32 L50 66" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M36 32 L22 66 M36 32 L50 66" stroke="#e8dcc8" strokeWidth="1.5" strokeLinecap="round" />
      {spokes.map((a, i) => (
        <line key={i} x1="36" y1="32" x2={36 + Math.cos(a) * 24} y2={32 + Math.sin(a) * 24} stroke="#fff" strokeWidth="2" />
      ))}
      <circle cx="36" cy="32" r="24" fill="none" stroke={route.flag} strokeWidth="4" />
      <circle cx="36" cy="32" r="9" fill="none" stroke={route.flagDeep} strokeWidth="3" />
      {spokes.map((a, i) => (
        <circle key={i} cx={36 + Math.cos(a) * 24} cy={34 + Math.sin(a) * 24} r="4.6" fill={i % 2 ? "#ffd877" : "#a8e3c8"} stroke="#2b2433" strokeOpacity="0.12" />
      ))}
      <circle cx="36" cy="32" r="3.5" fill="#ffd877" />
    </svg>
  );
}
