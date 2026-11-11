import { useSyncExternalStore } from "react";
import { createSeed } from "./seed";
import type { Calibration, Child, DemoDB, Plan, RewardState, Session } from "./schema";

/**
 * Demo data in localStorage (no personal data: child codes only, no audio).
 * Seeded once — a refresh never re-seeds. Other tabs stay in sync via the `storage` event.
 */
export const STORAGE_KEY = "nasal-trainer-demo:v1";

type Listener = () => void;
const listeners = new Set<Listener>();
let db: DemoDB | null = null;

function isDB(x: unknown): x is DemoDB {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<DemoDB>;
  return o.version === 1 && Array.isArray(o.children) && Array.isArray(o.sessions) && typeof o.activeChildId === "string";
}

/** Games added after the first release (ยิงจุดโทษ, หอคอยเมฆ, รถไฟส่งของ): switched on in a plan saved before they existed. */
const LATER_GAMES = ["kick", "tower", "train"] as const;

/**
 * Data saved by an older version keeps all its history: games added later start switched on in each child's plan
 * unless the therapist has already set them (a game the therapist switched off stays off).
 */
export function migrate(d: DemoDB): DemoDB {
  let out = d;
  const missing = (c: Child) => LATER_GAMES.some((id) => typeof (c.plan.games as Partial<Plan["games"]>)[id] !== "boolean");
  if (d.children.some(missing)) {
    out = {
      ...out,
      children: out.children.map((c) => {
        const g = c.plan.games as Partial<Plan["games"]>;
        return { ...c, plan: { ...c.plan, games: { runner: !!g.runner, balloon: !!g.balloon, frog: !!g.frog, kick: g.kick ?? true, tower: g.tower ?? true, train: g.train ?? true } } };
      }),
    };
  }
  // rounds saved before the source told device from demo: a call round on the real device says so in its summary
  if (d.sessions.some((s) => s.source === "demo" && s.call?.source === "device")) {
    out = { ...out, sessions: out.sessions.map((s) => (s.source === "demo" && s.call?.source === "device" ? { ...s, source: "device" as const } : s)) };
  }
  return out;
}

function readStorage(): DemoDB | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDB(parsed) ? migrate(parsed) : null;
  } catch {
    return null;
  }
}

let persisted = true;

function persist(next: DemoDB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    persisted = true;
  } catch {
    // Private mode / quota / blocked: keep working in memory, and say so where a save is reported.
    persisted = false;
  }
}

/** False when the last save did not reach the browser's storage: rounds then live only while this page stays open. */
export function storagePersisted(): boolean {
  return persisted;
}

function emit(): void {
  for (const l of listeners) l();
}

export function getDB(): DemoDB {
  if (!db) {
    const stored = readStorage();
    if (stored) {
      db = stored;
    } else {
      db = createSeed(new Date());
      persist(db);
    }
  }
  return db;
}

function commit(mutate: (cur: DemoDB) => DemoDB): void {
  const next = mutate(getDB());
  db = next;
  persist(next);
  emit();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    db = readStorage() ?? createSeed(new Date());
    emit();
  });
}

export function useDB(): DemoDB {
  return useSyncExternalStore(subscribe, getDB, getDB);
}

export function findChild(d: DemoDB, id: string): Child {
  return d.children.find((c) => c.id === id) ?? d.children[0];
}

export function useActiveChild(): Child {
  const d = useDB();
  return findChild(d, d.activeChildId);
}

// ---------- actions ----------

export function setActiveChild(id: string): void {
  commit((d) => (d.children.some((c) => c.id === id) ? { ...d, activeChildId: id } : d));
}

export function savePlan(childId: string, plan: Omit<Plan, "updatedAt">): Plan {
  const saved: Plan = { ...plan, updatedAt: new Date().toISOString() };
  commit((d) => ({
    ...d,
    children: d.children.map((c) => (c.id === childId ? { ...c, plan: saved } : c)),
  }));
  return saved;
}

/** Saving the same round again (same id) changes nothing — rewards are counted from sessions, so they cannot double. */
export function addSession(s: Session): void {
  commit((d) => (d.sessions.some((x) => x.id === s.id) ? d : { ...d, sessions: [...d.sessions, s] }));
}

/** Change one child's rewards (picks only; progress is computed from sessions). */
export function updateRewards(childId: string, f: (r: RewardState | undefined) => RewardState): void {
  commit((d) => (d.children.some((c) => c.id === childId) ? { ...d, rewards: { ...d.rewards, [childId]: f(d.rewards?.[childId]) } } : d));
}

export function saveCalibration(childId: string, cal: Calibration): void {
  commit((d) => ({ ...d, calibrations: { ...d.calibrations, [childId]: cal } }));
}

/** ลบเฉพาะข้อมูลตัวอย่าง (ประวัติ seed และดาวตัวอย่าง) — คงแผนและรอบที่เล่นในเดโมไว้ */
export function clearSampleData(): void {
  commit((d) => ({
    ...d,
    sessions: d.sessions.filter((s) => s.source !== "sample"),
    children: d.children.map((c) => ({ ...c, sampleStars: 0 })),
  }));
}

/** ลบรอบที่เล่นในเดโมและค่าปรับเครื่องจำลอง */
export function clearDemoPlays(): void {
  commit((d) => ({
    ...d,
    sessions: d.sessions.filter((s) => s.source !== "demo"),
    calibrations: {},
    // the demo rewards those rounds grew go with them (device practice and the picked character/clothes stay)
    rewards: d.rewards
      ? Object.fromEntries(Object.entries(d.rewards).map(([id, r]) => [id, { ...r, ledgers: { device: r.ledgers.device } }]))
      : undefined,
  }));
}

/** คืนค่าทั้งหมดเป็นข้อมูลตัวอย่างเริ่มต้น (รวมรางวัลที่เลือกไว้) */
export function resetAllDemoData(): void {
  commit(() => createSeed(new Date()));
}
