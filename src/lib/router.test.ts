import { describe, expect, it } from "vitest";
import { parseRoute, reportHref, reportTarget } from "./router";

describe("parseRoute", () => {
  it("opens the welcome screen when the app is opened from its plain link (no #/route)", () => {
    expect(parseRoute("")).toBe("welcome");
    expect(parseRoute("#")).toBe("welcome");
    expect(parseRoute("#/")).toBe("welcome");
  });

  it("goes straight to a named screen (in-app links and shared links skip the welcome)", () => {
    expect(parseRoute("#/home")).toBe("home");
    expect(parseRoute("#/frog")).toBe("frog");
    expect(parseRoute("#/dashboard")).toBe("dashboard");
    expect(parseRoute("#/welcome")).toBe("welcome");
  });

  it("ignores extra path/query parts after the screen name", () => {
    expect(parseRoute("#/result?x=1")).toBe("result");
    expect(parseRoute("#/gate/extra")).toBe("gate");
  });

  it("falls back to Home for an unknown screen name, as before", () => {
    expect(parseRoute("#/nope")).toBe("home");
  });
});

describe("report links — one round's report page", () => {
  it("round-trips any saved round id (also ids with ':' and '.') and the print flag", () => {
    const id = "tower-2026-11-11T05:00:00.000Z";
    expect(reportTarget(reportHref(id, true))).toEqual({ id, print: true });
    expect(reportTarget(reportHref(id))).toEqual({ id, print: false });
    expect(parseRoute(reportHref(id, true))).toBe("report");
  });

  it("anything else is not a report", () => {
    expect(reportTarget("#/dashboard")).toEqual({ id: null, print: false });
    expect(reportTarget("#/report/")).toEqual({ id: null, print: false });
    expect(reportTarget("#/report/%E0%A4")).toEqual({ id: null, print: false });
  });
});
