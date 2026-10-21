"use client";

import { useState } from "react";
import styles from "./CardForm.module.css";

// SIMULATED card entry — a stand-in for Stripe Elements until Stripe is
// wired up. Like Stripe, it never hands the card number to our server: it
// checks the details here and passes up only a "payment method" { id,
// brand, last4, expMonth, expYear } (+ simulateDecline for the decline
// test card). The number and CVC are dropped as soon as it's submitted.
export const TEST_CARDS = [
  { number: "4242 4242 4242 4242", label: "Succeeds" },
  { number: "4000 0000 0000 0002", label: "Declined" },
];
const DECLINE_NUMBER = "4000000000000002";

const digitsOf = (s) => s.replace(/\D/g, "");

function brandOf(digits) {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(011|5)/.test(digits)) return "discover";
  return "card";
}

// The standard card-number checksum.
function luhnOk(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length >= 13 && digits.length <= 19 && sum % 10 === 0;
}

// "1234567812345678" → "1234 5678 1234 5678" as it's typed.
const groupDigits = (s) => digitsOf(s).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

function formatExpiry(s) {
  const d = digitsOf(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
}

function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export const BRAND_LABELS = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover", card: "Card" };

// onSubmit(paymentMethod) — may throw/return a promise; `busy` disables it.
export default function CardForm({ submitLabel, busyLabel = "Processing…", busy = false, onSubmit, footnote }) {
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const digits = digitsOf(number);
    if (!luhnOk(digits)) return setError("That card number isn't valid.");
    const [mm, yy] = [Number(digitsOf(expiry).slice(0, 2)), Number(digitsOf(expiry).slice(2, 4))];
    const now = new Date();
    const year = 2000 + yy;
    if (!(mm >= 1 && mm <= 12) || digitsOf(expiry).length !== 4) return setError("Enter the expiry date as MM / YY.");
    if (year < now.getFullYear() || (year === now.getFullYear() && mm < now.getMonth() + 1)) return setError("That card has expired.");
    const brand = brandOf(digits);
    if (!new RegExp(brand === "amex" ? "^\\d{4}$" : "^\\d{3}$").test(cvc)) {
      return setError(`Enter the ${brand === "amex" ? "4" : "3"}-digit security code.`);
    }
    if (!name.trim()) return setError("Enter the name on the card.");

    const paymentMethod = {
      id: `pm_sim_${randomId()}`,
      brand,
      last4: digits.slice(-4),
      expMonth: mm,
      expYear: year,
      ...(digits === DECLINE_NUMBER && { simulateDecline: true }),
    };
    // Don't keep the number or CVC around once handed over.
    setNumber("");
    setCvc("");
    await onSubmit(paymentMethod);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.testBanner}>
        <strong>Test mode — no real payment is taken.</strong> Don&apos;t enter a real card. Use a test card:
        <span className={styles.testCards}>
          {TEST_CARDS.map((t) => (
            <button
              key={t.number}
              type="button"
              className={styles.testCard}
              onClick={() => {
                setNumber(t.number);
                setExpiry("12 / 30");
                setCvc("123");
                if (!name) setName("Test User");
              }}
            >
              {t.number} · {t.label}
            </button>
          ))}
        </span>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Name on card</span>
        <input className={styles.input} autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Card number</span>
        <span className={styles.numberWrap}>
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 1234 1234 1234"
            value={number}
            onChange={(e) => setNumber(groupDigits(e.target.value))}
            disabled={busy}
          />
          {digitsOf(number).length >= 2 && <span className={styles.brand}>{BRAND_LABELS[brandOf(digitsOf(number))]}</span>}
        </span>
      </label>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>Expiry</span>
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM / YY"
            value={expiry}
            onChange={(e) => setExpiry(formatExpiry(e.target.value))}
            disabled={busy}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Security code</span>
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVC"
            maxLength={4}
            value={cvc}
            onChange={(e) => setCvc(digitsOf(e.target.value))}
            disabled={busy}
          />
        </label>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? busyLabel : submitLabel}
      </button>
      {footnote && <p className={styles.footnote}>{footnote}</p>}
    </form>
  );
}
