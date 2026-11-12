/** Sizes shared by the bakery models and its scene (kept out of the component file). */

/** Height of the counter top (characters stand behind it, the cake sits on it). */
export const COUNTER_TOP = 0.56;
/** Height of the cake's iced top above its plate (toppings stand here). */
export const CAKE_TOP = 0.53;

/** The same order as `TOPPINGS` in src/logic/bakery.ts (the scene maps by index). */
export const TOPPING_KINDS = ["strawberry", "cherry", "sprinkles", "cream", "candy"] as const;
export type ToppingKind = (typeof TOPPING_KINDS)[number];
