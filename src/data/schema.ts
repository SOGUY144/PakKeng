export type GameId = "runner" | "balloon" | "frog" | "kick";
export type Level = 1 | 2 | 3;

/** แผนการฝึกที่นักแก้ไขการพูดตั้งต่อเด็กหนึ่งคน — แหล่งเดียวของเกณฑ์ทุกค่าในเกม */
export interface Plan {
  /** ชุดคำด้านปาก (โจทย์ของเกมวิ่งและบอลลูน) */
  words: string[];
  /** คำนาสิกสำหรับด่านประตู */
  nasalWords: string[];
  /** เกณฑ์ด้านปาก: ออกปากอย่างน้อย (%) */
  oralThreshold: number;
  /** เกณฑ์ด่านนาสิก: ออกจมูกอย่างน้อย (%) */
  gateThreshold: number;
  /** เวลาเป้าหมายต่อวัน (นาที) */
  dailyMinutes: number;
  /** เวลาสะสมในโซนของบอลลูนต่อหนึ่งลูก (วินาที) */
  balloonHoldSec: number;
  level: Level;
  games: Record<GameId, boolean>;
  gateEnabled: boolean;
  /** ชุดคำของด่านเรียกเพื่อน (id ใน CALL_WORDS) — ไม่มี = ใช้ชุดตั้งต้น */
  callWords?: string[];
  updatedAt: string;
}

export interface Child {
  id: string;
  /** Placeholder only — never a real name. */
  nickname: string;
  plan: Plan;
  /** Stars from the seeded sample history (demo rounds add on top). */
  sampleStars: number;
}

export interface GateSummary {
  attempts: number;
  /** Attempts whose signal was usable (not clipped, not too quiet); older rounds have none. */
  usable?: number;
  passed: number;
  meanNasal: number | null;
  opened: boolean;
  skipped: boolean;
}

export interface BalloonSummary {
  completed: number;
  target: number;
  inZoneSec: number;
  speakingSec: number;
  holdSec: number;
}

export interface FrogSummary {
  steps: number;
  target: number;
}

/** One round of penalty kicks: goals scored by voice out of the balls in the round, against the team the child picked. */
export interface KickSummary {
  goals: number;
  shots: number;
  team: string;
}

/** สรุปรายคำของด่านเรียกเพื่อน — เก็บเท่าที่จำเป็น: ไม่มีเสียงดิบ มีแต่จำนวนครั้งและค่าเฉลี่ย */
export interface CallWordSummary {
  id: string;
  word: string;
  resonance: "oral" | "nasal";
  listens: number;
  /** Detected speech segments while the game listened. */
  attempts: number;
  /** Attempts whose signal was usable. */
  usable: number;
  /** Unusable attempts by reason (device/signal trouble, not the child's failure). */
  issues: { quiet: number; loud: number; lost: number; channel: number };
  /** Mean nasal % of usable attempts — descriptive, judged per word type by the therapist. */
  meanNasal: number | null;
  heard: boolean;
  skipped: boolean;
}

export interface CallSummary {
  words: CallWordSummary[];
  /** Friends that heard the child at least once / friends in the round. */
  heard: number;
  target: number;
  /** "demo" = labelled demo mode (simulated signal), "device" = real ESP32 data. */
  source: "demo" | "device";
}

/** What the child picked at the start of a round (friend order, balloon trip, route, door) — shown back on the result screen. */
export interface RoundChoice {
  kind: "friends" | "trip" | "route" | "door" | "team";
  /** Stable id of the choice (e.g. "crab,dog,fish", "lighthouse", "river", "flower"). */
  id: string;
  /** Short Thai name the child saw, e.g. "ประภาคาร". */
  label: string;
}

export interface Session {
  id: string;
  childId: string;
  /**
   * Where the round came from: "sample" = seeded example history (never counted as progress), "demo" = played in this
   * app on the labelled simulated signal, "device" = played on a real device. Rewards and summaries keep them apart.
   */
  source: "sample" | SignalKind;
  startedAt: string;
  durationSec: number;
  game: GameId;
  rounds: number;
  words: string[];
  level: Level;
  oralThreshold: number;
  gateThreshold: number;
  /** Voiced attempts judged on the oral criterion (call rounds: all detected attempts). */
  attempts: number;
  /** Attempts that met the oral criterion (call rounds: attempts with usable signal — no criterion is applied). */
  passed: number;
  /** Mean nasal % while saying oral-target words (null when nothing was said). */
  meanNasalOral: number | null;
  gate: GateSummary | null;
  balloon: BalloonSummary | null;
  frog: FrogSummary | null;
  /** Present on rounds of the call-a-friend level. */
  call?: CallSummary | null;
  /** Present on penalty-kick rounds. */
  kick?: KickSummary | null;
  /**
   * Detected speech attempts with usable signal in this round (never the example word, never silence/clipping/lost data).
   * Not a count of correct words — there is no speech recognition. The only thing rewards (eggs, garden, clothes) grow
   * on. Older rounds have none: see sessionAttempts() in rewards.ts.
   */
  usableAttempts?: number;
  /** The child's own pick for this round (older sessions have none). */
  choice?: RoundChoice | null;
  stars: number;
  /** Ended early by the child/demo user ("จบรอบ"). */
  endedEarly: boolean;
}

export interface Calibration {
  at: string;
  aaNasal: number;
  maNasal: number;
  /** Always true in this prototype: values come from the mock source. */
  simulated: true;
}

export type AvatarSpecies = "bunny" | "puppy" | "dino" | "kitty";
export type PetKind = "puppy" | "kitten" | "chick" | "dino" | "dragon" | "unicorn";
export type EggKind = "sun" | "leaf" | "sky" | "star";
export type PlantKind = "carrot" | "sunflower" | "strawberry" | "starfruit";
export type WearId = "cap" | "shoes" | "scarf" | "crown" | "jersey" | "cape" | "hoodie" | "dress";

/** Where a round's signal came from: the labelled demo (simulated) source or a real device. */
export type SignalKind = "demo" | "device";

/**
 * One pool of rewards (เกาะของฉัน). There is one pool per signal kind, so play with the simulated demo signal never
 * mixes with practice on the real device. Only the child's own picks are stored here — progress (how close the egg is,
 * how big a plant is, which clothes are unlocked) is always computed from saved rounds, so it can only grow from
 * usable spoken words, and saving or reopening a round twice cannot add anything.
 */
export interface RewardLedger {
  /** The egg being warmed and from when its words count. */
  egg: { kind: EggKind; since: string } | null;
  /** Pets the child has (starter pet + hatched eggs), in order. */
  pets: PetKind[];
  /** The pet that comes along in the games. */
  buddy: PetKind | null;
  /** Garden beds: what is planted and from when its words count. */
  beds: ({ kind: PlantKind; since: string } | null)[];
  /** Picked harvest per plant. */
  harvest: Partial<Record<PlantKind, number>>;
}

/** รางวัลของเด็กหนึ่งคน: ตัวละครและชุดที่เลือก (ใช้ร่วมกัน) + กองรางวัลแยกตามชนิดสัญญาณ ไม่มีของสุ่ม เงิน หรือการลงโทษวันที่ไม่ได้เล่น */
export interface RewardState {
  species: AvatarSpecies;
  /** Items the child chose to wear; null = never chose (wear every unlocked classic collectible, as before). */
  wear: WearId[] | null;
  ledgers: Partial<Record<SignalKind, RewardLedger>>;
}

export interface DemoDB {
  version: 1;
  seededAt: string;
  activeChildId: string;
  children: Child[];
  sessions: Session[];
  calibrations: Record<string, Calibration>;
  /** Per child id; absent in older saved data (= nothing chosen yet). */
  rewards?: Record<string, RewardState>;
}

export const GAME_LABEL: Record<GameId, string> = {
  runner: "กระต่ายวิ่ง",
  balloon: "บอลลูน",
  frog: "กบข้ามบึง",
  kick: "ยิงจุดโทษ",
};

export const LEVEL_LABEL: Record<Level, string> = {
  1: "ลากเสียงยาว",
  2: "พยางค์เดี่ยว",
  3: "พยางค์ซ้ำ",
};
