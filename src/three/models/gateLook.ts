import type { Door, DoorPlace } from "../../data/doors";
import { C } from "../palette";
import type { GateLook } from "./Gate";

/** The garden behind the classic wooden gate (the gate that follows a route round without a picked door). */
export const CLASSIC_PLACE: DoorPlace = { name: "", skyTop: "#fff6df", skyLow: "#e9f5dc", ground: "#b3de8d", light: "#fff3d6" };

export const CLASSIC_LOOK: GateLook = {
  leaf: C.wood,
  leafLight: "#cf9a68",
  leafDeep: C.woodDeep,
  soft: "#b3a5c9",
  emblem: null,
  emblemColor: C.cream,
  emblemDeep: C.gold,
  light: CLASSIC_PLACE.light,
};

/** How a picked door looks in 3D (the round's scene and the picker stills use the same mapping). */
export function lookOf(door: Door | undefined): GateLook {
  if (!door) return CLASSIC_LOOK;
  return {
    leaf: door.leaf,
    leafLight: door.leafLight,
    leafDeep: door.leafDeep,
    soft: door.soft,
    emblem: door.id,
    emblemColor: door.emblem,
    emblemDeep: door.emblemDeep,
    light: door.behind.light,
  };
}
