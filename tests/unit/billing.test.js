import { describe, expect, it } from "vitest";
import { PLAN_KEYS, accessFor, formatPrice, isOwnBuild, isStaff } from "../../src/lib/billing";

// Test plan section 3 (what each plan allows) and 3.18 (staff don't pay).

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const future = new Date(NOW + 10 * DAY).toISOString();
const past = new Date(NOW - DAY).toISOString();

const active = (plan, extra = {}) => ({
  role: "basic",
  subscription: { plan, status: "active", currentPeriodStart: past, currentPeriodEnd: future },
  ...extra,
});

describe("accessFor", () => {
  it("gives trainers and admins full access without a plan", () => {
    for (const role of ["pt", "admin"]) {
      const access = accessFor({ role }, NOW);
      expect(access).toMatchObject({ staff: true, hasAccess: true, needsPlan: false, programmeLimit: null, canUseTrainer: true });
    }
  });

  it("asks a user with no subscription to choose a plan", () => {
    expect(accessFor({ role: "basic" }, NOW)).toMatchObject({ hasAccess: false, needsPlan: true, programmeLimit: 0 });
  });

  it("allows 5 programmes and no trainer on the free trial", () => {
    const user = {
      role: "basic",
      subscription: { plan: PLAN_KEYS.TRIAL, status: "trialing", trialEndsAt: new Date(NOW + 3.5 * DAY).toISOString() },
    };
    expect(accessFor(user, NOW)).toMatchObject({
      hasAccess: true,
      plan: "trial",
      programmeLimit: 5,
      canUseTrainer: false,
      canBuyPack: false,
      trialDaysLeft: 4,
    });
  });

  it("adds bought programme packs to the Basic limit", () => {
    expect(accessFor(active("basic", { extraProgrammeSlots: 5 }), NOW)).toMatchObject({
      hasAccess: true,
      programmeLimit: 10,
      canUseTrainer: false,
      canBuyPack: true,
    });
  });

  it("gives Pro unlimited programmes and a trainer", () => {
    expect(accessFor(active("pro", { extraProgrammeSlots: 5 }), NOW)).toMatchObject({
      hasAccess: true,
      programmeLimit: null,
      canUseTrainer: true,
      canBuyPack: false,
    });
  });

  it("blocks access once the paid month has run out", () => {
    const user = active("basic");
    user.subscription.currentPeriodEnd = past;
    expect(accessFor(user, NOW).hasAccess).toBe(false);
  });

  it("blocks access when a renewal failed or the plan expired", () => {
    for (const status of ["past_due", "expired"]) {
      const user = active("pro");
      user.subscription.status = status;
      expect(accessFor(user, NOW)).toMatchObject({ hasAccess: false, canUseTrainer: false });
    }
  });
});

describe("isStaff", () => {
  it("is true only for PTs and admins", () => {
    expect(isStaff({ role: "pt" })).toBe(true);
    expect(isStaff({ role: "admin" })).toBe(true);
    expect(isStaff({ role: "basic" })).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("isOwnBuild", () => {
  it("counts only programmes the user built for themselves", () => {
    expect(isOwnBuild({ ownerUserId: "u1", createdBy: "u1" }, "u1")).toBe(true);
    expect(isOwnBuild({ ownerUserId: "u1", createdBy: "pt1" }, "u1")).toBe(false);
    expect(isOwnBuild({ ownerUserId: "u1", createdBy: "u1", isTemplate: true }, "u1")).toBe(false);
  });
});

describe("formatPrice", () => {
  it("formats pence as pounds", () => {
    expect(formatPrice(299)).toBe("£2.99");
    expect(formatPrice(2000)).toBe("£20.00");
  });
});
