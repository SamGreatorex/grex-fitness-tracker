"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import AppHeader from "../../components/AppHeader";
import ProfileForm from "../../components/ProfileForm";
import { ROLE_LABELS } from "../../lib/profile";
import styles from "./page.module.css";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile, setProfile } = useAuth();

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;

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
            </dl>

            <div className={styles.card}>
              <ProfileForm profile={profile} onSaved={setProfile} />
            </div>
          </>
        )}
      </main>
    </>
  );
}
