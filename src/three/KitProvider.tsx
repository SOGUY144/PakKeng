import { useEffect, useMemo, type ReactNode } from "react";
import type { Tier } from "./gfx";
import { Kit } from "./kit";
import { KitContext } from "./kitContext";

/** One Kit per canvas; everything it created is disposed when the canvas content unmounts. */
export function KitProvider({ tier, children }: { tier: Tier; children: ReactNode }) {
  const kit = useMemo(() => new Kit(tier), [tier]);
  useEffect(() => () => kit.dispose(), [kit]);
  return <KitContext.Provider value={kit}>{children}</KitContext.Provider>;
}
