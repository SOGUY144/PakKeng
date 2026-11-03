export type GameId = "runner" | "balloon" | "frog";
export type Level = 1 | 2 | 3;

/** แผนการฝึกที่นักแก้ไขการพูดตั้งต่อเด็กหนึ่งคน — แหล่งเดียวของเกณฑ์ทุกค่าในเกม */
export interface Plan {
  /** ชุดคำด้านปาก (โจทย์ในวิ่งหนี/บอลลูน/กบ) */
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

export interface Session {
  id: string;
  childId: string;
  /** "sample" = seeded example history, "demo" = played in this demo. */
  source: "sample" | "demo";
  startedAt: string;
  durationSec: number;
  game: GameId;
  rounds: number;
  words: string[];
  level: Level;
  oralThreshold: number;
  gateThreshold: number;
  /** Voiced attempts judged on the oral criterion. */
  attempts: number;
  passed: number;
  /** Mean nasal % while saying oral-target words (null when nothing was said). */
  meanNasalOral: number | null;
  gate: GateSummary | null;
  balloon: BalloonSummary | null;
  frog: FrogSummary | null;
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

export interface DemoDB {
  version: 1;
  seededAt: string;
  activeChildId: string;
  children: Child[];
  sessions: Session[];
  calibrations: Record<string, Calibration>;
}

export const GAME_LABEL: Record<GameId, string> = {
  runner: "วิ่งหนี",
  balloon: "บอลลูน",
  frog: "กบข้ามบึง",
};

export const LEVEL_LABEL: Record<Level, string> = {
  1: "ลากเสียงยาว",
  2: "พยางค์เดี่ยว",
  3: "พยางค์ซ้ำ",
};
