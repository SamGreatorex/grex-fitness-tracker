"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "../components/AppHeader";
import ProgramCard from "../components/ProgramCard";
import TrainerCard from "../components/TrainerCard";
import { PROGRAMME_PACK, accessFor, formatPrice, isOwnBuild } from "../lib/billing";
import styles from "./page.module.css";

function ReportsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M18 9l-5 5-4-4-3 3" />
    </svg>
  );
}

function TapeMeasureIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="6" />
      <circle cx="9" cy="12" r="1.5" />
      <path d="M15 12h7v5H9" />
      <path d="M18 17v-2M21 17v-2" />
    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile } = useAuth();
  const [programs, setPrograms] = useState(null);
  // Whether their plan includes a personal trainer (Pro, or staff).
  const [canHaveTrainer, setCanHaveTrainer] = useState(true);
  const [runsByProgram, setRunsByProgram] = useState({});
  const [startingProgramId, setStartingProgramId] = useState(null);
  const [error, setError] = useState("");
  // undefined while loading; null if they don't have a PT.
  const [trainer, setTrainer] = useState(undefined);

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

  // Loaded separately so a problem here never blocks the programme list.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { trainer, canHaveTrainer } = await api.get("/api/me/trainer");
        setTrainer(trainer);
        setCanHaveTrainer(canHaveTrainer !== false);
      } catch {
        setTrainer(undefined);
      }
    })();
  }, [user]);

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

  // Programmes they've built themselves, against their plan's limit.
  const access = accessFor(profile);
  const ownBuilt = programs ? programs.filter((p) => isOwnBuild(p, profile?.userId)).length : 0;
  const atLimit = access.programmeLimit != null && ownBuilt >= access.programmeLimit;

  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <h1 className={styles.title}>Your programs</h1>
        <p className={styles.subtitle}>Pick a program to start or continue.</p>

        {access.hasAccess && access.trialDaysLeft != null && (
          <Link href="/subscribe?next=/" className={styles.trialBanner}>
            <span>
              <strong>Free trial</strong> · {access.trialDaysLeft} day{access.trialDaysLeft === 1 ? "" : "s"} left
            </span>
            <span className={styles.trialBannerAction}>Choose a plan →</span>
          </Link>
        )}

        {trainer !== undefined && (
          <div className={styles.trainer}>
            <TrainerCard
              trainer={trainer}
              chatHref={trainer?.canMessage ? `/chat/${trainer.userId}` : null}
              upgradeHref={canHaveTrainer ? null : "/subscribe?plan=pro&next=/"}
            />
          </div>
        )}

        <div className={styles.quickLinks}>
          <Link href="/reports" className={styles.quickLink} aria-label="Progress reports">
            <ReportsIcon />
            <span className={styles.quickLinkTooltip}>Progress reports</span>
          </Link>
          <Link href="/measurements" className={styles.quickLink} aria-label="Body measurements">
            <TapeMeasureIcon />
            <span className={styles.quickLinkTooltip}>Body measurements</span>
          </Link>
        </div>

        {error && <p>{error}</p>}

        {!programs ? (
          <p className={styles.empty}>Loading programs…</p>
        ) : programs.length === 0 ? (
          <p className={styles.empty}>
            No programmes yet — {trainer ? "your PT will set one up for you, or build" : "build"} your own below.
          </p>
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

        {programs &&
          (atLimit ? (
            <div className={styles.limitCard}>
              <p>
                You&apos;ve built {ownBuilt} of your {access.programmeLimit} programmes.
              </p>
              <Link href={access.canBuyPack ? "/billing" : "/subscribe?next=/"} className={styles.limitAction}>
                {access.canBuyPack ? `Add ${PROGRAMME_PACK.programmes} more for ${formatPrice(PROGRAMME_PACK.pricePence)}` : "Choose a plan"}
              </Link>
              <Link href="/subscribe?plan=pro&next=/" className={styles.limitLink}>
                or go Pro for unlimited
              </Link>
            </div>
          ) : (
            <>
              <Link href="/programs/new" className={styles.newProgramme}>
                + Build your own programme
              </Link>
              {access.programmeLimit != null && (
                <p className={styles.limitNote}>
                  {ownBuilt} of {access.programmeLimit} programmes built
                </p>
              )}
            </>
          ))}
      </main>
    </>
  );
}
