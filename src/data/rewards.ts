import { COLLECTIBLES } from "./analytics";
import type { AvatarSpecies, Child, DemoDB, EggKind, PetKind, PlantKind, RewardLedger, RewardState, Session, SignalKind, WearId } from "./schema";
import { getDB, updateRewards } from "./store";

/**
 * รางวัลของ “เกาะของฉัน” — โตจาก “ช่วงที่ตรวจพบการลองพูด” ที่สัญญาณใช้ได้เท่านั้น (Session.usableAttempts)
 *   ไม่ใช่จำนวนคำที่พูดถูก (ไม่มีระบบรู้จำคำพูด) · เสียงตัวอย่าง เงียบ ล้น หลุด ช่องหาย ไม่นับ
 * - ไม่มีของสุ่ม เงิน โฆษณา หรือการลงโทษวันที่ไม่ได้เล่น: ไข่ ต้นไม้ และชุด บอกล่วงหน้าเสมอว่าอีกกี่ครั้ง
 * - รอบที่เล่นด้วยเสียงจำลอง (โหมดสาธิต) กับรอบที่ใช้อุปกรณ์จริง แยกกองรางวัลกัน · ข้อมูลตัวอย่าง (seed) ไม่สร้างความคืบหน้า
 * - เก็บเฉพาะสิ่งที่เด็กเลือก ส่วนความคืบหน้าคำนวณจากรอบที่บันทึกไว้ (บันทึกซ้ำ/เปิดผลซ้ำจึงไม่เพิ่มอะไร)
 */

export const SPECIES: { id: AvatarSpecies; name: string }[] = [
  { id: "bunny", name: "กระต่าย" },
  { id: "puppy", name: "ลูกหมา" },
  { id: "dino", name: "ไดโน" },
  { id: "kitty", name: "แมวเหมียว" },
];

/** The child's character by name, for lines that talk about the one on screen ("ไดโนจะถึงธง"). */
export function speciesName(id: AvatarSpecies): string {
  return SPECIES.find((s) => s.id === id)?.name ?? "กระต่าย";
}

export const PET_NAME: Record<PetKind, string> = {
  puppy: "ลูกหมา",
  kitten: "ลูกแมว",
  chick: "ลูกเจี๊ยบ",
  dino: "ไดโนน้อย",
  dragon: "มังกรน้อย",
  unicorn: "ยูนิคอร์น",
};

/** The first pet is picked at once (no waiting): either of these. */
export const STARTER_PETS: PetKind[] = ["puppy", "kitten"];

/** Each egg says which pet is inside — nothing is random. */
export const EGGS: { id: EggKind; name: string; pet: PetKind }[] = [
  { id: "sun", name: "ไข่พระอาทิตย์", pet: "chick" },
  { id: "leaf", name: "ไข่ใบไม้", pet: "dino" },
  { id: "sky", name: "ไข่ท้องฟ้า", pet: "unicorn" },
  { id: "star", name: "ไข่ดวงดาว", pet: "dragon" },
];

/** Detected usable speech attempts (counted from when the egg was picked) that hatch it. */
export const EGG_ATTEMPTS = 12;

export const PLANTS: { id: PlantKind; name: string }[] = [
  { id: "carrot", name: "แครอท" },
  { id: "sunflower", name: "ทานตะวัน" },
  { id: "strawberry", name: "สตรอว์เบอร์รี" },
  { id: "starfruit", name: "ต้นดาววิเศษ" },
];

export const BEDS = 3;
/** Usable attempts since planting for stage 1 (sprout), 2 (growing), 3 (ready to pick). */
export const STAGE_ATTEMPTS = [3, 8, 18] as const;
export const STAGE_NAME = ["เมล็ด", "ต้นอ่อน", "กำลังโต", "พร้อมเก็บ"] as const;

export type WearSlot = "head" | "top" | "neck" | "body" | "back" | "feet";
export interface WearItem {
  id: WearId;
  name: string;
  /** One item per slot is worn at a time. */
  slot: WearSlot;
  /** Classic collectibles unlock with stars (as before); new clothes with usable speech attempts. */
  need: { stars: number } | { tries: number };
}

const CLASSIC_SLOT: Record<(typeof COLLECTIBLES)[number]["id"], WearSlot> = { cap: "head", shoes: "feet", scarf: "neck", crown: "top" };

export const WEAR: WearItem[] = [
  ...COLLECTIBLES.map((c) => ({ id: c.id, name: c.name, slot: CLASSIC_SLOT[c.id], need: { stars: c.stars } })),
  { id: "jersey", name: "เสื้อบอล", slot: "body", need: { tries: 5 } },
  { id: "cape", name: "ผ้าคลุมฮีโร่", slot: "back", need: { tries: 15 } },
  { id: "hoodie", name: "ฮู้ดไดโน", slot: "head", need: { tries: 25 } },
  { id: "dress", name: "ชุดเจ้าหญิง", slot: "body", need: { tries: 35 } },
];

const wearById = (id: WearId) => WEAR.find((w) => w.id === id);

// ---------- time (a demo-only "next day" offset lets the garden be shown without waiting a real night) ----------

const DAY_MS = 86_400_000;
const DAY_OFFSET_KEY = "nasal-trainer-demo:day-offset";

export function dayOffset(): number {
  try {
    const v = Number(localStorage.getItem(DAY_OFFSET_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

/** Demo tool only (labelled as such in the caregiver area). */
export function setDayOffset(days: number): void {
  try {
    if (days > 0) localStorage.setItem(DAY_OFFSET_KEY, String(Math.floor(days)));
    else localStorage.removeItem(DAY_OFFSET_KEY);
  } catch {
    // not stored: the offset just does not apply
  }
}

/** Now for one pool of rewards: the demo-only "next day" offset never moves the real device's clock. */
export function nowMs(source: SignalKind = "demo"): number {
  return Date.now() + (source === "demo" ? dayOffset() * DAY_MS : 0);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day, e.g. "2026-11-11". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole local calendar days from `fromMs` to `toMs` (0 = same day). */
export function daysBetween(fromMs: number, toMs: number): number {
  const a = new Date(fromMs);
  const b = new Date(toMs);
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / DAY_MS);
}

// ---------- counting detected attempts ----------

/** Usable speech attempts of a saved round (older rounds without the count are derived the same way finishRound does). */
export function sessionAttempts(s: Session): number {
  if (typeof s.usableAttempts === "number") return s.usableAttempts;
  if (s.call) return s.call.words.reduce((n, w) => n + w.usable, 0);
  return s.attempts + (s.gate?.usable ?? s.gate?.attempts ?? 0);
}

/** Rounds that grow rewards: played in this app on this source (never the seeded sample history), by this child. */
function rewardRounds(d: DemoDB, childId: string, source: SignalKind): Session[] {
  return d.sessions.filter((s) => s.childId === childId && s.source === source);
}

export function totalAttempts(d: DemoDB, childId: string, source: SignalKind): number {
  return rewardRounds(d, childId, source).reduce((n, s) => n + sessionAttempts(s), 0);
}

/** Attempts of rounds started at or after `sinceIso`. */
export function attemptsSince(d: DemoDB, childId: string, source: SignalKind, sinceIso: string): number {
  const t0 = Date.parse(sinceIso);
  return rewardRounds(d, childId, source)
    .filter((s) => Date.parse(s.startedAt) >= t0)
    .reduce((n, s) => n + sessionAttempts(s), 0);
}

/** Usable attempts on one local day. */
export function attemptsOnDay(d: DemoDB, childId: string, source: SignalKind, day: string): number {
  return rewardRounds(d, childId, source)
    .filter((s) => dayKey(Date.parse(s.startedAt)) === day)
    .reduce((n, s) => n + sessionAttempts(s), 0);
}

/** Stars that unlock classic collectibles: demo = the seeded sample stars + demo rounds (as before); device = device rounds only. */
export function starsFor(d: DemoDB, child: Child, source: SignalKind): number {
  const played = rewardRounds(d, child.id, source).reduce((n, s) => n + s.stars, 0);
  return source === "demo" ? child.sampleStars + played : played;
}

// ---------- the child's picks ----------

export const EMPTY_LEDGER: RewardLedger = { egg: null, pets: [], buddy: null, beds: Array.from({ length: BEDS }, () => null), harvest: {} };

export function rewardsOf(d: DemoDB, childId: string): RewardState {
  const r = d.rewards?.[childId];
  return { species: r?.species ?? "bunny", wear: r?.wear ?? null, ledgers: r?.ledgers ?? {} };
}

export function ledgerOf(r: RewardState, signal: SignalKind): RewardLedger {
  const l = r.ledgers[signal];
  if (!l) return EMPTY_LEDGER;
  const beds = Array.from({ length: BEDS }, (_, i) => l.beds?.[i] ?? null);
  return { ...EMPTY_LEDGER, ...l, pets: l.pets ?? [], harvest: l.harvest ?? {}, beds };
}

// ---------- progress ----------

export interface EggView {
  kind: EggKind;
  pet: PetKind;
  tries: number;
  need: number;
  ready: boolean;
  /** Cracks shown on the shell (0–3). */
  crack: 0 | 1 | 2 | 3;
}

export function eggView(d: DemoDB, childId: string, signal: SignalKind, l: RewardLedger): EggView | null {
  if (!l.egg) return null;
  const egg = EGGS.find((e) => e.id === l.egg?.kind) ?? EGGS[0];
  const tries = Math.min(EGG_ATTEMPTS, attemptsSince(d, childId, signal, l.egg.since));
  const ready = tries >= EGG_ATTEMPTS;
  const crack = ready ? 3 : tries >= (EGG_ATTEMPTS * 2) / 3 ? 2 : tries >= EGG_ATTEMPTS / 3 ? 1 : 0;
  return { kind: egg.id, pet: egg.pet, tries, need: EGG_ATTEMPTS, ready, crack };
}

export interface BedView {
  index: number;
  kind: PlantKind | null;
  tries: number;
  stage: 0 | 1 | 2 | 3;
  ready: boolean;
  /** Attempts to the next stage, or null when ready / waiting for tomorrow. */
  toNext: number | null;
  /** Grown enough, but a plant only becomes ready to pick from the day after planting. */
  waitTomorrow: boolean;
}

export function stageForTries(tries: number): 0 | 1 | 2 | 3 {
  return tries >= STAGE_ATTEMPTS[2] ? 3 : tries >= STAGE_ATTEMPTS[1] ? 2 : tries >= STAGE_ATTEMPTS[0] ? 1 : 0;
}

/** A bed's plant: grows with attempts since planting; on the planting day it reaches "growing" at most. It never wilts. */
export function bedView(d: DemoDB, childId: string, signal: SignalKind, l: RewardLedger, index: number, now: number): BedView {
  const bed = l.beds[index] ?? null;
  if (!bed) return { index, kind: null, tries: 0, stage: 0, ready: false, toNext: null, waitTomorrow: false };
  const tries = attemptsSince(d, childId, signal, bed.since);
  const byTries = stageForTries(tries);
  const cap = daysBetween(Date.parse(bed.since), now) >= 1 ? 3 : 2;
  const stage = Math.min(byTries, cap) as 0 | 1 | 2 | 3;
  const waitTomorrow = byTries > stage;
  const toNext = stage < 3 && !waitTomorrow ? STAGE_ATTEMPTS[stage as 0 | 1 | 2] - tries : null;
  return { index, kind: bed.kind, tries, stage, ready: stage === 3, toNext, waitTomorrow };
}

// ---------- clothes ----------

export interface WearView extends WearItem {
  unlocked: boolean;
  /** Stars or attempts still needed (0 when unlocked). */
  left: number;
  unit: "ดาว" | "ครั้ง";
}

export function wearViews(d: DemoDB, child: Child, signal: SignalKind): WearView[] {
  const stars = starsFor(d, child, signal);
  const tries = totalAttempts(d, child.id, signal);
  return WEAR.map((w) => {
    const have = "stars" in w.need ? stars : tries;
    const need = "stars" in w.need ? w.need.stars : w.need.tries;
    return { ...w, unlocked: have >= need, left: Math.max(0, need - have), unit: "stars" in w.need ? "ดาว" : "ครั้ง" };
  });
}

/** What the child wears now: their picks (or, if they never picked, every unlocked classic collectible), unlocked only. */
export function wornIds(d: DemoDB, child: Child, signal: SignalKind): WearId[] {
  const views = wearViews(d, child, signal);
  const unlocked = new Set(views.filter((v) => v.unlocked).map((v) => v.id));
  const picks = rewardsOf(d, child.id).wear ?? views.filter((v) => "stars" in v.need).map((v) => v.id);
  return picks.filter((id) => unlocked.has(id));
}

/** The outfit string the 3D character reads (e.g. "cap,jersey"). */
export function outfitOf(d: DemoDB, child: Child, signal: SignalKind): string {
  return wornIds(d, child, signal).join(",");
}

/** Put an item on (taking off whatever was in its slot) or take it off. */
export function wearToggle(current: WearId[], id: WearId): WearId[] {
  if (current.includes(id)) return current.filter((x) => x !== id);
  const slot = wearById(id)?.slot;
  return [...current.filter((x) => wearById(x)?.slot !== slot), id];
}

// ---------- pure ledger changes ----------

export function withStarter(l: RewardLedger, pet: PetKind): RewardLedger {
  if (l.pets.length > 0 || !STARTER_PETS.includes(pet)) return l;
  return { ...l, pets: [pet], buddy: pet };
}

export function withEgg(l: RewardLedger, kind: EggKind, sinceIso: string): RewardLedger {
  if (l.egg) return l;
  const egg = EGGS.find((e) => e.id === kind);
  if (!egg || l.pets.includes(egg.pet)) return l;
  return { ...l, egg: { kind, since: sinceIso } };
}

export function withHatched(l: RewardLedger, pet: PetKind): RewardLedger {
  const pets = l.pets.includes(pet) ? l.pets : [...l.pets, pet];
  return { ...l, egg: null, pets, buddy: l.buddy ?? pet };
}

export function withPlant(l: RewardLedger, index: number, kind: PlantKind, sinceIso: string): RewardLedger {
  if (index < 0 || index >= BEDS || l.beds[index]) return l;
  return { ...l, beds: l.beds.map((b, i) => (i === index ? { kind, since: sinceIso } : b)) };
}

export function withHarvest(l: RewardLedger, index: number, kind: PlantKind): RewardLedger {
  return {
    ...l,
    beds: l.beds.map((b, i) => (i === index ? null : b)),
    harvest: { ...l.harvest, [kind]: (l.harvest[kind] ?? 0) + 1 },
  };
}

// ---------- actions (UI) ----------

function changeLedger(childId: string, signal: SignalKind, f: (l: RewardLedger) => RewardLedger): void {
  updateRewards(childId, (cur) => {
    const r: RewardState = { species: cur?.species ?? "bunny", wear: cur?.wear ?? null, ledgers: cur?.ledgers ?? {} };
    return { ...r, ledgers: { ...r.ledgers, [signal]: f(ledgerOf(r, signal)) } };
  });
}

export function chooseSpecies(childId: string, species: AvatarSpecies): void {
  updateRewards(childId, (cur) => ({ species, wear: cur?.wear ?? null, ledgers: cur?.ledgers ?? {} }));
}

/** Toggle an unlocked item (locked items are ignored). */
export function toggleWear(child: Child, signal: SignalKind, id: WearId): void {
  const d = getDB();
  const views = wearViews(d, child, signal);
  if (!views.some((v) => v.id === id && v.unlocked)) return;
  // toggle the stored picks (they may include clothes unlocked only in the other pool); display filters by unlocks
  const stored = rewardsOf(d, child.id).wear ?? views.filter((v) => "stars" in v.need && v.unlocked).map((v) => v.id);
  updateRewards(child.id, (cur) => ({ species: cur?.species ?? "bunny", ledgers: cur?.ledgers ?? {}, wear: wearToggle(stored, id) }));
}

export function adoptStarter(childId: string, signal: SignalKind, pet: PetKind): void {
  changeLedger(childId, signal, (l) => withStarter(l, pet));
}

export function chooseEgg(childId: string, signal: SignalKind, kind: EggKind): void {
  changeLedger(childId, signal, (l) => withEgg(l, kind, new Date().toISOString()));
}

/** Hatch the egg once its attempts are done. Returns the new pet (or null if it was not ready). */
export function hatchEgg(childId: string, signal: SignalKind): PetKind | null {
  const d = getDB();
  const l = ledgerOf(rewardsOf(d, childId), signal);
  const v = eggView(d, childId, signal, l);
  if (!v?.ready) return null;
  changeLedger(childId, signal, (cur) => (cur.egg?.kind === v.kind ? withHatched(cur, v.pet) : cur));
  return v.pet;
}

export function setBuddy(childId: string, signal: SignalKind, pet: PetKind | null): void {
  changeLedger(childId, signal, (l) => (pet === null || l.pets.includes(pet) ? { ...l, buddy: pet } : l));
}

export function plantSeed(childId: string, signal: SignalKind, index: number, kind: PlantKind): void {
  changeLedger(childId, signal, (l) => withPlant(l, index, kind, new Date().toISOString()));
}

/** Pick a ready plant. Returns what was picked (or null if it was not ready). */
export function harvestBed(childId: string, signal: SignalKind, index: number): PlantKind | null {
  const d = getDB();
  const l = ledgerOf(rewardsOf(d, childId), signal);
  const v = bedView(d, childId, signal, l, index, nowMs(signal));
  if (!v.ready || !v.kind) return null;
  const kind = v.kind;
  changeLedger(childId, signal, (cur) => (cur.beds[index]?.kind === kind ? withHarvest(cur, index, kind) : cur));
  return kind;
}
