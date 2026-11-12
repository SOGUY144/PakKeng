import { useEffect, useRef, useState } from "react";
import { withViewTransition } from "./transition";

export type Route = "welcome" | "home" | "calibrate" | "runner" | "gate" | "result" | "balloon" | "frog" | "kick" | "tower" | "train" | "plane" | "bakery" | "island" | "dashboard";

const ROUTES: Route[] = ["welcome", "home", "calibrate", "runner", "gate", "result", "balloon", "frog", "kick", "tower", "train", "plane", "bakery", "island", "dashboard"];

/** The plain app link (no "#/screen") opens the welcome screen; any named screen opens directly; unknown names go Home. */
export function parseRoute(hash: string): Route {
  const name = hash.replace(/^#\/?/, "").split(/[?/]/)[0];
  if (name === "") return "welcome";
  return (ROUTES as string[]).includes(name) ? (name as Route) : "home";
}

/** The current screen. Changing screens cross-fades (see lib/transition); only App should call this. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const current = useRef(route);
  useEffect(() => {
    const onHash = () => {
      const next = parseRoute(window.location.hash);
      if (next === current.current) return;
      current.current = next;
      withViewTransition(() => setRoute(next));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function navigate(route: Route): void {
  const target = `#/${route}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function hrefFor(route: Route): string {
  return `#/${route}`;
}
