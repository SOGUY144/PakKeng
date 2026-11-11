import type { AvatarSpecies, EggKind, PetKind, PlantKind, WearId } from "../data/schema";
import { CollectibleIcon } from "./Art";

/**
 * ภาพ 2D ของเกาะของฉัน (ตัวละคร สัตว์เลี้ยง ไข่ ต้นไม้ ชุด) — ใช้เป็นภาพหลักเมื่อไม่มีภาพเรนเดอร์จากโมเดล 3D
 * และเป็นทางสำรองเมื่อโหลดภาพไม่ได้ ทุกภาพ aria-hidden: ชื่อและสถานะอยู่ในข้อความข้าง ๆ เสมอ
 */
const LINE = "#3b3357";
const EYE = "#2a2340";

function Face({ cx = 50, cy = 56, gap = 12 }: { cx?: number; cy?: number; gap?: number }) {
  return (
    <g>
      <circle cx={cx - gap} cy={cy} r="4.5" fill={EYE} />
      <circle cx={cx + gap} cy={cy} r="4.5" fill={EYE} />
      <circle cx={cx - gap + 1.5} cy={cy - 1.5} r="1.4" fill="#fff" />
      <circle cx={cx + gap + 1.5} cy={cy - 1.5} r="1.4" fill="#fff" />
      <ellipse cx={cx - gap - 7} cy={cy + 9} rx="5" ry="3" fill="#ffb3c7" opacity=".8" />
      <ellipse cx={cx + gap + 7} cy={cy + 9} rx="5" ry="3" fill="#ffb3c7" opacity=".8" />
    </g>
  );
}

export function SpeciesArt({ id, size = 72 }: { id: AvatarSpecies; size?: number }) {
  const head = { bunny: "#fff8ee", puppy: "#e9b97f", dino: "#9fdcab", kitty: "#d8cdf2" }[id];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      {id === "bunny" ? (
        <g stroke={LINE} strokeWidth="3">
          <path d="M34 34C28 16 30 4 37 4s8 14 6 30" fill={head} />
          <path d="M66 34c6-18 4-30-3-30s-8 14-6 30" fill={head} />
          <path d="M37 30c-2-10-1-18 1-20M63 30c2-10 1-18-1-20" stroke="#ffb3c7" strokeWidth="4" fill="none" />
        </g>
      ) : null}
      {id === "puppy" ? (
        <g stroke={LINE} strokeWidth="3" fill="#a8743f">
          <path d="M22 40c-10 6-12 26-4 32 6 4 10-6 12-18z" />
          <path d="M78 40c10 6 12 26 4 32-6 4-10-6-12-18z" />
        </g>
      ) : null}
      {id === "kitty" ? (
        <g stroke={LINE} strokeWidth="3" fill={head}>
          <path d="M24 42 28 14l20 18z" />
          <path d="M76 42 72 14 52 32z" />
        </g>
      ) : null}
      {id === "dino" ? (
        <g stroke={LINE} strokeWidth="2.5" fill="#62b97a">
          <path d="M38 24l6-12 6 12zM50 22l6-13 6 13zM62 26l5-10 5 11z" />
        </g>
      ) : null}
      <circle cx="50" cy="58" r="32" fill={head} stroke={LINE} strokeWidth="3" />
      {id === "puppy" ? <ellipse cx="50" cy="70" rx="13" ry="9" fill="#fff3e3" stroke={LINE} strokeWidth="2.5" /> : null}
      {id === "puppy" ? <ellipse cx="50" cy="65" rx="5" ry="3.5" fill={EYE} /> : null}
      {id === "kitty" ? <path d="M24 66h12M24 72l12-2M76 66H64M76 72l-12-2" stroke={LINE} strokeWidth="2" /> : null}
      {id === "dino" ? <ellipse cx="50" cy="74" rx="16" ry="8" fill="#d7f3dc" /> : null}
      <Face cy={id === "puppy" ? 52 : 56} />
    </svg>
  );
}

export function PetArt({ kind, size = 64 }: { kind: PetKind; size?: number }) {
  const body = { puppy: "#f1c08a", kitten: "#ffc58f", chick: "#ffe066", dino: "#9fdcab", dragon: "#c7b5ff", unicorn: "#ffffff" }[kind];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <ellipse cx="50" cy="90" rx="26" ry="5" fill="rgba(0,0,0,.08)" />
      {kind === "dragon" ? <path d="M22 50c-14-8-16-24-6-26 4 10 10 14 20 16M78 50c14-8 16-24 6-26-4 10-10 14-20 16" fill="#e7dcff" stroke={LINE} strokeWidth="2.5" /> : null}
      {kind === "unicorn" ? <path d="M50 8l6 22H44z" fill="#ffd34d" stroke={LINE} strokeWidth="2.5" /> : null}
      {kind === "unicorn" ? <path d="M30 30c-8 6-8 16-2 22M34 26c-8 2-12 8-12 14" stroke="#ff9cc8" strokeWidth="6" fill="none" strokeLinecap="round" /> : null}
      {kind === "puppy" ? <path d="M26 40c-10 4-10 20-2 24M74 40c10 4 10 20 2 24" fill="#c98b4c" stroke={LINE} strokeWidth="2.5" /> : null}
      {kind === "kitten" ? <path d="M28 40l2-20 16 12M72 40l-2-20-16 12" fill={body} stroke={LINE} strokeWidth="2.5" /> : null}
      {kind === "dino" ? <path d="M40 26l5-9 5 9zM52 25l5-9 5 9z" fill="#62b97a" stroke={LINE} strokeWidth="2" /> : null}
      <circle cx="50" cy="56" r="30" fill={body} stroke={LINE} strokeWidth="3" />
      {kind === "chick" ? <path d="M44 64l6 6 6-6z" fill="#ff9a3c" stroke={LINE} strokeWidth="2" /> : null}
      {kind === "puppy" ? <ellipse cx="50" cy="66" rx="5" ry="3.5" fill={EYE} /> : null}
      <Face cy={54} gap={11} />
    </svg>
  );
}

export function EggArt({ kind, crack = 0, size = 72 }: { kind: EggKind; crack?: number; size?: number }) {
  const shell = { sun: "#ffe680", leaf: "#bfeccb", sky: "#cfe4ff", star: "#e2d6ff" }[kind];
  const deco = { sun: "#ffad3b", leaf: "#4fb36d", sky: "#ffffff", star: "#ffd34d" }[kind];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <ellipse cx="50" cy="90" rx="30" ry="6" fill="#d6b48c" />
      <path d="M50 8C30 8 18 40 18 60c0 18 14 30 32 30s32-12 32-30C82 40 70 8 50 8z" fill={shell} stroke={LINE} strokeWidth="3" />
      {kind === "sun" ? [30, 48, 66].map((x, i) => <circle key={x} cx={x} cy={50 + (i % 2) * 14} r="5" fill={deco} />) : null}
      {kind === "leaf" ? [32, 62].map((x) => <path key={x} d={`M${x} 56c6-10 16-10 16-10s-2 12-16 10z`} fill={deco} />) : null}
      {kind === "sky" ? [36, 62].map((x, i) => <ellipse key={x} cx={x} cy={46 + i * 18} rx="11" ry="6" fill={deco} />) : null}
      {kind === "star" ? [34, 64, 50].map((x, i) => <path key={x} d={`M${x} ${40 + i * 12}l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z`} fill={deco} />) : null}
      {crack >= 1 ? <path d="M34 34l6 6 5-6 6 7" fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" /> : null}
      {crack >= 2 ? <path d="M56 28l4 8 7-3" fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" /> : null}
      {crack >= 3 ? <path d="M24 52l8 4 6-6 7 7 6-5 8 6 7-5 9 4" fill="none" stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" /> : null}
    </svg>
  );
}

export function PlantArt({ kind, stage, size = 72 }: { kind: PlantKind | null; stage: number; size?: number }) {
  const fruit = { carrot: "#ff9a3c", sunflower: "#ffd34d", strawberry: "#ff5d73", starfruit: "#ffd34d" };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path d="M10 78h80l-6 16H16z" fill="#c98b4c" stroke={LINE} strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="50" cy="78" rx="38" ry="7" fill="#8a5a2b" />
      {kind && stage === 0 ? <ellipse cx="50" cy="74" rx="10" ry="5" fill="#a36b37" /> : null}
      {kind && stage >= 1 ? <path d={stage === 1 ? "M50 76V62" : "M50 76V34"} stroke="#4f9a54" strokeWidth="4" strokeLinecap="round" /> : null}
      {kind && stage === 1 ? <path d="M50 64c-8-2-12-8-12-8s8-2 12 6c4-8 12-6 12-6s-4 6-12 8z" fill="#6cc070" /> : null}
      {kind && stage >= 2 ? <path d="M50 60c-12-2-18-12-18-12s12-2 18 10M50 52c12-2 18-12 18-12s-12-2-18 10" fill="#6cc070" stroke="#3f8f4d" strokeWidth="2" /> : null}
      {kind && stage >= 3 && kind === "sunflower" ? (
        <g>
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx="50" cy="20" rx="5" ry="10" fill={fruit.sunflower} transform={`rotate(${i * 45} 50 30)`} />
          ))}
          <circle cx="50" cy="30" r="8" fill="#8a5a2b" />
        </g>
      ) : null}
      {kind && stage >= 3 && kind === "carrot" ? <path d="M44 76l6 16 6-16z" fill={fruit.carrot} stroke={LINE} strokeWidth="2" /> : null}
      {kind && stage >= 3 && kind === "strawberry" ? [40, 60].map((x) => <path key={x} d={`M${x - 7} 40h14l-7 12z`} fill={fruit.strawberry} stroke={LINE} strokeWidth="2" />) : null}
      {kind && stage >= 3 && kind === "starfruit" ? <path d="M50 14l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill={fruit.starfruit} stroke="#b07800" strokeWidth="2" /> : null}
    </svg>
  );
}

export function WearArt({ id, size = 44 }: { id: WearId; size?: number }) {
  if (id === "cap" || id === "shoes" || id === "scarf" || id === "crown") return <CollectibleIcon id={id} size={size} />;
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} aria-hidden="true">
      {id === "jersey" ? (
        <g stroke={LINE} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M18 10l-12 8 6 12 6-3v25h24V27l6 3 6-12-12-8c-2 5-6 7-12 7s-10-2-12-7z" fill="#7cc4ff" />
          <path d="M26 30h8v12h-8z" fill="#fff" />
        </g>
      ) : null}
      {id === "cape" ? (
        <g stroke={LINE} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M14 10h32l8 42c-8 4-16 4-24 0-8 4-16 4-24 0z" fill="#ff6b6b" />
          <path d="M30 22l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z" fill="#ffd34d" />
        </g>
      ) : null}
      {id === "hoodie" ? (
        <g stroke={LINE} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M10 46c0-22 8-36 20-36s20 14 20 36z" fill="#8fd3a0" />
          <path d="M20 46c0-14 4-22 10-22s10 8 10 22" fill="#fff8ee" />
          <path d="M22 12l4-8 4 7 4-7 4 8" fill="#62b97a" />
        </g>
      ) : null}
      {id === "dress" ? (
        <g stroke={LINE} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M22 8h16l-2 14 16 30H8l16-30z" fill="#ffb3d1" />
          <path d="M24 20c4 3 8 3 12 0" fill="none" />
          <circle cx="30" cy="12" r="3" fill="#fff" />
        </g>
      ) : null}
    </svg>
  );
}
