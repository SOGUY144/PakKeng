import { useSyncExternalStore } from "react";

export type Route = "welcome" | "home" | "calibrate" | "runner" | "gate" | "result" | "balloon" | "frog" | "dashboard";

const ROUTES: Route[] = ["welcome", "home", "calibrate", "runner", "gate", "result", "balloon", "frog", "dashboard"];

/** The plain app link (no "#/screen") opens the welcome screen; any named screen opens directly; unknown names go Home. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  if (name === "") return "welcome";
  return (ROUTES as string[]).includes(name) ? (name as Route) : "home";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function useRoute(): Route {
  return useSyncExternalStore(
    subscribe,
    () => parseRoute(window.location.hash),
    () => "home",
  );
}

export function navigate(route: Route): void {
  const target = `#/${route}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function hrefFor(route: Route): string {
  return `#/${route}`;
}
