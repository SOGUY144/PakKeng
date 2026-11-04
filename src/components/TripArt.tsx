import { useId } from "react";
import type { Trip, TripId } from "../data/trips";

/**
 * ภาพของรอบ “พาบอลลูนไปส่ง” วาดเป็น SVG ในโค้ด (ไม่มีภาพภายนอก): บอลลูนสีของแต่ละที่ และสิ่งก่อสร้างปลายทาง
 * ใช้ในหน้าเลือกที่ส่ง แถบบนฉาก ตลิ่งคำ ฉาก 2D และหน้าจบรอบ — สีเลี่ยงน้ำเงิน/ส้มเหมือนภาพตัวละครอื่น
 */
const LINE = "#3a3f55";
const WICKER = "#d6b48c";
const RASPBERRY = "#ee7aa0";

/** Balloon in a 40 × 54 box: striped envelope, gift parcel, basket at the bottom. */
function BalloonShapes({ trip }: { trip: Trip }) {
  const a = trip.balloon[0];
  const b = trip.balloon[1] ?? a;
  const c = trip.balloon[2] ?? a;
  const envelope = "M20 2C10.6 2 3 9.4 3 18.8 3 28.2 11.4 33.8 14.6 40h10.8C28.6 33.8 37 28.2 37 18.8 37 9.4 29.4 2 20 2z";
  return (
    <g strokeLinejoin="round">
      <path d={envelope} fill={a} />
      <path d="M20 2C14.4 8.2 12.4 27.6 15.2 40h9.6C27.6 27.6 25.6 8.2 20 2z" fill={b} />
      <path d="M20 2c-2.4 7.6-3 26-1.4 38h2.8C23 28 22.4 9.6 20 2z" fill={c} />
      <path d="M8.6 14c1.8-4.4 5.6-7.6 9.6-8.6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.75" />
      <path d={envelope} fill="none" stroke={LINE} strokeWidth="2" />
      <path d="M15.4 40l1.4 5.4M24.6 40l-1.4 5.4" stroke={LINE} strokeWidth="1.8" />
      <rect x="16.4" y="41.6" width="7.2" height="5" rx="1.2" fill={trip.gift} stroke={LINE} strokeWidth="1.4" />
      <rect x="13.6" y="45" width="12.8" height="8" rx="2.6" fill={WICKER} stroke={LINE} strokeWidth="2" />
      <path d="M13.6 48.6h12.8" stroke="#a88660" strokeWidth="1.6" />
    </g>
  );
}

/** Where a balloon ties up at each landmark (its 100 × 120 box): the porch, gallery or cloud edge. */
const DOCK: Record<TripId, [number, number]> = {
  treehouse: [20, 62],
  lighthouse: [36, 40],
  "cloud-castle": [12, 80],
};

/** Delivered balloons wait beside the landmark (top-left corners in TripPicture's 160 × 120 box, drawn at 62 %). */
const TIED: Record<TripId, [number, number][]> = {
  treehouse: [
    [50, 20],
    [30, 30],
    [64, 6],
  ],
  lighthouse: [
    [66, 2],
    [46, 12],
    [26, 4],
  ],
  "cloud-castle": [
    [40, 34],
    [20, 44],
    [54, 18],
  ],
};

function LandmarkShapes({ id }: { id: TripId }) {
  if (id === "treehouse")
    return (
      <g strokeLinejoin="round">
        <circle cx="64" cy="36" r="27" fill="#7cc46b" stroke="#2f6b3a" strokeWidth="2" />
        <circle cx="36" cy="44" r="18" fill="#a0da87" stroke="#2f6b3a" strokeWidth="2" />
        <circle cx="86" cy="54" r="13" fill="#5fa955" stroke="#2f6b3a" strokeWidth="2" />
        <path d="M57 120c3-18 4-40 2-58h13c-2 18-1 40 3 58z" fill="#a8774f" stroke={LINE} strokeWidth="2" />
        <path d="M60 88c3-2 6-2 8 0" stroke="#7d5536" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M26 69v42M34 69v42M26 79h8M26 89h8M26 99h8M26 109h8" stroke="#a26f45" strokeWidth="2" fill="none" />
        <rect x="20" y="62" width="72" height="7" rx="3" fill="#c48d5c" stroke={LINE} strokeWidth="2" />
        <rect x="44" y="41" width="34" height="21" rx="2" fill="#f0c48f" stroke={LINE} strokeWidth="2" />
        <path d="M40 42l21-17 21 17z" fill={RASPBERRY} stroke={LINE} strokeWidth="2" />
        <rect x="49" y="48" width="9" height="14" rx="2" fill="#a26f45" stroke={LINE} strokeWidth="1.6" />
        <rect x="63" y="46" width="10" height="8" rx="1.5" fill="#ffd877" stroke={LINE} strokeWidth="1.6" />
      </g>
    );
  if (id === "lighthouse")
    return (
      <g strokeLinejoin="round">
        <path d="M0 104c12-4 22-4 34 0s22 4 34 0 22-4 32 0v16H0z" fill="#86cdb8" />
        <path d="M26 120c0-11 9-18 26-18s28 6 28 18z" fill="#c2b5d4" stroke={LINE} strokeWidth="2" />
        <path d="M41 104l5-58h16l5 58z" fill="#fffaf2" />
        <path d="M42.6 86h22.8l.9 10.4H41.7zM44.3 66h19.4l.9 10H43.4zM45.8 50h16.4l.6 7H45.2z" fill={RASPBERRY} />
        <path d="M41 104l5-58h16l5 58z" fill="none" stroke={LINE} strokeWidth="2" />
        <rect x="51" y="78" width="6" height="7" rx="3" fill="#5b5068" />
        <path d="M71 26l24-9v22z" fill="#fff4b8" opacity="0.85" />
        <rect x="36" y="40" width="36" height="6" rx="2" fill="#5b5068" stroke={LINE} strokeWidth="2" />
        <path d="M38 40v-7M45 40v-7M54 40v-7M63 40v-7M70 40v-7M37 33h34" stroke={LINE} strokeWidth="1.6" fill="none" />
        <rect x="45" y="22" width="18" height="12" rx="2" fill="#ffd877" stroke={LINE} strokeWidth="2" />
        <path d="M43 23c0-8 5-12 11-12s11 4 11 12z" fill={RASPBERRY} stroke={LINE} strokeWidth="2" />
        <circle cx="54" cy="9.5" r="2.6" fill="#f5c542" stroke={LINE} strokeWidth="1.4" />
      </g>
    );
  return (
    <g strokeLinejoin="round">
      <path
        d="M12 98c-9 0-11-13-2-16-2-10 9-16 17-11 3-10 18-12 24-4 7-9 22-6 24 5 10-3 19 5 16 13 9 2 8 13-1 13z"
        fill="#ffffff"
        stroke="#b9a6f2"
        strokeWidth="2.4"
      />
      <rect x="25" y="48" width="12" height="34" fill="#fffaf2" stroke={LINE} strokeWidth="2" />
      <path d="M23 49l8-17 8 17z" fill="#ff9cbc" stroke={LINE} strokeWidth="2" />
      <rect x="67" y="48" width="12" height="34" fill="#fffaf2" stroke={LINE} strokeWidth="2" />
      <path d="M65 49l8-17 8 17z" fill="#ff9cbc" stroke={LINE} strokeWidth="2" />
      <rect x="37" y="54" width="30" height="28" fill="#dcd0fb" stroke={LINE} strokeWidth="2" />
      <path d="M35 55l17-18 17 18z" fill="#b9a6f2" stroke={LINE} strokeWidth="2" />
      <path d="M46 82v-9a6 6 0 0112 0v9z" fill="#8a74d6" stroke={LINE} strokeWidth="1.6" />
      <rect x="29" y="56" width="4" height="7" rx="2" fill="#ffd877" />
      <rect x="71" y="56" width="4" height="7" rx="2" fill="#ffd877" />
      <path d="M52 37v-9l8 3.4-8 3.4" fill="#ffd877" stroke={LINE} strokeWidth="1.4" />
    </g>
  );
}

/** One balloon in the trip's colours (trail, dock, side list, 2D scene). Size it with CSS or `width`. */
export function TripBalloon({ trip, width = 40, className }: { trip: Trip; width?: number; className?: string }) {
  return (
    <svg className={className} width={width} height={width * 1.35} viewBox="0 0 40 54" aria-hidden="true" focusable="false">
      <BalloonShapes trip={trip} />
    </svg>
  );
}

/** The destination alone (2D scene). */
export function TripLandmark({ trip, className }: { trip: Trip; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 120" aria-hidden="true" focusable="false">
      <LandmarkShapes id={trip.id} />
    </svg>
  );
}

/** Map pin that marks where the balloon is delivered (2D scene). */
export function TripPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 32" aria-hidden="true" focusable="false">
      <path d="M12 30C7 22 3 17.4 3 11.6a9 9 0 0118 0C21 17.4 17 22 12 30z" fill={RASPBERRY} stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="11.4" r="3.6" fill="#fffaf2" />
    </svg>
  );
}

/**
 * Postcard of the trip: the destination with one balloon on its way (picker), or with the balloons
 * delivered so far tied up beside it (`balloons`, side card and end of round).
 */
export function TripPicture({ trip, balloons, label, className }: { trip: Trip; balloons?: number; label?: string; className?: string }) {
  // one gradient per picture (a shared id breaks once its first copy sits in a hidden panel)
  const sky = `trip-sky-${useId().replace(/[^\w-]/g, "")}`;
  const [dx, dy] = DOCK[trip.id];
  const dock: [number, number] = [58 + dx, dy];
  const tied = TIED[trip.id];
  return (
    <svg
      className={className}
      viewBox="0 0 160 120"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={trip.sky[0]} />
          <stop offset="0.6" stopColor={trip.sky[1]} />
          <stop offset="1" stopColor={trip.sky[2]} />
        </linearGradient>
      </defs>
      <rect width="160" height="120" rx="14" fill={`url(#${sky})`} />
      <ellipse cx="30" cy="24" rx="14" ry="5" fill="#fff" opacity="0.9" />
      <ellipse cx="112" cy="12" rx="11" ry="4" fill="#fff" opacity="0.8" />
      <g transform="translate(58 0)">
        <LandmarkShapes id={trip.id} />
      </g>
      {balloons === undefined ? (
        <>
          <path
            d={`M30 116C24 92 ${dock[0] - 40} ${dock[1] + 18} ${dock[0]} ${dock[1]}`}
            fill="none"
            stroke={trip.ink}
            strokeWidth="2"
            strokeDasharray="3 5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <g transform="translate(12 46)">
            <BalloonShapes trip={trip} />
          </g>
        </>
      ) : (
        Array.from({ length: balloons }, (_, i) => {
          const [x, y] = tied[i % tied.length];
          const lift = Math.floor(i / tied.length) * 6;
          return (
            <g key={i}>
              <path d={`M${x + 12.4} ${y - lift + 33}L${dock[0]} ${dock[1]}`} stroke={LINE} strokeWidth="1" opacity="0.5" />
              <g transform={`translate(${x} ${y - lift}) scale(0.62)`}>
                <BalloonShapes trip={trip} />
              </g>
            </g>
          );
        })
      )}
    </svg>
  );
}
