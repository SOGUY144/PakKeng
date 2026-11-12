import { describe, expect, it } from "vitest";
import { FEATURED_GAMES, splitFeatured } from "./featuredGames";

const ALL = ["train", "tower", "kick", "frog", "balloon", "runner", "gate"] as const;

describe("splitFeatured — three big game cards, the rest as small tiles", () => {
  it("shows the featured games first, in their own order, and the others below in the plan's order", () => {
    expect(FEATURED_GAMES).toEqual(["tower", "frog", "kick"]);
    expect(splitFeatured([...ALL])).toEqual({ top: ["tower", "frog", "kick"], more: ["train", "balloon", "runner", "gate"] });
  });

  it("fills a featured game the teacher turned off with the next open game", () => {
    expect(splitFeatured(["train", "tower", "frog", "balloon", "runner", "gate"])).toEqual({
      top: ["tower", "frog", "train"],
      more: ["balloon", "runner", "gate"],
    });
  });

  it("three or fewer open games: all big, nothing below", () => {
    expect(splitFeatured(["balloon", "gate"])).toEqual({ top: ["balloon", "gate"], more: [] });
    expect(splitFeatured(["runner", "kick", "frog"])).toEqual({ top: ["frog", "kick", "runner"], more: [] });
  });

  it("no open games: nothing anywhere", () => {
    expect(splitFeatured([])).toEqual({ top: [], more: [] });
  });
});
