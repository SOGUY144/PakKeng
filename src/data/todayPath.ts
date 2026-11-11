import { isSameDay } from "./format";
import { isDoorAlone } from "./resultCards";
import type { GameId, Session } from "./schema";

/**
 * "Today's path" on the kid's Home: mic check → round 1…N → chest.
 * N comes from the teacher's daily minutes (about 3 minutes a round), so no new plan setting is needed.
 * A step is a round saved today in which the child tried to speak; the child still picks the game each round (see DECISIONS.md).
 */

export type PathPlay = GameId | "gate";
export type PathNodeState = "done" | "current" | "locked" | "open";

export interface PathNode {
  kind: "mic" | "round" | "chest";
  /** mic: done | open (never required) · round: done | current | locked · chest: open | locked */
  state: PathNodeState;
  /** 1-based round number (rounds only). */
  round?: number;
  /** The game played in a done round. */
  play?: PathPlay;
}

export interface TodayPath {
  rounds: number;
  played: number;
  /** Rounds played beyond the plan (the path is complete; they are not new steps). */
  extra: number;
  complete: boolean;
  nodes: PathNode[];
  practiceSec: number;
  targetSec: number;
  /** practiceSec / targetSec, at most 1 — the ring around the current step and the banner bar. */
  progress: number;
  starsToday: number;
}

const MIN_PER_ROUND = 3;
const MAX_ROUNDS = 6;

export function roundsFor(dailyMinutes: number): number {
  return Math.min(MAX_ROUNDS, Math.max(1, Math.round(dailyMinutes / MIN_PER_ROUND)));
}

/** The child said something the game listened to: an attempt in the round, or at the door. */
function triedToSpeak(s: Session): boolean {
  return s.attempts > 0 || (s.gate?.attempts ?? 0) > 0;
}

/** A door round played on its own shows as the door; a route (even one that went on to the door) shows as the route. */
function playOf(s: Session): PathPlay {
  return isDoorAlone(s) ? "gate" : s.game;
}

export function todayPath(input: { dailyMinutes: number; sessions: Session[]; calibratedToday: boolean; now: Date; childId?: string }): TodayPath {
  const { dailyMinutes, calibratedToday, now, childId } = input;
  const today = input.sessions
    .filter((s) => (childId === undefined || s.childId === childId) && isSameDay(new Date(s.startedAt), now))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  // a step is a round the child tried to speak in: listening to examples only, all legs skipped, or a device
  // that dropped before any try does not move the path (minutes and stars still count everything saved)
  const tried = today.filter(triedToSpeak);

  const rounds = roundsFor(dailyMinutes);
  const played = tried.length;
  const complete = played >= rounds;

  const nodes: PathNode[] = [{ kind: "mic", state: calibratedToday ? "done" : "open" }];
  for (let i = 0; i < rounds; i++) {
    if (i < played) nodes.push({ kind: "round", state: "done", round: i + 1, play: playOf(tried[i]) });
    else nodes.push({ kind: "round", state: i === played ? "current" : "locked", round: i + 1 });
  }
  nodes.push({ kind: "chest", state: complete ? "open" : "locked" });

  const practiceSec = today.reduce((n, s) => n + s.durationSec, 0);
  const targetSec = dailyMinutes * 60;
  return {
    rounds,
    played,
    extra: Math.max(0, played - rounds),
    complete,
    nodes,
    practiceSec,
    targetSec,
    progress: targetSec > 0 ? Math.min(1, practiceSec / targetSec) : 0,
    starsToday: today.reduce((n, s) => n + s.stars, 0),
  };
}

/** Monday 00:00 of the week `now` is in (local time). */
function weekStart(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

/** Days this week (Mon–Sun) with at least one saved round. Not a streak: a missed day never resets it. */
export function practiceDaysThisWeek(sessions: Session[], now: Date, childId?: string): number {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days = new Set<string>();
  for (const s of sessions) {
    if (childId !== undefined && s.childId !== childId) continue;
    const t = new Date(s.startedAt);
    if (t >= start && t < end) days.add(`${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`);
  }
  return days.size;
}

/** Games added after the first release: the activity cards mark them "ใหม่" until the child has played one round. */
export const NEW_PLAYS: PathPlay[] = ["train", "tower", "kick"];

/** The new games this child has not played yet (the seeded sample history does not count as playing). */
export function freshPlays(sessions: Session[], childId?: string): PathPlay[] {
  const played = new Set(sessions.filter((s) => s.source !== "sample" && (childId === undefined || s.childId === childId)).map(playOf));
  return NEW_PLAYS.filter((p) => !played.has(p));
}
