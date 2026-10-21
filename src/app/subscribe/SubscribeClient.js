"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import AppHeader from "../../components/AppHeader";
import PlanPicker from "../../components/PlanPicker";
import CardForm, { BRAND_LABELS } from "../../components/CardForm";
import { useBilling } from "../../lib/useBilling";
import { PLANS, PLAN_KEYS, SUBSCRIPTION_STATUS, TRIAL_DAYS, formatPrice } from "../../lib/billing";
import styles from "./subscribe.module.css";

const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

// Why they're here, in one line.
function headline(data) {
  const { access, subscription } = data;
  if (access.needsPlan) return { title: "Choose your plan", text: "Pick how you'd like to use F4TF. You can change plan any time." };
  if (subscription?.status === SUBSCRIPTION_STATUS.PAST_DUE) {
    return { title: "Your payment didn't go through", text: "Your last renewal failed. Choose a plan and add a card to carry on." };
  }
  if (!access.hasAccess && subscription?.plan === PLAN_KEYS.TRIAL) {
    return { title: "Your free trial has ended", text: "Choose a monthly plan to keep using the app — your programmes and history are all still here." };
  }
  if (!access.hasAccess) {
    return { title: "Your plan has ended", text: "Choose a plan to pick up where you left off — your programmes and history are all still here." };
  }
  return { title: "Change plan", text: "Upgrading starts your new plan straight away." };
}

// Choose (or renew / change) a plan. Sign-up sends people here with
// ?plan=trial|basic|pro already picked; the app sends them here whenever
// their trial or plan has ended. ?next= is where to go afterwards.
export default function SubscribeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, profile, signOut } = useAuth();
  const { data, error: loadError, act } = useBilling();
  const [chosen, setChosen] = useState(searchParams.get("plan"));
  const [useNewCard, setUseNewCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Only paths within the app — "//host" or "https://…" would leave the site.
  const requestedNext = searchParams.get("next");
  const next = requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  // Opened from Plan & billing → back there; from anywhere else → programs.
  const back = next === "/billing" ? { href: "/billing", label: "Plan & billing" } : { href: "/", label: "Programs" };

  useEffect(() => {
    if (!sessionLoading && !user) router.replace(`/login?redirect=${encodeURIComponent("/subscribe")}`);
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;

  if (data?.access.staff) {
    return (
      <>
        <AppHeader backHref="/" backLabel="Programs" />
        <main className={styles.main}>
          <h1 className={styles.title}>No plan needed</h1>
          <p className={styles.subtitle}>Trainer and admin accounts have full access without a plan.</p>
        </main>
      </>
    );
  }

  if (!data) {
    return (
      <main className={styles.main}>
        <p className={styles.subtitle}>{loadError || "Loading plans…"}</p>
      </main>
    );
  }

  const trialAvailable = !data.trialUsed && !data.access.hasAccess;
  const currentPaid = data.access.hasAccess && data.subscription?.status === SUBSCRIPTION_STATUS.ACTIVE ? data.subscription.plan : null;
  // Default: the trial if they can still have it, otherwise Basic.
  const valid = (key) => key && PLANS[key] && (key !== PLAN_KEYS.TRIAL || trialAvailable);
  const selected = valid(chosen) ? chosen : trialAvailable ? PLAN_KEYS.TRIAL : PLAN_KEYS.BASIC;
  const plan = PLANS[selected];
  const savedCard = data.subscription?.paymentMethod;
  const { title, text } = headline(data);
  const downgrade = currentPaid === PLAN_KEYS.PRO && selected === PLAN_KEYS.BASIC;

  const run = async (action, details) => {
    setBusy(true);
    setError("");
    try {
      await act(action, details);
      router.replace(next);
    } catch (err) {
      setError(err.message || "Something went wrong — please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      {data.access.hasAccess ? (
        <AppHeader backHref={back.href} backLabel={back.label} />
      ) : (
        <header className={styles.bareHeader}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/f4tf-mark.png" alt="Fit4 The Future" width={680} height={352} className={styles.logo} />
          <button type="button" className={styles.signOut} onClick={signOut}>
            Sign out
          </button>
        </header>
      )}
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>
          {text}
          {profile?.email && <span className={styles.account}> Signed in as {profile.email}.</span>}
        </p>

        <PlanPicker selected={selected} onSelect={(k) => { setChosen(k); setError(""); }} trialAvailable={trialAvailable} current={currentPaid} />

        <section className={styles.checkout}>
          {selected === PLAN_KEYS.TRIAL ? (
            <>
              <h2 className={styles.checkoutTitle}>Start your free trial</h2>
              <p className={styles.checkoutText}>
                {TRIAL_DAYS} days free, no card needed. When it ends you&apos;ll choose Basic ({formatPrice(PLANS.basic.pricePence)}) or Pro (
                {formatPrice(PLANS.pro.pricePence)}) a month to keep going.
              </p>
              {error && <p className={styles.error}>{error}</p>}
              <button type="button" className={styles.primary} disabled={busy} onClick={() => run("start_trial")}>
                {busy ? "Starting…" : `Start ${TRIAL_DAYS}-day free trial`}
              </button>
            </>
          ) : currentPaid === selected ? (
            <p className={styles.checkoutText}>You&apos;re already on {plan.name}.</p>
          ) : downgrade ? (
            <>
              <h2 className={styles.checkoutTitle}>Move to Basic</h2>
              <p className={styles.checkoutText}>
                You keep Pro until {fmtDate(data.subscription.currentPeriodEnd)}, then move to Basic at {formatPrice(plan.pricePence)} a
                month. Basic doesn&apos;t include a trainer, so your trainer and chat end then.
              </p>
              {error && <p className={styles.error}>{error}</p>}
              <button type="button" className={styles.primary} disabled={busy} onClick={() => run("subscribe", { plan: selected })}>
                {busy ? "Saving…" : "Move to Basic at renewal"}
              </button>
            </>
          ) : (
            <>
              <h2 className={styles.checkoutTitle}>
                {plan.name} — {formatPrice(plan.pricePence)} a month
              </h2>
              <p className={styles.checkoutText}>
                Charged today, then every month until you cancel. Cancel any time and you keep access to the end of the month you&apos;ve paid for.
              </p>
              {error && <p className={styles.error}>{error}</p>}
              {savedCard && !useNewCard ? (
                <div className={styles.savedCard}>
                  <span>
                    Pay with {BRAND_LABELS[savedCard.brand] ?? "card"} •••• {savedCard.last4}
                  </span>
                  <button type="button" className={styles.primary} disabled={busy} onClick={() => run("subscribe", { plan: selected })}>
                    {busy ? "Processing…" : `Pay ${formatPrice(plan.pricePence)} & subscribe`}
                  </button>
                  <button type="button" className={styles.linkButton} onClick={() => setUseNewCard(true)}>
                    Use a different card
                  </button>
                </div>
              ) : (
                <CardForm
                  submitLabel={`Pay ${formatPrice(plan.pricePence)} & subscribe`}
                  busy={busy}
                  onSubmit={(paymentMethod) => run("subscribe", { plan: selected, paymentMethod })}
                  footnote="Renews monthly. Cancel any time from Plan & billing."
                />
              )}
            </>
          )}
        </section>

        {/* Only while they still have access — otherwise the app would just
            send them back here (Sign out, top right, is their way out). */}
        {data.access.hasAccess && (
          <div className={styles.footer}>
            <Link href="/" className={styles.notNow}>
              Not now — back to programs
            </Link>
            {back.href === "/billing" && (
              <Link href="/billing" className={styles.link}>
                Back to Plan & billing
              </Link>
            )}
          </div>
        )}
      </main>
    </>
  );
}
