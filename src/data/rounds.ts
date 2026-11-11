import type { Attempt } from "../logic/common";
import { totals } from "../logic/common";
import { callGroupNasal } from "./callWords";
import { addSession } from "./store";
import type { BalloonSummary, CallSummary, Child, FrogSummary, GameId, GateSummary, KickSummary, RoundChoice, Session, SignalKind, TowerSummary, TrainSummary } from "./schema";

/**
 * Hand-off between screens of one round (เลือกทางวิ่ง → ด่านประตู → สรุป).
 * Kept in sessionStorage so a refresh on the gate does not lose the runner part.
 */
const PENDING_KEY = "nasal-trainer-demo:pending-runner";
const LAST_KEY = "nasal-trainer-demo:last-result";

export interface PendingRunner {
  childId: string;
  startedAt: string;
  attempts: Attempt[];
  stars: number;
  practiceMs: number;
  completed: boolean;
  /** The route the child picked, kept for the result if the door is not played after the run. */
  choice?: RoundChoice | null;
  /** Signal source of the run: the door never merges a run from another source into its own round. */
  source?: SignalKind;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function setPendingRunner(p: PendingRunner | null): void {
  writeJSON(PENDING_KEY, p);
}

export function getPendingRunner(childId: string): PendingRunner | null {
  const p = readJSON<PendingRunner>(PENDING_KEY);
  return p && p.childId === childId ? p : null;
}

export function getLastResultId(): string | null {
  return readJSON<string>(LAST_KEY);
}

interface FinishArgs {
  child: Child;
  game: GameId;
  startedAt: string;
  practiceMs: number;
  /** Attempts judged on the oral criterion. */
  attempts: Attempt[];
  stars: number;
  gate?: GateSummary | null;
  balloon?: BalloonSummary | null;
  frog?: FrogSummary | null;
  call?: CallSummary | null;
  kick?: KickSummary | null;
  tower?: TowerSummary | null;
  train?: TrainSummary | null;
  choice?: RoundChoice | null;
  endedEarly?: boolean;
  /** Signal source of the round (labelled demo vs real device): saved as the round's source; rewards keep them apart. */
  source: SignalKind;
}

/** One id per round (game + start time): saving the same round twice (double tap, back and save again) keeps one session. */
export function roundId(game: GameId, startedAt: string): string {
  const ms = Date.parse(startedAt);
  return `d-${game}-${(Number.isFinite(ms) ? ms : 0).toString(36)}`;
}

/** Detected speech attempts with usable signal: call rounds count them per word; the other games keep only usable utterances. */
function usableAttemptsOf(call: CallSummary | null, attempts: number, gate: GateSummary | null): number {
  if (call) return call.words.reduce((n, w) => n + w.usable, 0);
  return attempts + (gate?.usable ?? gate?.attempts ?? 0);
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** Save a finished demo round as a session the dashboard can read, and remember it for the result screen. */
export function finishRound(a: FinishArgs): Session {
  const t = totals(a.attempts);
  const p = a.child.plan;
  const call = a.call ?? null;
  const session: Session = {
    id: roundId(a.game, a.startedAt),
    childId: a.child.id,
    source: a.source,
    startedAt: a.startedAt,
    durationSec: Math.round(a.practiceMs / 1000),
    game: a.game,
    rounds: 1,
    words: call ? call.words.map((w) => w.word) : [...p.words],
    level: p.level,
    oralThreshold: p.oralThreshold,
    gateThreshold: p.gateThreshold,
    attempts: call ? call.words.reduce((n, w) => n + w.attempts, 0) : t.attempts,
    passed: call ? call.words.reduce((n, w) => n + w.usable, 0) : t.passed,
    meanNasalOral: call ? round1(callGroupNasal(call, "oral").mean) : round1(t.meanNasal),
    gate: a.gate ?? null,
    balloon: a.balloon ?? null,
    frog: a.frog ?? null,
    call,
    kick: a.kick ?? null,
    tower: a.tower ?? null,
    train: a.train ?? null,
    usableAttempts: usableAttemptsOf(call, t.attempts, a.gate ?? null),
    choice: a.choice ?? null,
    stars: a.stars,
    endedEarly: a.endedEarly ?? false,
  };
  addSession(session);
  writeJSON(LAST_KEY, session.id);
  setPendingRunner(null);
  return session;
}

export function summarizeGate(attempts: Attempt[], opened: boolean, skipped: boolean): GateSummary {
  const t = totals(attempts);
  return {
    attempts: t.attempts,
    usable: attempts.filter((a) => a.usable !== false).length,
    passed: t.passed,
    meanNasal: t.meanNasal === null ? null : Math.round(t.meanNasal * 10) / 10,
    opened,
    skipped,
  };
}
