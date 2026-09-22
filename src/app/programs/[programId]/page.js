"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import AppHeader from "../../../components/AppHeader";
import WeekProgress from "../../../components/WeekProgress";
import styles from "./page.module.css";

export default function ProgramDetailPage() {
  const { programId } = useParams();
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  const [program, setProgram] = useState(null);
  const [run, setRun] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ program }, { runs }] = await Promise.all([
        api.get(`/api/programs/${programId}`),
        api.get("/api/runs", { programId }),
      ]);
      setProgram(program);
      setRun(runs.find((r) => r.status === "active") || null);
      setLastRun(runs[0] || null);
    } catch (err) {
      setError(err.message || "Could not load program.");
    }
  }, [programId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
    })();
  }, [user, load]);

  const startProgram = async () => {
    setStarting(true);
    setError("");
    try {
      const { run } = await api.post("/api/runs", {
        programId,
        programName: program.name,
        durationWeeks: program.durationWeeks,
      });
      setRun(run);
    } catch (err) {
      setError(err.message || "Could not start program.");
    } finally {
      setStarting(false);
    }
  };

  if (sessionLoading || !user || !program) return null;

  const canStart = !run;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>{program.name}</h1>
        <p className={styles.goal}>{program.goal} · {program.days.length} days/week · {program.durationWeeks} weeks</p>

        {error && <p>{error}</p>}

        <div className={styles.progressRow}>
          {run ? (
            <WeekProgress durationWeeks={program.durationWeeks} currentWeek={run.currentWeek} />
          ) : (
            <span />
          )}
          {canStart && (
            <button type="button" className={styles.startButton} disabled={starting} onClick={startProgram}>
              {starting ? "Starting…" : lastRun ? "Start again" : "Start program"}
            </button>
          )}
        </div>

        <div className={styles.days}>
          {program.days.map((day) => (
            <div key={day.dayId} className={styles.dayCard}>
              <div>
                <p className={styles.dayName}>{day.label}</p>
                {day.subtitle && <p className={styles.daySubtitle}>{day.subtitle}</p>}
                <p className={styles.dayMeta}>{day.exercises.length} exercises</p>
              </div>
              <button
                type="button"
                className={styles.dayButton}
                disabled={!run}
                onClick={() =>
                  router.push(
                    `/programs/${programId}/day/${day.dayId}?runId=${encodeURIComponent(run.runId)}&week=${run.currentWeek}`
                  )
                }
              >
                {run ? `Start · Week ${run.currentWeek}` : "Start program first"}
              </button>
            </div>
          ))}
        </div>

        {!run && lastRun?.status === "completed" && (
          <p className={styles.completedSummary}>
            You completed this program on {new Date(lastRun.completedAt).toLocaleDateString()}. Start it again above to run another 4 weeks.
          </p>
        )}
      </main>
    </>
  );
}
