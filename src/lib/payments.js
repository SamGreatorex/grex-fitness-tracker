import { randomUUID } from "crypto";

// SIMULATED payments. Everything that takes money goes through chargeCard,
// so swapping in Stripe later means replacing just this file (create a
// PaymentIntent for the customer's saved payment method; Stripe webhooks
// would then confirm renewals instead of the lazy roll-forward in
// subscriptions.js).
//
// A "payment method" is what the browser hands over after the card form —
// never the card number itself, only { id, brand, last4, expMonth,
// expYear } (as Stripe's would be), plus `simulateDecline` for testing
// failures: the card form sets it for the test number 4000 0000 0000 0002.

const BRANDS = ["visa", "mastercard", "amex", "discover", "card"];

// Validates the shape of a payment method from the client. Returns the
// cleaned method, or null if it isn't one.
export function cleanPaymentMethod(pm) {
  if (!pm || typeof pm !== "object") return null;
  const id = String(pm.id ?? "");
  const last4 = String(pm.last4 ?? "");
  const expMonth = Number(pm.expMonth);
  const expYear = Number(pm.expYear);
  if (!/^pm_sim_[A-Za-z0-9]{6,40}$/.test(id) || !/^\d{4}$/.test(last4)) return null;
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || expYear < 2000) return null;
  return {
    id,
    brand: BRANDS.includes(pm.brand) ? pm.brand : "card",
    last4,
    expMonth,
    expYear,
    ...(pm.simulateDecline === true && { simulateDecline: true }),
  };
}

function isExpired(pm, now) {
  const d = new Date(now);
  return pm.expYear < d.getUTCFullYear() || (pm.expYear === d.getUTCFullYear() && pm.expMonth < d.getUTCMonth() + 1);
}

// Takes a (simulated) payment. Returns a payment record — { id, at,
// amountPence, description, status: "succeeded" | "failed", failureMessage?,
// card } — for the user's history; the caller stores it.
export function chargeCard({ paymentMethod, amountPence, description, now = Date.now() }) {
  const base = {
    id: `pay_sim_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    at: new Date(now).toISOString(),
    amountPence,
    description,
    card: paymentMethod ? `${paymentMethod.brand} •••• ${paymentMethod.last4}` : null,
  };
  if (!paymentMethod) return { ...base, status: "failed", failureMessage: "No card on file." };
  if (isExpired(paymentMethod, now)) return { ...base, status: "failed", failureMessage: "Your card has expired." };
  if (paymentMethod.simulateDecline) return { ...base, status: "failed", failureMessage: "Your card was declined." };
  return { ...base, status: "succeeded" };
}
