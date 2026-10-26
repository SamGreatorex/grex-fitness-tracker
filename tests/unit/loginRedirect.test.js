import { describe, expect, it } from "vitest";
import { loginHref, safeRedirect } from "../../src/lib/loginRedirect";

// Test plan 2.17 — signed-out users come back to the page they asked for.

describe("loginHref", () => {
  it("comes back to the page you were on", () => {
    expect(loginHref("/reports")).toBe("/login?redirect=%2Freports");
    expect(loginHref("/reports/weight?range=year")).toBe("/login?redirect=%2Freports%2Fweight%3Frange%3Dyear");
  });

  it("needs no redirect for home or the sign-in page itself", () => {
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("/login")).toBe("/login");
    expect(loginHref("/login?redirect=%2Freports")).toBe("/login");
  });
});

describe("safeRedirect", () => {
  it("follows paths on this site", () => {
    expect(safeRedirect("/reports")).toBe("/reports");
    expect(safeRedirect("/programs/abc?week=2")).toBe("/programs/abc?week=2");
  });

  it("ignores anything that could leave the site", () => {
    for (const value of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined]) {
      expect(safeRedirect(value)).toBe("/");
    }
  });
});
