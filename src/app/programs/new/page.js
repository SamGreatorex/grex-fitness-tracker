"use client";

import { loginHref } from "../../../lib/loginRedirect";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import AppHeader from "../../../components/AppHeader";
import ProgrammeBuilder from "../../../components/ProgrammeBuilder";
import { useBilling } from "../../../lib/useBilling";
import { formatPrice } from "../../../lib/billing";
import styles from "../builder.module.css";

// A user building a programme for themselves — within their plan's
// programme limit (checked up front, so nobody builds one only to have it
// refused; the API enforces it too).
export default function NewOwnProgrammePage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const { data } = useBilling();

  useEffect(() => {
    if (!sessionLoading && !user) router.replace(loginHref());
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;

  const limit = data?.programmes.limit;
  const atLimit = limit != null && data.programmes.used >= limit;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>New programme</h1>
        {!data ? (
          <p className={styles.empty}>Loading…</p>
        ) : atLimit ? (
          <div className={styles.limit}>
            <p>
              You&apos;ve built {data.programmes.used} of your {limit} programmes, which is your plan&apos;s limit.
            </p>
            <div className={styles.limitActions}>
              {data.access.canBuyPack && (
                <Link href="/billing" className={styles.limitPrimary}>
                  Add {data.pack.programmes} more for {formatPrice(data.pack.pricePence)}
                </Link>
              )}
              <Link href="/subscribe?plan=pro&next=/programs/new" className={styles.limitSecondary}>
                Go Pro for unlimited
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.subtitle}>
              Build your own — pick the days and exercises, then start it from your programmes.
              {limit != null && ` (${data.programmes.used} of ${limit} built.)`}
            </p>
            <ProgrammeBuilder selfBuilt ownerUserId={user.userId} backHref="/" />
          </>
        )}
      </main>
    </>
  );
}
