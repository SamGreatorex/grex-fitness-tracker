import { describe, expect, it } from "vitest";
import { meetsPasswordRules, passwordErrorMessage } from "../../src/lib/password";
import { isProfileComplete, modeForPath, modesForRole } from "../../src/lib/profile";

// Test plan 2.4 / 2.16 (password rules), 2.12 (profile setup),
// 5.1 / 6.1 / 7.1 / 7.2 (modes per role).

describe("password rules", () => {
  it("needs 8+ characters with lowercase, uppercase and a number", () => {
    expect(meetsPasswordRules("Abcdefg1")).toBe(true);
    expect(meetsPasswordRules("abcdefg1")).toBe(false);
    expect(meetsPasswordRules("ABCDEFG1")).toBe(false);
    expect(meetsPasswordRules("Abcdefgh")).toBe(false);
    expect(meetsPasswordRules("Abc1")).toBe(false);
  });

  it("turns Cognito errors into friendly messages", () => {
    expect(passwordErrorMessage({ name: "NotAuthorizedException" })).toBe("Your current password is incorrect.");
    expect(passwordErrorMessage({ name: "CodeMismatchException" })).toMatch(/code isn't right/);
    expect(passwordErrorMessage({ name: "ExpiredCodeException" })).toMatch(/expired/);
    expect(passwordErrorMessage({ name: "LimitExceededException" })).toMatch(/Too many attempts/);
    expect(passwordErrorMessage({ name: "Other", message: "Boom" }, "Fallback")).toBe("Boom");
    expect(passwordErrorMessage(null, "Fallback")).toBe("Fallback");
  });
});

describe("profile setup", () => {
  const complete = { name: "Sam", address: "1 High St", heightCm: 170, weightKg: 70 };

  it("is complete once name, address, height and weight are filled", () => {
    expect(isProfileComplete(complete)).toBe(true);
  });

  it("is incomplete if any required field is missing", () => {
    expect(isProfileComplete(null)).toBe(false);
    for (const key of Object.keys(complete)) {
      expect(isProfileComplete({ ...complete, [key]: "" })).toBe(false);
      expect(isProfileComplete({ ...complete, [key]: null })).toBe(false);
    }
  });
});

describe("modes", () => {
  it("gives each role its modes", () => {
    expect(modesForRole("basic")).toEqual(["user"]);
    expect(modesForRole("pt")).toEqual(["user", "trainer"]);
    expect(modesForRole("admin")).toEqual(["user", "trainer", "admin"]);
    expect(modesForRole("unknown")).toEqual(["user"]);
  });

  it("works out the mode from the URL", () => {
    expect(modeForPath("/")).toBe("user");
    expect(modeForPath("/trainer")).toBe("trainer");
    expect(modeForPath("/trainer/clients/abc")).toBe("trainer");
    expect(modeForPath("/admin")).toBe("admin");
    expect(modeForPath("/admin/users")).toBe("admin");
    expect(modeForPath("/administrator")).toBe("user");
  });
});
