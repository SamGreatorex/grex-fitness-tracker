"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "../components/AppHeader";
import ProgramCard from "../components/ProgramCard";
import styles from "./page.module.css";

function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-4-4-3 3" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 9.5v5M6.5 6.5v11M17.5 6.5v11M22 9.5v5M6.5 12h11" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const [programs, setPrograms] = useState(null);
  const [runsByProgram, setRunsByProgram] = useState({});
  const [startingProgramId, setStartingProgramId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.replace("/login");
    }
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ programs }, { runs }] = await Promise.all([
        api.get("/api/programs"),
        api.get("/api/runs"),
      ]);
      setPrograms(programs);

      // `runs` is already sorted most-recent-first, so the first run seen
      // per program is its latest, and the first *active* one (there's
      // only ever one at a time) is the one currently in progress.
      const byProgram = {};
      for (const run of runs) {
        if (!byProgram[run.programId]) {
          byProgram[run.programId] = { latest: run, active: run.status === "active" ? run : null };
        } else if (run.status === "active" && !byProgram[run.programId].active) {
          byProgram[run.programId].active = run;
        }
      }
      setRunsByProgram(byProgram);
    } catch (err) {
      setError(err.message || "Could not load programs.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
    })();
  }, [user, load]);

  const startProgram = async (program) => {
    setStartingProgramId(program.programId);
    setError("");
    try {
      await api.post("/api/runs", {
        programId: program.programId,
        programName: program.name,
        durationWeeks: program.durationWeeks,
      });
      router.push(`/programs/${program.programId}`);
    } catch (err) {
      setError(err.message || "Could not start program.");
      setStartingProgramId(null);
    }
  };

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>Your programs</h1>
        <p className={styles.subtitle}>Pick a program to start or continue.</p>

        <div className={styles.quickLinks}>
          <Link href="/reports" className={styles.quickLink}>
            <ReportsIcon />
            Progress reports
          </Link>
          <Link href="/admin/exercises" className={styles.quickLink}>
            <DumbbellIcon />
            Exercise library
          </Link>
        </div>

        {error && <p>{error}</p>}

        {!programs ? (
          <p className={styles.empty}>Loading programs…</p>
        ) : programs.length === 0 ? (
          <p className={styles.empty}>No programs found. Run the seed script to load your plan.</p>
        ) : (
          <div className={styles.grid}>
            {programs.map((program) => {
              const runs = runsByProgram[program.programId];
              return (
                <ProgramCard
                  key={program.programId}
                  program={program}
                  activeRun={runs?.active}
                  completedRun={runs?.latest?.status === "completed" ? runs.latest : null}
                  starting={startingProgramId === program.programId}
                  onStart={() => startProgram(program)}
                />
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
