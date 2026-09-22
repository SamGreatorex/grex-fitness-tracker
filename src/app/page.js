"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "../components/AppHeader";
import ProgramCard from "../components/ProgramCard";
import styles from "./page.module.css";

export default function Home() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const [programs, setPrograms] = useState(null);
  const [activeRunsByProgram, setActiveRunsByProgram] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace("/login");
    }
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [{ programs }, { runs }] = await Promise.all([
          api.get("/api/programs"),
          api.get("/api/runs"),
        ]);
        setPrograms(programs);

        const byProgram = {};
        for (const run of runs) {
          if (run.status !== "active") continue;
          if (!byProgram[run.programId]) byProgram[run.programId] = run;
        }
        setActiveRunsByProgram(byProgram);
      } catch (err) {
        setError(err.message || "Could not load programs.");
      }
    })();
  }, [user]);

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Your programs</h1>
            <p className={styles.subtitle}>Pick a program to start or continue.</p>
          </div>
          <Link href="/admin/exercises" className={styles.adminLink}>
            Manage exercise library
          </Link>
        </div>

        {error && <p>{error}</p>}

        {!programs ? (
          <p className={styles.empty}>Loading programs…</p>
        ) : programs.length === 0 ? (
          <p className={styles.empty}>No programs found. Run the seed script to load your plan.</p>
        ) : (
          <div className={styles.grid}>
            {programs.map((program) => (
              <ProgramCard
                key={program.programId}
                program={program}
                activeRun={activeRunsByProgram[program.programId]}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
