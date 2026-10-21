"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import AppHeader from "../../components/AppHeader";
import ProfileForm from "../../components/ProfileForm";
import ChangePasswordForm from "../../components/ChangePasswordForm";
import Link from "next/link";
import { ROLE_LABELS } from "../../lib/profile";
import { PLANS, accessFor } from "../../lib/billing";
import styles from "./page.module.css";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile, setProfile } = useAuth();

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;
  const access = accessFor(profile);

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Profile settings</h1>

        {!profile ? (
          <p className={styles.subtitle}>Loading profile…</p>
        ) : (
          <>
            <dl className={styles.account}>
              <div>
                <dt>Email</dt>
                <dd>{profile.email}</dd>
              </div>
              <div>
                <dt>Account type</dt>
                <dd>{ROLE_LABELS[profile.role] ?? profile.role}</dd>
              </div>
              {!access.staff && (
                <div>
                  <dt>Plan</dt>
                  <dd>
                    {access.plan ? PLANS[access.plan].name : "None"}
                    {!access.hasAccess && access.plan ? " (ended)" : ""} ·{" "}
                    <Link href="/billing" className={styles.link}>
                      Plan & billing
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            <h2 className={styles.sectionTitle}>Profile</h2>
            <div className={styles.card}>
              <ProfileForm profile={profile} onSaved={setProfile} />
            </div>

            <h2 className={styles.sectionTitle}>Password</h2>
            <div className={styles.card}>
              <ChangePasswordForm />
            </div>
          </>
        )}
      </main>
    </>
  );
}
