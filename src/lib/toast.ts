/** Tiny toast store (kept apart from the component so Fast Refresh keeps one instance). */
export interface ToastItem {
  id: number;
  text: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string, ms = 3600): void {
  const id = nextId++;
  items = [...items, { id, text }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export function subscribeToasts(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getToasts(): ToastItem[] {
  return items;
}
