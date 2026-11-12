/**
 * Home's game choice: three big cards for the featured games, the rest of the open games as small tiles under them
 * (seven big cards filled the screen). A featured game the teacher turned off is replaced by the next open game,
 * so there are always up to three big cards; the order of the rest follows the plan's order.
 */
export const FEATURED_GAMES = ["tower", "plane", "bakery"] as const;

const MAX_TOP = 3;

export function splitFeatured<T extends string>(open: readonly T[], featured: readonly string[] = FEATURED_GAMES): { top: T[]; more: T[] } {
  const top = featured.filter((f): f is T => open.includes(f as T)).slice(0, MAX_TOP);
  for (const g of open) {
    if (top.length >= MAX_TOP) break;
    if (!top.includes(g)) top.push(g);
  }
  return { top, more: open.filter((g) => !top.includes(g)) };
}
