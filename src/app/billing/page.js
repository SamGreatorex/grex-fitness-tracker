"use client";

import { loginHref } from "../../lib/loginRedirect";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import AppHeader from "../../components/AppHeader";
import CardForm, { BRAND_LABELS } from "../../components/CardForm";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useBilling } from "../../lib/useBilling";
import { PLANS, PLAN_KEYS, SUBSCRIPTION_STATUS, formatPrice } from "../../lib/billing";
import styles from "./billing.module.css";

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// One line on where their plan stands.
function statusLine(sub, access) {
  if (!sub) return { text: "No plan yet.", tone: "warn" };
  const plan = PLANS[sub.plan];
  switch (sub.status) {
    case SUBSCRIPTION_STATUS.TRIALING:
      return access.hasAccess
        ? { text: `${access.trialDaysLeft} day${access.trialDaysLeft === 1 ? "" : "s"} left — ends ${fmtDate(sub.trialEndsAt)}.`, tone: "ok" }
        : { text: `Ended ${fmtDate(sub.trialEndsAt)}.`, tone: "warn" };
    case SUBSCRIPTION_STATUS.ACTIVE:
      if (!access.hasAccess) return { text: "Renewal due — reload to update.", tone: "warn" };
      if (sub.cancelAtPeriodEnd) return { text: `Cancelled — you have access until ${fmtDate(sub.currentPeriodEnd)}.`, tone: "warn" };
      if (sub.pendingPlan) {
        return { text: `Moves to ${PLANS[sub.pendingPlan].name} on ${fmtDate(sub.currentPeriodEnd)} (${formatPrice(PLANS[sub.pendingPlan].pricePence)}/month).`, tone: "ok" };
      }
      return { text: `Renews ${fmtDate(sub.currentPeriodEnd)} for ${formatPrice(plan.pricePence)}.`, tone: "ok" };
    case SUBSCRIPTION_STATUS.PAST_DUE:
      return { text: "Your last payment failed — update your card to carry on.", tone: "bad" };
    default:
      return { text: `Ended ${sub.endedAt ? fmtDate(sub.endedAt) : ""}.`, tone: "warn" };
  }
}

// Plan & billing: where their plan stands, programmes used (and buying more
// on Basic), card on file, cancelling / resuming, and payment history.
export default function BillingPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const { data, error: loadError, act } = useBilling();
  const [busy, setBusy] = useState(null); // which action is running
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cardFor, setCardFor] = useState(null); // null | "update_card" | "buy_pack"
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !user) router.replace(loginHref());
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;

  const run = async (action, details) => {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      setMessage(await act(action, details));
      setCardFor(null);
      setConfirmCancel(false);
    } catch (err) {
      setError(err.message || "Something went wrong — please try again.");
    } finally {
      setBusy(null);
    }
  };

  const sub = data?.subscription;
  const access = data?.access;
  const plan = sub ? PLANS[sub.plan] : null;
  const status = data && statusLine(sub, access);
  const card = sub?.paymentMethod;

  return (
    <>
      {/* Home, unless their plan has ended — the app would only send them
          straight back to choose one, so Settings instead. */}
      {access && !access.staff && !access.hasAccess ? (
        <AppHeader backHref="/settings" backLabel="Settings" />
      ) : (
        <AppHeader backHref="/" backLabel="Programs" />
      )}
      <main className={styles.main}>
        <h1 className={styles.title}>Plan & billing</h1>

        {!data ? (
          <p className={styles.muted}>{loadError || "Loading…"}</p>
        ) : access.staff ? (
          <p className={styles.muted}>Trainer and admin accounts have full access without a plan.</p>
        ) : (
          <>
            {message && <p className={styles.success}>{message}</p>}
            {error && <p className={styles.error}>{error}</p>}

            <section className={styles.card}>
              <div className={styles.planRow}>
                <div>
                  <p className={styles.label}>Your plan</p>
                  <p className={styles.planName}>
                    {plan ? plan.name : "None"}
                    {plan?.pricePence > 0 && <span className={styles.price}> · {formatPrice(plan.pricePence)}/month</span>}
                  </p>
                </div>
                <Link href="/subscribe?next=/billing" className={styles.secondary}>
                  {access.hasAccess ? "Change plan" : "Choose a plan"}
                </Link>
              </div>
              <p className={`${styles.status} ${styles[status.tone]}`}>{status.text}</p>

              {access.hasAccess && sub?.status === SUBSCRIPTION_STATUS.ACTIVE && (
                <div className={styles.actions}>
                  {sub.cancelAtPeriodEnd || sub.pendingPlan ? (
                    <button type="button" className={styles.secondary} disabled={!!busy} onClick={() => run("resume")}>
                      {busy === "resume" ? "Saving…" : sub.pendingPlan ? `Stay on ${plan.name}` : "Keep my plan"}
                    </button>
                  ) : (
                    <button type="button" className={styles.dangerLink} disabled={!!busy} onClick={() => setConfirmCancel(true)}>
                      Cancel plan
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className={styles.card}>
              <p className={styles.label}>Programmes you&apos;ve built</p>
              <p className={styles.planName}>
                {data.programmes.used}
                {data.programmes.limit == null ? <span className={styles.price}> · unlimited</span> : <span className={styles.price}> of {data.programmes.limit}</span>}
              </p>
              {data.extraProgrammeSlots > 0 && <p className={styles.muted}>Includes {data.extraProgrammeSlots} extra from top-ups.</p>}
              {access.canBuyPack && (
                <>
                  <p className={styles.muted}>
                    Need more? Add {data.pack.programmes} programmes for {formatPrice(data.pack.pricePence)} (one-off), or move to Pro for unlimited.
                  </p>
                  {cardFor === "buy_pack" ? (
                    <CardForm
                      submitLabel={`Pay ${formatPrice(data.pack.pricePence)}`}
                      busy={busy === "buy_pack"}
                      onSubmit={(paymentMethod) => run("buy_pack", { paymentMethod })}
                    />
                  ) : (
                    <div className={styles.actions}>
                      {card ? (
                        <button type="button" className={styles.primary} disabled={!!busy} onClick={() => run("buy_pack")}>
                          {busy === "buy_pack"
                            ? "Processing…"
                            : `Add ${data.pack.programmes} for ${formatPrice(data.pack.pricePence)} · ${BRAND_LABELS[card.brand] ?? "card"} •••• ${card.last4}`}
                        </button>
                      ) : null}
                      <button type="button" className={styles.secondary} disabled={!!busy} onClick={() => setCardFor("buy_pack")}>
                        {card ? "Use another card" : `Add ${data.pack.programmes} for ${formatPrice(data.pack.pricePence)}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>

            {sub && sub.plan !== PLAN_KEYS.TRIAL && (
              <section className={styles.card}>
                <p className={styles.label}>Card</p>
                {card ? (
                  <p className={styles.planName}>
                    {BRAND_LABELS[card.brand] ?? "Card"} •••• {card.last4}
                    <span className={styles.price}>
                      {" "}
                      · expires {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                    </span>
                  </p>
                ) : (
                  <p className={styles.muted}>No card on file.</p>
                )}
                {cardFor === "update_card" ? (
                  <CardForm
                    submitLabel={sub.status === SUBSCRIPTION_STATUS.PAST_DUE ? `Save card & pay ${formatPrice(plan.pricePence)}` : "Save card"}
                    busy={busy === "update_card"}
                    onSubmit={(paymentMethod) => run("update_card", { paymentMethod })}
                  />
                ) : (
                  <div className={styles.actions}>
                    <button type="button" className={styles.secondary} disabled={!!busy} onClick={() => setCardFor("update_card")}>
                      Update card
                    </button>
                  </div>
                )}
              </section>
            )}

            <h2 className={styles.sectionTitle}>Payments</h2>
            {data.payments.length === 0 ? (
              <p className={styles.muted}>No payments yet.</p>
            ) : (
              <ul className={styles.payments}>
                {data.payments.map((p) => (
                  <li key={p.id} className={styles.payment}>
                    <span>
                      <span className={styles.paymentDesc}>{p.description}</span>
                      <span className={styles.muted}>
                        {fmtDate(p.at)}
                        {p.card ? ` · ${p.card}` : ""}
                        {p.status !== "succeeded" && p.failureMessage ? ` · ${p.failureMessage}` : ""}
                      </span>
                    </span>
                    <span className={p.status === "succeeded" ? styles.paymentAmount : styles.paymentFailed}>
                      {p.status === "succeeded" ? formatPrice(p.amountPence) : "Failed"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {access.hasAccess && (
              <Link href="/" className={styles.backHome}>
                Back to programs
              </Link>
            )}
            <p className={styles.testNote}>Test mode — payments are simulated and no money is taken.</p>
          </>
        )}
      </main>

      {confirmCancel && sub && (
        <ConfirmDialog
          title="Cancel your plan?"
          confirmLabel="Cancel plan"
          cancelLabel="Keep plan"
          busyLabel="Cancelling…"
          danger
          busy={busy === "cancel"}
          error={error}
          onConfirm={() => run("cancel")}
          onCancel={() => setConfirmCancel(false)}
        >
          <p>
            You&apos;ll keep {plan.name} until <strong>{fmtDate(sub.currentPeriodEnd)}</strong> and won&apos;t be charged again. After
            that you&apos;ll need to choose a plan to keep using the app.
          </p>
          {sub.plan === PLAN_KEYS.PRO && <p>Your trainer and chat end when Pro does.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
