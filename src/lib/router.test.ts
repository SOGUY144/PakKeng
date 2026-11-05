import { describe, expect, it } from "vitest";
import { parseRoute } from "./router";

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
