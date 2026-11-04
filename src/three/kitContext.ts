import { createContext, useContext } from "react";
import type { Kit } from "./kit";

export const KitContext = createContext<Kit | null>(null);

export function useKit(): Kit {
  const kit = useContext(KitContext);
  if (!kit) throw new Error("useKit must be used inside the 3D world canvas");
  return kit;
}
