import { useSyncExternalStore } from "react";
import { createSeed } from "./seed";
import type { Calibration, Child, DemoDB, Plan, Session } from "./schema";

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

function readStorage(): DemoDB | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDB(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(next: DemoDB): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota: keep working in memory.
  }
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

export function addSession(s: Session): void {
  commit((d) => ({ ...d, sessions: [...d.sessions, s] }));
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
  commit((d) => ({ ...d, sessions: d.sessions.filter((s) => s.source !== "demo"), calibrations: {} }));
}

/** คืนค่าทั้งหมดเป็นข้อมูลตัวอย่างเริ่มต้น */
export function resetAllDemoData(): void {
  commit(() => createSeed(new Date()));
}
