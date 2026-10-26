import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUsersTable } from "./fakeUsersTable";

vi.mock("../../src/lib/dynamo", async () => (await import("./fakeUsersTable")).mockDynamo());

import { ddb } from "../../src/lib/dynamo";
import { TRIAL_DAYS } from "../../src/lib/billing";
import {
  addMonths,
  applyBillingAction,
  programmeAllowance,
  refreshSubscription,
  requireAccess,
} from "../../src/lib/subscriptions";

// Test plan section 3: trial, subscribe, decline, upgrade, downgrade,
// cancel/resume, programme packs, renewals, failed renewals, trainer release.

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const card = { id: "pm_sim_abcdef12", brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 };
const declineCard = { id: "pm_sim_decline1", brand: "visa", last4: "0002", expMonth: 12, expYear: 2099, simulateDecline: true };

const newUser = () => ({ userId: "u1", role: "basic" });

const paidUser = (plan, subExtra = {}, userExtra = {}) => ({
  userId: "u1",
  role: "basic",
  subscription: {
    plan,
    status: "active",
    startedAt: "2026-05-01T00:00:00.000Z",
    currentPeriodStart: "2026-06-01T00:00:00.000Z",
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    paymentMethod: card,
    ...subExtra,
  },
  ...userExtra,
});

beforeEach(() => {
  // accessFor() defaults to the real clock in places, so pin it.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("addMonths", () => {
  it("keeps the day of the month, clamped to the month's last day", () => {
    expect(addMonths("2026-03-15T00:00:00.000Z", 1)).toBe("2026-04-15T00:00:00.000Z");
    expect(addMonths("2026-01-31T00:00:00.000Z", 1)).toBe("2026-02-28T00:00:00.000Z");
    expect(addMonths("2028-01-31T00:00:00.000Z", 1)).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonths("2026-12-10T00:00:00.000Z", 1)).toBe("2027-01-10T00:00:00.000Z");
  });
});

describe("free trial (3.2, 3.6)", () => {
  it("starts a trial with no card", async () => {
    const table = useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "start_trial", {}, NOW);

    expect(result.message).toBe(`Your ${TRIAL_DAYS}-day free trial has started.`);
    expect(table.row.subscription).toMatchObject({ plan: "trial", status: "trialing" });
    expect(table.row.subscription.trialEndsAt).toBe(new Date(NOW + TRIAL_DAYS * DAY).toISOString());
    expect(table.row.trialUsedAt).toBe(NOW_ISO);
    expect(table.row.payments).toBeUndefined();
  });

  it("can only be taken once", async () => {
    const user = {
      ...newUser(),
      trialUsedAt: "2026-01-01T00:00:00.000Z",
      subscription: { plan: "trial", status: "expired", trialEndsAt: "2026-01-13T00:00:00.000Z" },
    };
    useUsersTable(ddb, user);
    const result = await applyBillingAction(user, "start_trial", {}, NOW);
    expect(result).toEqual({ status: 409, error: "You've already had your free trial — choose a monthly plan to continue." });
  });

  it("isn't offered to someone already on a plan", async () => {
    useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "start_trial", {}, NOW);
    expect(result).toEqual({ status: 409, error: "You already have a plan." });
  });
});

describe("subscribing (3.3, 3.4)", () => {
  it("charges the first month and starts the plan", async () => {
    const table = useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "subscribe", { plan: "basic", paymentMethod: card }, NOW);

    expect(result.message).toBe("You're on Basic — £2.99 a month.");
    expect(table.row.subscription).toMatchObject({
      plan: "basic",
      status: "active",
      currentPeriodStart: NOW_ISO,
      currentPeriodEnd: "2026-07-15T12:00:00.000Z",
      cancelAtPeriodEnd: false,
    });
    expect(table.row.payments).toHaveLength(1);
    expect(table.row.payments[0]).toMatchObject({ status: "succeeded", amountPence: 299 });
  });

  it("needs a card", async () => {
    useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "subscribe", { plan: "basic" }, NOW);
    expect(result).toEqual({ status: 400, error: "Add a card to subscribe." });
  });

  it("refuses an unknown plan", async () => {
    useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "subscribe", { plan: "gold", paymentMethod: card }, NOW);
    expect(result.status).toBe(400);
  });

  it("records a declined card without starting a plan", async () => {
    const table = useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "subscribe", { plan: "pro", paymentMethod: declineCard }, NOW);

    expect(result).toEqual({ status: 402, error: "Your card was declined." });
    expect(table.row.subscription).toBeUndefined();
    expect(table.row.payments).toHaveLength(1);
    expect(table.row.payments[0].status).toBe("failed");
  });

  it("refuses the plan they're already on", async () => {
    useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "subscribe", { plan: "basic" }, NOW);
    expect(result).toEqual({ status: 409, error: "You're already on Basic." });
  });
});

describe("changing plan (3.9, 3.10)", () => {
  it("upgrades Basic → Pro straight away with a new month", async () => {
    const table = useUsersTable(ddb, paidUser("basic"));
    await applyBillingAction(paidUser("basic"), "subscribe", { plan: "pro" }, NOW);

    expect(table.row.subscription).toMatchObject({ plan: "pro", status: "active", currentPeriodStart: NOW_ISO });
    expect(table.row.payments.at(-1)).toMatchObject({ status: "succeeded", amountPence: 1099 });
  });

  it("downgrades Pro → Basic at the end of the paid month, without charging", async () => {
    const table = useUsersTable(ddb, paidUser("pro"));
    const result = await applyBillingAction(paidUser("pro"), "subscribe", { plan: "basic" }, NOW);

    expect(result.message).toMatch(/^You'll move to Basic on/);
    expect(table.row.subscription).toMatchObject({ plan: "pro", pendingPlan: "basic" });
    expect(table.row.payments).toBeUndefined();
  });
});

describe("cancel and resume (3.11)", () => {
  it("cancels at the end of the paid month", async () => {
    const table = useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "cancel", {}, NOW);

    expect(result.message).toMatch(/^Cancelled — you keep access until/);
    expect(table.row.subscription.cancelAtPeriodEnd).toBe(true);
    expect(table.row.subscription.status).toBe("active");
  });

  it("can't cancel with no paid plan", async () => {
    useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "cancel", {}, NOW);
    expect(result).toEqual({ status: 400, error: "There's no paid plan to cancel." });
  });

  it("resume undoes a cancellation and a scheduled downgrade", async () => {
    const user = paidUser("pro", { cancelAtPeriodEnd: true, pendingPlan: "basic" });
    const table = useUsersTable(ddb, user);
    await applyBillingAction(user, "resume", {}, NOW);

    expect(table.row.subscription.cancelAtPeriodEnd).toBe(false);
    expect(table.row.subscription.pendingPlan).toBeUndefined();
  });

  it("choosing the same plan again also undoes a cancellation", async () => {
    const user = paidUser("basic", { cancelAtPeriodEnd: true });
    const table = useUsersTable(ddb, user);
    const result = await applyBillingAction(user, "subscribe", { plan: "basic" }, NOW);

    expect(result.message).toBe("You're staying on Basic.");
    expect(table.row.subscription.cancelAtPeriodEnd).toBe(false);
  });
});

describe("programme packs (3.7, 3.8)", () => {
  it("adds 5 programmes for £20 on Basic", async () => {
    const table = useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "buy_pack", {}, NOW);

    expect(result.message).toBe("5 more programmes added.");
    expect(table.row.extraProgrammeSlots).toBe(5);
    expect(table.row.payments.at(-1)).toMatchObject({ status: "succeeded", amountPence: 2000 });
  });

  it("isn't offered on Pro", async () => {
    useUsersTable(ddb, paidUser("pro"));
    const result = await applyBillingAction(paidUser("pro"), "buy_pack", {}, NOW);
    expect(result).toEqual({ status: 400, error: "Extra programmes are available on the Basic plan." });
  });

  it("counts only programmes the user built themselves against the limit", () => {
    const user = paidUser("basic", {}, { extraProgrammeSlots: 5 });
    const programs = [
      { ownerUserId: "u1", createdBy: "u1" },
      { ownerUserId: "u1", createdBy: "u1" },
      { ownerUserId: "u1", createdBy: "pt1" },
    ];
    expect(programmeAllowance(user, programs)).toEqual({ limit: 10, used: 2 });
    expect(programmeAllowance(paidUser("pro"), programs).limit).toBeNull();
  });
});

describe("cards (3.15, 3.16)", () => {
  it("updates the card without charging", async () => {
    const newCard = { ...card, id: "pm_sim_newcard99", last4: "1111" };
    const table = useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "update_card", { paymentMethod: newCard }, NOW);

    expect(result.message).toBe("Card updated.");
    expect(table.row.subscription.paymentMethod.last4).toBe("1111");
    expect(table.row.payments).toBeUndefined();
  });

  it("retries a failed renewal on the new card", async () => {
    const user = paidUser("basic", { status: "past_due", paymentMethod: declineCard, currentPeriodEnd: "2026-06-01T00:00:00.000Z" });
    const table = useUsersTable(ddb, user);
    const result = await applyBillingAction(user, "update_card", { paymentMethod: card }, NOW);

    expect(result.message).toBe("Card updated and your plan is active again.");
    expect(table.row.subscription).toMatchObject({
      plan: "basic",
      status: "active",
      startedAt: "2026-05-01T00:00:00.000Z",
      currentPeriodEnd: "2026-07-15T12:00:00.000Z",
    });
    expect(table.row.subscription.paymentMethod.last4).toBe("4242");
  });

  it("rejects an invalid card", async () => {
    useUsersTable(ddb, paidUser("basic"));
    const result = await applyBillingAction(paidUser("basic"), "update_card", { paymentMethod: { id: "bad" } }, NOW);
    expect(result).toEqual({ status: 400, error: "Enter a valid card." });
  });
});

describe("staff and bad actions (3.18)", () => {
  it("trainers and admins don't need a plan", async () => {
    for (const role of ["pt", "admin"]) {
      const result = await applyBillingAction({ userId: "s1", role }, "start_trial", {}, NOW);
      expect(result).toEqual({ status: 400, error: "Trainer and admin accounts don't need a plan." });
    }
  });

  it("rejects unknown actions", async () => {
    useUsersTable(ddb, newUser());
    const result = await applyBillingAction(newUser(), "refund", {}, NOW);
    expect(result).toEqual({ status: 400, error: "Unknown action." });
  });
});

describe("requireAccess (7.5)", () => {
  it("lets active users and staff through", () => {
    expect(requireAccess(paidUser("basic"))).toBeNull();
    expect(requireAccess({ role: "pt" })).toBeNull();
  });

  it("returns 402 when there's no active plan", () => {
    expect(requireAccess(newUser()).status).toBe(402);
  });
});

describe("refreshSubscription (3.10, 3.12–3.14, 3.17)", () => {
  const due = (plan, subExtra = {}, userExtra = {}) =>
    paidUser(plan, { currentPeriodStart: "2026-05-01T00:00:00.000Z", currentPeriodEnd: "2026-06-01T00:00:00.000Z", ...subExtra }, userExtra);

  it("leaves an up-to-date plan alone", async () => {
    const user = paidUser("basic");
    useUsersTable(ddb, user);
    expect(await refreshSubscription(user, NOW)).toBe(user);
    expect(ddb.send).not.toHaveBeenCalled();
  });

  it("leaves staff alone", async () => {
    const user = { userId: "s1", role: "pt", subscription: due("basic").subscription };
    useUsersTable(ddb, user);
    expect(await refreshSubscription(user, NOW)).toBe(user);
    expect(ddb.send).not.toHaveBeenCalled();
  });

  it("ends a finished trial", async () => {
    const user = { ...newUser(), subscription: { plan: "trial", status: "trialing", trialEndsAt: "2026-06-10T00:00:00.000Z" } };
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);
    expect(saved.subscription).toMatchObject({ status: "expired", endedAt: "2026-06-10T00:00:00.000Z" });
  });

  it("renews a paid month by charging the saved card", async () => {
    useUsersTable(ddb, due("basic"));
    const saved = await refreshSubscription(due("basic"), NOW);

    expect(saved.subscription).toMatchObject({
      status: "active",
      currentPeriodStart: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    });
    expect(saved.payments).toHaveLength(1);
    expect(saved.payments[0]).toMatchObject({ amountPence: 299, description: "Basic plan — monthly renewal", status: "succeeded" });
  });

  it("catches up on several missed months", async () => {
    const user = due("basic", { currentPeriodStart: "2026-03-01T00:00:00.000Z", currentPeriodEnd: "2026-04-01T00:00:00.000Z" });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);

    expect(saved.payments).toHaveLength(3);
    expect(saved.subscription.currentPeriodEnd).toBe("2026-07-01T00:00:00.000Z");
  });

  it("ends a cancelled plan instead of renewing", async () => {
    const user = due("basic", { cancelAtPeriodEnd: true });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);

    expect(saved.subscription).toMatchObject({ status: "expired", endedAt: "2026-06-01T00:00:00.000Z", cancelAtPeriodEnd: false });
    expect(saved.payments).toBeUndefined();
  });

  it("switches to a scheduled downgrade at renewal", async () => {
    const user = due("pro", { pendingPlan: "basic" });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);

    expect(saved.subscription.plan).toBe("basic");
    expect(saved.subscription.pendingPlan).toBeUndefined();
    expect(saved.payments[0].amountPence).toBe(299);
  });

  it("marks the plan past due when the renewal is declined", async () => {
    const user = due("basic", { paymentMethod: declineCard });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);

    expect(saved.subscription).toMatchObject({ status: "past_due", failedAt: NOW_ISO });
    expect(saved.payments[0].status).toBe("failed");
  });

  it("removes the trainer when a Pro client loses Pro", async () => {
    const user = due("pro", { cancelAtPeriodEnd: true }, { ptUserId: "pt1", ptAssignedAt: "2026-05-02T00:00:00.000Z" });
    const table = useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);

    expect(table.updates[0].UpdateExpression).toContain("REMOVE ptUserId, ptAssignedAt");
    expect(saved.ptUserId).toBeUndefined();
  });

  it("removes the trainer when a Pro client downgrades to Basic", async () => {
    const user = due("pro", { pendingPlan: "basic" }, { ptUserId: "pt1" });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);
    expect(saved.ptUserId).toBeUndefined();
  });

  it("keeps the trainer when Pro renews", async () => {
    const user = due("pro", {}, { ptUserId: "pt1" });
    useUsersTable(ddb, user);
    const saved = await refreshSubscription(user, NOW);
    expect(saved.ptUserId).toBe("pt1");
  });
});
