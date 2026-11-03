import type { Attempt } from "../logic/common";
import { totals } from "../logic/common";
import { addSession } from "./store";
import type { BalloonSummary, Child, FrogSummary, GameId, GateSummary, Session } from "./schema";

/**
 * Hand-off between screens of one round (วิ่งหนี → ด่านประตู → สรุป).
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
  endedEarly?: boolean;
}

/** Save a finished demo round as a session the dashboard can read, and remember it for the result screen. */
export function finishRound(a: FinishArgs): Session {
  const t = totals(a.attempts);
  const p = a.child.plan;
  const session: Session = {
    id: `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    childId: a.child.id,
    source: "demo",
    startedAt: a.startedAt,
    durationSec: Math.round(a.practiceMs / 1000),
    game: a.game,
    rounds: 1,
    words: [...p.words],
    level: p.level,
    oralThreshold: p.oralThreshold,
    gateThreshold: p.gateThreshold,
    attempts: t.attempts,
    passed: t.passed,
    meanNasalOral: t.meanNasal === null ? null : Math.round(t.meanNasal * 10) / 10,
    gate: a.gate ?? null,
    balloon: a.balloon ?? null,
    frog: a.frog ?? null,
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
    passed: t.passed,
    meanNasal: t.meanNasal === null ? null : Math.round(t.meanNasal * 10) / 10,
    opened,
    skipped,
  };
}
