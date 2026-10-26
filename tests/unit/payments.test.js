import { describe, expect, it } from "vitest";
import { chargeCard, cleanPaymentMethod } from "../../src/lib/payments";

// Test plan 3.4 (declined card) and 3.5 (expired or invalid card).

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const card = { id: "pm_sim_abcdef12", brand: "visa", last4: "4242", expMonth: 12, expYear: 2099 };

describe("cleanPaymentMethod", () => {
  it("accepts a valid card", () => {
    expect(cleanPaymentMethod(card)).toEqual(card);
  });

  it("falls back to a generic brand", () => {
    expect(cleanPaymentMethod({ ...card, brand: "unknown" }).brand).toBe("card");
  });

  it("rejects malformed cards", () => {
    expect(cleanPaymentMethod(null)).toBeNull();
    expect(cleanPaymentMethod({ ...card, id: "pm_real_123456" })).toBeNull();
    expect(cleanPaymentMethod({ ...card, last4: "42" })).toBeNull();
    expect(cleanPaymentMethod({ ...card, expMonth: 13 })).toBeNull();
    expect(cleanPaymentMethod({ ...card, expYear: 1999 })).toBeNull();
  });

  it("keeps the test decline flag only when it's exactly true", () => {
    expect(cleanPaymentMethod({ ...card, simulateDecline: true }).simulateDecline).toBe(true);
    expect(cleanPaymentMethod({ ...card, simulateDecline: "yes" })).not.toHaveProperty("simulateDecline");
  });
});

describe("chargeCard", () => {
  const charge = (paymentMethod) => chargeCard({ paymentMethod, amountPence: 299, description: "Basic", now: NOW });

  it("succeeds with a valid card", () => {
    const payment = charge(card);
    expect(payment).toMatchObject({ status: "succeeded", amountPence: 299, card: "visa •••• 4242" });
    expect(payment.id).toMatch(/^pay_sim_/);
  });

  it("fails with no card", () => {
    expect(charge(null)).toMatchObject({ status: "failed", failureMessage: "No card on file." });
  });

  it("fails with an expired card", () => {
    expect(charge({ ...card, expYear: 2025 })).toMatchObject({ status: "failed", failureMessage: "Your card has expired." });
    expect(charge({ ...card, expYear: 2026, expMonth: 5 })).toMatchObject({ status: "failed" });
    expect(charge({ ...card, expYear: 2026, expMonth: 6 })).toMatchObject({ status: "succeeded" });
  });

  it("fails with the test decline card", () => {
    expect(charge({ ...card, simulateDecline: true })).toMatchObject({ status: "failed", failureMessage: "Your card was declined." });
  });
});
