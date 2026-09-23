"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../../components/AuthProvider";
import { api } from "../../../../../lib/apiClient";
import AppHeader from "../../../../../components/AppHeader";
import WorkoutSummary from "../../../../../components/WorkoutSummary";
import { averageEffortOf, averageWeightOf } from "../../../../../lib/sessionStats";
import { effortColor } from "../../../../../lib/effort";
import styles from "./page.module.css";

// Read-only view of a session that's already been logged. Deliberately has
// no editable inputs — "Restart this day" is the explicit, opt-in way back
// into the live workout page for this day/week.
export default function SessionViewPage() {
  const { programId, sessionId } = useParams();
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  const [program, setProgram] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ session }, { program }] = await Promise.all([
        api.get(`/api/sessions/${encodeURIComponent(sessionId)}`),
        api.get(`/api/programs/${programId}`),
      ]);
      setSession(session);
      setProgram(program);
    } catch (err) {
      setError(err.message || "Could not load this session.");
    }
  }, [sessionId, programId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
    })();
  }, [user, load]);

  if (sessionLoading || !user) return null;

  if (error) {
    return (
      <>
        <AppHeader backHref={`/programs/${programId}`} backLabel="Program" />
        <main className={styles.breakdownWrap}>
          <p className={styles.empty}>{error}</p>
        </main>
      </>
    );
  }

  if (!session) return null;

  const restartHref = `/programs/${programId}/day/${session.dayId}?runId=${encodeURIComponent(session.runId)}&week=${session.week}`;

  return (
    <>
      <AppHeader backHref={`/programs/${programId}`} backLabel={program?.name || "Program"} />

      <WorkoutSummary
        dayLabel={session.dayName}
        week={session.week}
        completedAt={session.completedAt}
        durationSeconds={session.durationSeconds}
        totalWeightLifted={session.totalWeightLifted}
        averageWeight={averageWeightOf(session.exercises)}
        averageEffort={averageEffortOf(session.exercises)}
        weekCompleted={false}
        continueLabel="Back to program"
        onContinue={() => router.push(`/programs/${programId}`)}
      />

      <div className={styles.breakdownWrap}>
        <h2 className={styles.breakdownTitle}>Exercises</h2>

        {session.exercises.map((exercise) => (
          <div key={exercise.exerciseId} className={styles.exerciseRow}>
            <p className={styles.exerciseName}>{exercise.name}</p>
            <div className={styles.setsList}>
              {exercise.sets.length === 0 ? (
                <p className={styles.empty}>No sets logged.</p>
              ) : (
                exercise.sets.map((set, i) => (
                  <div key={i} className={styles.setChip}>
                    <span className={styles.setIndex}>{i + 1}</span>
                    <span>
                      {set.weight}kg × {set.reps}
                    </span>
                    {set.effort != null && (
                      <span
                        className={styles.effortDot}
                        style={{ "--effort-color": effortColor(set.effort) }}
                        title={`Effort: ${set.effort}/10`}
                      >
                        {set.effort}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        <button type="button" className={styles.restartButton} onClick={() => router.push(restartHref)}>
          Restart this day
        </button>
      </div>
    </>
  );
}
