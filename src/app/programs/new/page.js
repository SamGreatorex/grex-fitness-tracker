"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import AppHeader from "../../../components/AppHeader";
import ProgrammeBuilder from "../../../components/ProgrammeBuilder";
import styles from "../builder.module.css";

// A user building a programme for themselves.
export default function NewOwnProgrammePage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>New programme</h1>
        <p className={styles.subtitle}>Build your own — pick the days and exercises, then start it from your programmes.</p>
        <ProgrammeBuilder selfBuilt ownerUserId={user.userId} backHref="/" />
      </main>
    </>
  );
}
