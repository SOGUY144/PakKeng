import { flushSync } from "react-dom";

type DocWithTransitions = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Runs a React state update as a soft cross-fade between the old and the new screen (View Transitions API).
 * Browsers without it, and hidden tabs, simply switch. The fade is styled in base.css (shorter, no movement,
 * when motion is reduced). Use it for whole-screen changes only; small in-place updates should not wait on it.
 */
export function withViewTransition(update: () => void): void {
  const doc = typeof document === "undefined" ? null : (document as DocWithTransitions);
  if (!doc || typeof doc.startViewTransition !== "function" || doc.visibilityState !== "visible") {
    update();
    return;
  }
  try {
    doc.startViewTransition(() => flushSync(update));
  } catch {
    update();
  }
}
