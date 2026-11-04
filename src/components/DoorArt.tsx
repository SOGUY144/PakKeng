import { memo, useId } from "react";
import { BEACH_SEA, LOCK_BEADS, type Door, type DoorId } from "../data/doors";

/**
 * ภาพประตูของด่าน “เปิดประตู” วาดเองเป็น SVG (ไม่มีภาพภายนอก) — ภาษาภาพเดียวกับฉาก 3D:
 * ซุ้มหิน บานสองบานสีของประตู ลายบนบาน ตราบนซุ้มล้อมด้วยลูกปัด และสลักทองคาดกลางบาน
 * - open: สลักเลื่อน บานพับเข้าหาบานพับ เห็นสิ่งที่อยู่ข้างหลัง (หน้าเลือก ตลิ่ง แถบข้าง ภาพตอนจบ และฉาก 2D)
 * - progress: ลูกปัดรอบตราสว่างตามความคืบหน้าจากตรรกะด่านประตู (ส้ม = ค่าด้านจมูก) · live: วงรอบตราเรืองตอนเกมนับเสียงที่ถึงเกณฑ์
 */
const STONE = "#ddd3e6";
const STONE_DEEP = "#c2b5d4";
const STONE_LINE = "#a99bbd";
const GOLD = "#f5c542";
const GOLD_DEEP = "#c9971c";
const MEDALLION: [number, number] = [50, 47.5];

const ring = (n: number, r: number, start = -Math.PI / 2): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

const BEADS = ring(LOCK_BEADS, 12.5);
const PETALS = ring(5, 0.5);
const STAR_POINTS = ring(10, 1)
  .map(([x, y], i) => (i % 2 ? [x * 0.46, y * 0.46] : [x, y]).map((v) => v.toFixed(3)).join(","))
  .join(" ");
const SPARKLE = "M0-1L.28-.28L1 0L.28.28L0 1L-.28.28L-1 0L-.28-.28Z";
// scallop shell (unit size): a fan over a hinge with two ears, bumps along its edge, ribs to the hinge
const SHELL_FAN = "M0 .58L-.82-.12A.86 .86 0 0 1 .82-.12Z";
const SHELL_BUMPS = Array.from({ length: 7 }, (_, k) => {
  const a = (-152 + (k * 124) / 6) * (Math.PI / 180);
  return [Math.cos(a) * 0.82, 0.14 + Math.sin(a) * 0.82] as const;
});
const SHELL_RIBS = [-140, -115, -90, -65, -40]
  .map((d) => {
    const a = d * (Math.PI / 180);
    return `M0 .48L${(Math.cos(a) * 0.74).toFixed(3)} ${(0.14 + Math.sin(a) * 0.74).toFixed(3)}`;
  })
  .join("");

function Emblem({ kind, fill, deep }: { kind: DoorId; fill: string; deep: string }) {
  if (kind === "flower") {
    return (
      <g>
        {PETALS.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={0.44} fill={fill} />
        ))}
        <circle r={0.34} fill={deep} />
      </g>
    );
  }
  if (kind === "star") return <polygon points={STAR_POINTS} fill={fill} stroke={deep} strokeWidth={0.1} strokeLinejoin="round" />;
  return (
    <g>
      <rect x={-0.3} y={0.46} width={0.6} height={0.3} rx={0.08} fill={fill} stroke={deep} strokeWidth={0.07} />
      {SHELL_BUMPS.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.13} fill={fill} />
      ))}
      <path d={SHELL_FAN} fill={fill} />
      <path d={SHELL_RIBS} stroke={deep} strokeWidth={0.07} strokeLinecap="round" fill="none" />
    </g>
  );
}

function Bloom({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {PETALS.map(([px, py], i) => (
        <circle key={i} cx={px * r * 1.6} cy={py * r * 1.6} r={r * 0.8} fill={color} />
      ))}
      <circle r={r * 0.62} fill="#ffd877" />
    </g>
  );
}

/** What waits behind the door, drawn inside the doorway (x 20–80, y 62–130). */
function Behind({ door, sky }: { door: Door; sky: string }) {
  const place = door.behind;
  const backdrop = <rect x="20" y="62" width="60" height="68" fill={`url(#${sky})`} />;
  if (door.id === "star") {
    return (
      <>
        {backdrop}
        <circle cx="64" cy="78" r="11" fill="#fff4cf" opacity=".18" />
        <circle cx="64" cy="78" r="7" fill="#fff4cf" />
        <circle cx="61.8" cy="76" r="1.6" fill="#ece0b4" />
        <circle cx="66.6" cy="81" r="1.1" fill="#ece0b4" />
        {[
          [28, 70, 2.2],
          [38, 84, 1.6],
          [47, 69, 1.9],
          [30, 96, 1.4],
          [53, 92, 1.5],
          [75, 95, 1.7],
          [43, 102, 1.2],
          [74, 66, 1.3],
        ].map(([x, y, s], i) => (
          <path key={i} d={SPARKLE} transform={`translate(${x} ${y}) scale(${s})`} fill="#fff3c4" />
        ))}
        <path d="M20 112c10-4 20-4 30-1 10-3 20-3 30 1v18H20z" fill={place.ground} />
        <path d="M20 117c3-5 8-5 10-1 2-4 7-4 9 0v14H20zM61 119c2-4 7-5 9-1 3-4 7-3 10 1v11H61z" fill="#2f2858" />
        {[
          [34, 108],
          [55, 105],
          [70, 111],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r=".95" fill="#ffe9a6" />
        ))}
      </>
    );
  }
  if (door.id === "shell") {
    return (
      <>
        {backdrop}
        <circle cx="66" cy="77" r="9" fill="#fff6d6" opacity=".8" />
        <circle cx="66" cy="77" r="5.8" fill="#ffe8a6" />
        <rect x="20" y="97" width="60" height="15" fill={BEACH_SEA} />
        <path d="M20 103c4-2 8-2 12 0s8 2 12 0 8-2 12 0 8 2 12 0 8-2 12 0" stroke="#e9fbf4" strokeWidth="1.1" fill="none" />
        <path d="M20 110c10-2 20-2 30 0s20 2 30 0v20H20z" fill={place.ground} />
        <path d="M20 110c10-2 20-2 30 0s20 2 30 0" stroke="#ffffff" strokeWidth="1.4" fill="none" />
        <g transform="translate(35 121) scale(4)">
          <Emblem kind="shell" fill={door.emblem} deep={door.emblemDeep} />
        </g>
        <g transform="translate(63 122) rotate(14) scale(3.6)">
          <Emblem kind="star" fill="#ff9cbc" deep="#ee7aa0" />
        </g>
      </>
    );
  }
  return (
    <>
      {backdrop}
      <path d="M20 102c4-6 9-6 12-1 3-6 10-7 13-1 3-5 10-5 12 0 4-5 10-4 12 1 3-4 9-4 11 1v28H20z" fill="#8fcf74" />
      <rect x="20" y="106" width="60" height="24" fill={place.ground} />
      <ellipse cx="50" cy="128" rx="4.6" ry="1.7" fill="#e6cf9f" />
      <ellipse cx="51" cy="121" rx="3.8" ry="1.4" fill="#e6cf9f" />
      <ellipse cx="50" cy="115" rx="3" ry="1.1" fill="#e6cf9f" />
      {(
        [
          [27, 111, 1.9, "#ff9cbc"],
          [38, 118, 2.2, "#ffffff"],
          [62, 110, 1.8, "#ee7aa0"],
          [70, 117, 2.2, "#b9a6f2"],
          [76, 109, 1.7, "#ff9cbc"],
          [29, 125, 2.4, "#b9a6f2"],
          [41, 109, 1.6, "#ee7aa0"],
          [67, 126, 2.4, "#ffffff"],
        ] as const
      ).map(([x, y, r, color], i) => (
        <Bloom key={i} x={x} y={y} r={r} color={color} />
      ))}
      <g transform="translate(57 86)">
        <ellipse cx="-2.3" rx="2.5" ry="1.8" fill="#ff9cbc" />
        <ellipse cx="2.3" rx="2.5" ry="1.8" fill="#ff9cbc" />
        <rect x="-.45" y="-2" width=".9" height="4" rx=".45" fill="#2b2433" />
      </g>
    </>
  );
}

interface DoorArtProps {
  door: Door;
  /** Bolt slid back and leaves swung open: what is behind shows in the doorway. */
  open?: boolean;
  /** 0..1 progress from the gate logic: lights the beads around the emblem (orange = the nasal target). */
  progress?: number;
  /** The game is counting in-zone speech right now (2D stage only). */
  live?: boolean;
}

export const DoorArt = memo(function DoorArt({ door, open = false, progress, live = false }: DoorArtProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clip = `door-clip-${uid}`;
  const sky = `door-sky-${uid}`;
  const lit = open ? LOCK_BEADS : progress === undefined ? 0 : Math.floor(progress * LOCK_BEADS + 1e-6);
  const leafEmblem = (x: number) => (
    <g transform={`translate(${x} 71) scale(4.4)`}>
      <Emblem kind={door.id} fill={door.emblem} deep={door.emblemDeep} />
    </g>
  );
  const leafBody = (x: number) => (
    <>
      <rect x={x} y="62" width="30" height="68" fill={door.leaf} />
      <rect x={x} y="62" width="10" height="68" fill={door.leafLight} />
      <rect x={x + 20} y="62" width="10" height="68" fill={door.leafLight} />
      <path d={`M${x + 10} 62v68M${x + 20} 62v68`} stroke={door.leafDeep} strokeWidth=".8" opacity=".45" />
      <rect x={x} y="80" width="30" height="4.2" fill={door.leafDeep} />
      <rect x={x} y="114" width="30" height="4.2" fill={door.leafDeep} />
      {leafEmblem(x + 15)}
    </>
  );
  return (
    <svg className={`door-art${open ? " is-open" : ""}`} viewBox="0 0 100 132" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect x="20" y="62" width="60" height="68" />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={door.behind.skyTop} />
          <stop offset="1" stopColor={door.behind.skyLow} />
        </linearGradient>
      </defs>
      <path d="M6 130V60a44 44 0 0 1 88 0v70z" fill={STONE} stroke={STONE_LINE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 80h14M6 98h14M6 116h14M80 80h14M80 98h14M80 116h14" stroke={STONE_DEEP} strokeWidth="1.2" />
      <path d="M20 62a30 30 0 0 1 60 0z" fill={door.soft} />
      <g clipPath={`url(#${clip})`}>
        <Behind door={door} sky={sky} />
        <rect className="door-art__flash" x="20" y="62" width="60" height="68" fill={door.behind.light} />
        {/* right leaf first, so the bolt on the left leaf lies over it */}
        <g className="door-art__leaf door-art__leaf--r">{leafBody(50)}</g>
        <g className="door-art__leaf door-art__leaf--l">
          {leafBody(20)}
          <rect x="49.2" y="62" width=".8" height="68" fill={door.leafDeep} opacity=".5" />
          <rect x="31" y="93" width="4" height="11" rx="1.2" fill={door.leafDeep} />
          <g className="door-art__bolt">
            <rect x="33" y="96.4" width="25" height="4.2" rx="2.1" fill={GOLD} stroke={GOLD_DEEP} strokeWidth=".7" />
            <circle cx="40" cy="98.5" r="2.5" fill="#e2ad2a" stroke={GOLD_DEEP} strokeWidth=".7" />
          </g>
        </g>
        {/* the keeper on the right leaf holds the bolt's end */}
        <g className="door-art__leaf door-art__leaf--r">
          <rect x="55" y="93" width="4" height="11" rx="1.2" fill={door.leafDeep} />
        </g>
      </g>
      <rect x="20" y="62" width="60" height="68" fill="none" stroke={STONE_LINE} strokeWidth="1.2" />
      <rect x="15" y="128" width="70" height="4" rx="1.5" fill={STONE_DEEP} />
      <g transform={`translate(${MEDALLION[0]} ${MEDALLION[1]})`}>
        {BEADS.map(([x, y], i) => (
          <circle key={i} className={i < lit ? "door-art__bead is-lit" : "door-art__bead"} cx={x} cy={y} r="1.9" />
        ))}
        <circle r="8.6" fill={door.leafDeep} stroke="#fbf6ee" strokeWidth="1" />
        {progress !== undefined ? <circle className={`door-art__live${live ? " is-on" : ""}`} r="7.3" fill="none" strokeWidth="1.3" /> : null}
        <g transform="scale(5.4)">
          <Emblem kind={door.id} fill={door.emblem} deep={door.emblemDeep} />
        </g>
      </g>
    </svg>
  );
});
