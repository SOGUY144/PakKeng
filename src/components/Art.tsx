/**
 * งานภาพทั้งหมดวาดขึ้นเองเป็น SVG (ไม่มีภาพภายนอก) — ตัวละคร: กระต่ายน้อยกับเพื่อนก้อนเมฆ, กบ
 * สีของตัวละครเลี่ยงน้ำเงิน/ส้ม เพื่อไม่ชนกับความหมายของค่าด้านปาก/จมูก
 */
const LINE = "#3a3f55";
const EYE = "#2a2f45";
const PINK = "#f9b8cb";

export function Bunny({ size = 64, cap = false }: { size?: number; cap?: boolean }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 80 96" aria-hidden="true">
      <g stroke={LINE} strokeWidth="2.5" strokeLinejoin="round">
        <path d="M27 36C20 22 19 8 26 5c7-2 9 13 9 29" fill="#fff" />
        <path d="M53 36c7-14 8-28 1-31-7-2-9 13-9 29" fill="#fff" />
        <ellipse cx="40" cy="74" rx="20" ry="17" fill="#fff" />
        <ellipse cx="29" cy="90" rx="8" ry="4.5" fill="#fff" />
        <ellipse cx="51" cy="90" rx="8" ry="4.5" fill="#fff" />
        <circle cx="40" cy="48" r="20" fill="#fff" />
      </g>
      <path d="M28 30c-4-9-4-18-1-20 3-1 4 9 4.5 19" fill={PINK} />
      <path d="M52 30c4-9 4-18 1-20-3-1-4 9-4.5 19" fill={PINK} />
      <ellipse cx="40" cy="77" rx="11" ry="8.5" fill="#fdf0f3" />
      <circle cx="32.5" cy="47" r="3.2" fill={EYE} />
      <circle cx="47.5" cy="47" r="3.2" fill={EYE} />
      <circle cx="33.6" cy="45.8" r="1.1" fill="#fff" />
      <circle cx="48.6" cy="45.8" r="1.1" fill="#fff" />
      <ellipse cx="26.5" cy="54" rx="4" ry="2.6" fill={PINK} />
      <ellipse cx="53.5" cy="54" rx="4" ry="2.6" fill={PINK} />
      <path d="M38.4 51h3.2L40 52.8z" fill="#e58aa6" />
      <path d="M37.4 54c1.6 1.8 3.6 1.8 5.2 0" stroke={EYE} strokeWidth="2" fill="none" strokeLinecap="round" />
      {cap ? (
        <g stroke={LINE} strokeWidth="2.2" strokeLinejoin="round">
          <path d="M23 34c0-11 8-17 17-17s17 6 17 17z" fill="#4fa093" />
          <path d="M40 34h22c2 0 2 3 0 3H40z" fill="#3d8a7e" />
        </g>
      ) : null}
    </svg>
  );
}

export function CloudPal({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 96 72" aria-hidden="true">
      <path
        d="M22 61C10 61 5 49 12 41c-4-11 7-20 18-16 4-12 22-16 30-6 9-5 23 2 21 14 10 4 10 23-2 28z"
        fill="#dcd0fb"
        stroke="#6e5bb8"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M35 40c2.5-3.5 6.5-3.5 9 0M53 40c2.5-3.5 6.5-3.5 9 0" stroke="#4a3a8f" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M42 47c4 6 10 6 13 0z" fill="#fff" stroke="#4a3a8f" strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="31" cy="47" rx="4" ry="2.5" fill="#f6b6d2" />
      <ellipse cx="67" cy="47" rx="4" ry="2.5" fill="#f6b6d2" />
    </svg>
  );
}

export function StarShape({ size = 28, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.6l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
        fill={filled ? "var(--star)" : "none"}
        stroke={filled ? "var(--star-deep)" : "var(--ink-3)"}
        strokeWidth={filled ? 1.4 : 1.8}
        strokeDasharray={filled ? undefined : "3 2.4"}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Obstacle({ kind }: { kind: "rock" | "bush" | "log" }) {
  if (kind === "rock")
    return (
      <svg width="46" height="34" viewBox="0 0 46 34" aria-hidden="true">
        <path d="M4 30c-2-8 4-18 13-22 8-4 18-3 23 4 5 6 4 15 1 18z" fill="#c9c3b8" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <path d="M14 16c3-3 7-4 11-3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".8" />
      </svg>
    );
  if (kind === "log")
    return (
      <svg width="54" height="26" viewBox="0 0 54 26" aria-hidden="true">
        <rect x="3" y="5" width="44" height="16" rx="8" fill="#b9946d" stroke={LINE} strokeWidth="2" />
        <ellipse cx="45" cy="13" rx="6" ry="8" fill="#dcc09a" stroke={LINE} strokeWidth="2" />
        <ellipse cx="45" cy="13" rx="2.4" ry="3.4" fill="none" stroke="#9c7a55" strokeWidth="1.6" />
      </svg>
    );
  return (
    <svg width="48" height="36" viewBox="0 0 48 36" aria-hidden="true">
      <path d="M5 32c-4-6 0-14 7-14 0-8 9-13 15-8 5-6 16-2 15 7 6 2 6 13 0 15z" fill="#7cc46b" stroke="#2f6b3a" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="17" cy="22" r="2.2" fill="#f7d4e0" />
      <circle cx="31" cy="17" r="2.2" fill="#fff4b8" />
    </svg>
  );
}

export function Tree({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 40 50" aria-hidden="true">
      <rect x="17" y="30" width="6" height="16" rx="2" fill="#9c7a55" />
      <circle cx="20" cy="20" r="17" fill="#8ccf78" stroke="#2f6b3a" strokeWidth="2" />
      <circle cx="13" cy="15" r="4" fill="#a9de96" />
    </svg>
  );
}

export function HotAirBalloon({ size = 92 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.42} viewBox="0 0 90 128" aria-hidden="true">
      <path d="M45 4C20 4 8 24 8 44c0 22 22 36 28 48h18c6-12 28-26 28-48C82 24 70 4 45 4z" fill="#ff9cbc" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M45 4c-9 16-11 56-5 88h10c6-32 4-72-5-88z" fill="#ffd877" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M20 22c6-8 14-12 22-12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".75" />
      <path d="M37 92l2 13M53 92l-2 13" stroke={LINE} strokeWidth="2" />
      <g transform="translate(36 86) scale(0.3)">
        <path d="M27 36C20 22 19 8 26 5c7-2 9 13 9 29M53 36c7-14 8-28 1-31-7-2-9 13-9 29" fill="#fff" stroke={LINE} strokeWidth="6" />
        <circle cx="40" cy="48" r="20" fill="#fff" stroke={LINE} strokeWidth="6" />
        <circle cx="33" cy="47" r="4" fill={EYE} />
        <circle cx="47" cy="47" r="4" fill={EYE} />
      </g>
      <rect x="33" y="104" width="24" height="18" rx="4" fill="#d6b48c" stroke={LINE} strokeWidth="2.5" />
      <path d="M33 111h24" stroke="#a88660" strokeWidth="2" />
    </svg>
  );
}

export function Frog({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 80 64" aria-hidden="true">
      <g stroke="#2f6b3a" strokeWidth="2.5" strokeLinejoin="round">
        <ellipse cx="18" cy="56" rx="9" ry="5" fill="#6cc25a" />
        <ellipse cx="62" cy="56" rx="9" ry="5" fill="#6cc25a" />
        <ellipse cx="40" cy="40" rx="27" ry="20" fill="#86d872" />
        <circle cx="25" cy="20" r="10.5" fill="#86d872" />
        <circle cx="55" cy="20" r="10.5" fill="#86d872" />
      </g>
      <ellipse cx="40" cy="46" rx="15" ry="9" fill="#c4efb0" />
      <circle cx="25" cy="20" r="6.2" fill="#fff" />
      <circle cx="55" cy="20" r="6.2" fill="#fff" />
      <circle cx="26" cy="21" r="3.2" fill={EYE} />
      <circle cx="56" cy="21" r="3.2" fill={EYE} />
      <path d="M28 38c7 8 17 8 24 0" stroke="#2f6b3a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="22" cy="37" rx="4" ry="2.4" fill={PINK} />
      <ellipse cx="58" cy="37" rx="4" ry="2.4" fill={PINK} />
    </svg>
  );
}

export function LilyPad({ size = 80, target = false }: { size?: number; target?: boolean }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 100 72" aria-hidden="true">
      <ellipse cx="50" cy="40" rx="47" ry="30" fill="rgba(31,35,48,.10)" />
      <path d="M50 36L92 25A46 30 0 1 1 72 10z" fill="var(--pad)" stroke="var(--pad-deep)" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M50 36L18 30M50 36L30 56M50 36L68 60M50 36L88 46" stroke="var(--pad-deep)" strokeWidth="1.6" opacity=".55" />
      {target ? (
        <ellipse cx="50" cy="36" rx="38" ry="24" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="7 6" />
      ) : null}
    </svg>
  );
}

export function DoorPanel({ side }: { side: "left" | "right" }) {
  return (
    <svg viewBox="0 0 60 120" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">
      <rect x="2" y="2" width="56" height="116" rx="6" fill="var(--door)" stroke={LINE} strokeWidth="2.5" />
      <path d="M16 6v108M30 6v108M44 6v108" stroke="var(--door-deep)" strokeWidth="2" opacity=".6" />
      <rect x="8" y="24" width="44" height="6" rx="2" fill="var(--door-deep)" />
      <rect x="8" y="90" width="44" height="6" rx="2" fill="var(--door-deep)" />
      <circle cx={side === "left" ? 50 : 10} cy="62" r="4.5" fill="#f2cf63" stroke={LINE} strokeWidth="2" />
    </svg>
  );
}

/** Schematic only — positions follow the brief (baffle under the nose, top mic = nose side, bottom mic = mouth side). */
export function BaffleDiagram() {
  return (
    <svg viewBox="0 0 348 176" width="100%" role="img" aria-labelledby="baffle-title">
      <title id="baffle-title">ภาพประกอบ: แผ่นกั้นอยู่ใต้จมูก ไมค์บนอยู่ด้านจมูก ไมค์ล่างอยู่ด้านปาก</title>
      <path
        d="M58 18c44-12 84 2 88 36 1 7 6 12 12 18 2 3-1 6-6 6-1 5 2 11-1 16 5 2 6 8 1 11-2 9-12 21-30 25-10 16-30 26-50 26-30 0-42-30-42-62 0-40 6-70 28-76z"
        fill="#f6dccb"
        stroke={LINE}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="118" cy="54" r="4" fill={EYE} />
      <path d="M140 103c4 1 8 0 10-2" stroke={LINE} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="150" y="80" width="150" height="9" rx="4" fill="#e9e2d4" stroke={LINE} strokeWidth="2" />
      <text x="300" y="106" textAnchor="end" fontSize="13" fill="var(--ink-2)" fontWeight="600">
        แผ่นกั้นใต้จมูก
      </text>
      <path d="M160 70c10-8 20-10 32-8" stroke="var(--nasal)" strokeWidth="2" strokeDasharray="4 4" fill="none" />
      <circle cx="206" cy="60" r="11" fill="#fff" stroke="var(--nasal)" strokeWidth="3" />
      <rect x="201" y="55" width="10" height="10" rx="5" fill="var(--nasal)" />
      <text x="222" y="48" fontSize="14" fill="var(--nasal-text)" fontWeight="700">
        ไมค์บน · ด้านจมูก
      </text>
      <path d="M156 106c12 8 22 10 34 8" stroke="var(--oral)" strokeWidth="2" strokeDasharray="4 4" fill="none" />
      <circle cx="206" cy="126" r="11" fill="#fff" stroke="var(--oral)" strokeWidth="3" />
      <rect x="201" y="121" width="10" height="10" rx="5" fill="var(--oral)" />
      <text x="222" y="150" fontSize="14" fill="var(--oral-text)" fontWeight="700">
        ไมค์ล่าง · ด้านปาก
      </text>
    </svg>
  );
}

export function GameThumb({ game }: { game: "runner" | "balloon" | "frog" }) {
  if (game === "runner")
    return (
      <svg viewBox="0 0 120 84" width="100%" aria-hidden="true">
        <rect width="120" height="84" fill="var(--grass)" />
        <path d="M30 0h60l10 84H20z" fill="var(--path)" />
        <path d="M50 0l-3 84M70 0l3 84" stroke="#fff" strokeWidth="2" strokeDasharray="7 6" />
        <circle cx="16" cy="18" r="10" fill="#8ccf78" stroke="#2f6b3a" strokeWidth="1.5" />
        <circle cx="106" cy="56" r="9" fill="#8ccf78" stroke="#2f6b3a" strokeWidth="1.5" />
        <g transform="translate(46 18) scale(0.34)">
          <path d="M27 36C20 22 19 8 26 5c7-2 9 13 9 29M53 36c7-14 8-28 1-31-7-2-9 13-9 29" fill="#fff" stroke={LINE} strokeWidth="5" />
          <ellipse cx="40" cy="74" rx="20" ry="17" fill="#fff" stroke={LINE} strokeWidth="5" />
          <circle cx="40" cy="48" r="20" fill="#fff" stroke={LINE} strokeWidth="5" />
          <circle cx="33" cy="47" r="4" fill={EYE} />
          <circle cx="47" cy="47" r="4" fill={EYE} />
        </g>
        <g transform="translate(43 58) scale(0.36)">
          <path d="M22 61C10 61 5 49 12 41c-4-11 7-20 18-16 4-12 22-16 30-6 9-5 23 2 21 14 10 4 10 23-2 28z" fill="#dcd0fb" stroke="#6e5bb8" strokeWidth="5" />
        </g>
      </svg>
    );
  if (game === "balloon")
    return (
      <svg viewBox="0 0 120 84" width="100%" aria-hidden="true">
        <defs>
          <linearGradient id="thumb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--sky-top)" />
            <stop offset="1" stopColor="var(--sky-bottom)" />
          </linearGradient>
        </defs>
        <rect width="120" height="84" fill="url(#thumb-sky)" />
        <rect y="16" width="120" height="22" fill="rgba(37,99,235,.10)" />
        <path d="M0 16h120M0 38h120" stroke="var(--oral)" strokeWidth="1.2" strokeDasharray="4 3" />
        <ellipse cx="22" cy="58" rx="14" ry="6" fill="#fff" />
        <ellipse cx="98" cy="66" rx="12" ry="5" fill="#fff" />
        <g transform="translate(46 8) scale(0.3)">
          <path d="M45 4C20 4 8 24 8 44c0 22 22 36 28 48h18c6-12 28-26 28-48C82 24 70 4 45 4z" fill="#ff9cbc" stroke={LINE} strokeWidth="5" />
          <path d="M45 4c-9 16-11 56-5 88h10c6-32 4-72-5-88z" fill="#ffd877" />
          <rect x="33" y="104" width="24" height="18" rx="4" fill="#d6b48c" stroke={LINE} strokeWidth="5" />
          <path d="M37 92l2 13M53 92l-2 13" stroke={LINE} strokeWidth="4" />
        </g>
        <rect y="76" width="120" height="8" fill="var(--grass)" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 84" width="100%" aria-hidden="true">
      <rect width="120" height="84" fill="var(--pond)" />
      <rect width="120" height="14" fill="var(--path)" />
      <path d="M8 46c6-3 12-3 18 0M84 30c6-3 12-3 18 0M70 72c6-3 12-3 18 0" stroke="#fff" strokeWidth="1.6" fill="none" opacity=".7" />
      <ellipse cx="34" cy="64" rx="17" ry="10" fill="var(--pad)" stroke="var(--pad-deep)" strokeWidth="1.5" />
      <ellipse cx="78" cy="44" rx="16" ry="9" fill="var(--pad)" stroke="var(--pad-deep)" strokeWidth="1.5" />
      <ellipse cx="48" cy="26" rx="14" ry="8" fill="var(--pad)" stroke="var(--pad-deep)" strokeWidth="1.5" strokeDasharray="4 3" />
      <g transform="translate(22 46) scale(0.32)">
        <ellipse cx="40" cy="40" rx="27" ry="20" fill="#86d872" stroke="#2f6b3a" strokeWidth="5" />
        <circle cx="25" cy="20" r="10.5" fill="#86d872" stroke="#2f6b3a" strokeWidth="5" />
        <circle cx="55" cy="20" r="10.5" fill="#86d872" stroke="#2f6b3a" strokeWidth="5" />
        <circle cx="26" cy="21" r="4" fill={EYE} />
        <circle cx="56" cy="21" r="4" fill={EYE} />
      </g>
    </svg>
  );
}

export function CollectibleIcon({ id, size = 40 }: { id: "cap" | "shoes" | "scarf" | "crown"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", "aria-hidden": true as const };
  if (id === "cap")
    return (
      <svg {...common}>
        <path d="M7 25c0-9 6-15 13-15s13 6 13 15z" fill="#4fa093" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <path d="M20 25h15c2 0 2 4 0 4H20z" fill="#3d8a7e" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="20" cy="10" r="2.5" fill="#f2cf63" stroke={LINE} strokeWidth="1.6" />
      </svg>
    );
  if (id === "shoes")
    return (
      <svg {...common}>
        <path d="M5 28V17h9l3 5c5 1 11 2 15 4 3 2 2 5-1 5H7c-1 0-2-1-2-3z" fill="#ff9cbc" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <path d="M5 28h28" stroke="#fff" strokeWidth="2.2" />
        <path d="M12 20l3 2M15 18l2 3" stroke="#fff" strokeWidth="1.6" />
      </svg>
    );
  if (id === "scarf")
    return (
      <svg {...common}>
        <path d="M6 14c8 4 20 4 28 0l1 7c-9 4-21 4-30 0z" fill="#ffd877" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <path d="M24 20l2 14h6l-2-15" fill="#ffd877" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 16v6M18 17v6M27 25h4" stroke="#7cc46b" strokeWidth="2.4" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M6 30l-1-17 9 7 6-11 6 11 9-7-1 17z" fill="#f5c542" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="20" cy="22" r="2.6" fill="#ff9cbc" />
      <path d="M6 30h28" stroke={LINE} strokeWidth="2" />
    </svg>
  );
}
