import { describe, expect, it } from "vitest";
import { FEATURED_GAMES, splitFeatured } from "./featuredGames";

const ALL = ["plane", "bakery", "train", "tower", "kick", "frog", "balloon", "runner", "gate"] as const;

describe("splitFeatured — three big game cards, the rest as small tiles", () => {
  it("shows the featured games first, in their own order, and the others below in the plan's order", () => {
    expect(FEATURED_GAMES).toEqual(["tower", "plane", "bakery"]);
    expect(splitFeatured([...ALL])).toEqual({ top: ["tower", "plane", "bakery"], more: ["train", "kick", "frog", "balloon", "runner", "gate"] });
  });

  it("fills a featured game the teacher turned off with the next open game", () => {
    expect(splitFeatured(["train", "tower", "plane", "frog", "balloon", "runner", "gate"])).toEqual({
      top: ["tower", "plane", "train"],
      more: ["frog", "balloon", "runner", "gate"],
    });
  });

  it("three or fewer open games: all big, nothing below", () => {
    expect(splitFeatured(["balloon", "gate"])).toEqual({ top: ["balloon", "gate"], more: [] });
    expect(splitFeatured(["runner", "bakery", "frog"])).toEqual({ top: ["bakery", "runner", "frog"], more: [] });
  });

  it("no open games: nothing anywhere", () => {
    expect(splitFeatured([])).toEqual({ top: [], more: [] });
  });
});
