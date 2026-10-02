"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "./AppHeader";
import WorkoutSummary from "./WorkoutSummary";
import { averageEffortOf, averageWeightOf } from "../lib/sessionStats";
import { effortColor } from "../lib/effort";
import { formatCardio } from "../lib/exerciseTypes";
import { formatSetWeight } from "../lib/units";
import { isTrainerLed, programmeBasePath } from "../lib/programLead";
import styles from "./SessionView.module.css";

// Read-only view of a session that's already been logged. Deliberately has
// no editable inputs — "Restart this day" is the explicit, opt-in way back
// into the live workout page for this day/week (not offered to a client
// viewing a trainer-led programme). Shared by the client's own pages and
// trainer mode's run pages, where the `userId` route param is the client.
export default function SessionView() {
  const { programId, sessionId: rawSessionId, userId: clientUserId } = useParams();
  const basePath = programmeBasePath(programId, clientUserId);
  // useParams() hands back the segment still URL-encoded (session IDs
  // contain "#" and ":", sent as %23 / %3A). Decode it once here — re-encoding
  // the raw value for the API call double-encodes it, so the lookup misses
  // and every "View" ends in "Session not found".
  const sessionId = decodeURIComponent(rawSessionId);
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
        api.get(`/api/sessions/${encodeURIComponent(sessionId)}`, clientUserId ? { userId: clientUserId } : undefined),
        api.get(`/api/programs/${programId}`),
      ]);
      setSession(session);
      setProgram(program);
    } catch (err) {
      setError(err.message || "Could not load this session.");
    }
  }, [sessionId, programId, clientUserId]);

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
        <AppHeader backHref={basePath} backLabel="Program" />
        <main className={styles.breakdownWrap}>
          <p className={styles.empty}>{error}</p>
        </main>
      </>
    );
  }

  if (!session) return null;

  const restartHref = `${basePath}/day/${session.dayId}?runId=${encodeURIComponent(session.runId)}&week=${session.week}`;

  return (
    <>
      <AppHeader backHref={basePath} backLabel={program?.name || "Program"} />

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
        onContinue={() => router.push(basePath)}
      />

      <div className={styles.breakdownWrap}>
        <h2 className={styles.breakdownTitle}>Exercises</h2>

        {session.exercises.map((exercise) => (
          <div key={exercise.exerciseId} className={styles.exerciseRow}>
            <p className={styles.exerciseName}>{exercise.name}</p>
            <div className={styles.setsList}>
              {exercise.cardio ? (
                <div className={styles.setChip}>
                  <span>{formatCardio({ settings: exercise.cardio.settings, seconds: exercise.cardio.durationSeconds })}</span>
                  {exercise.cardio.effort != null && (
                    <span
                      className={styles.effortDot}
                      style={{ "--effort-color": effortColor(exercise.cardio.effort) }}
                      title={`Effort: ${exercise.cardio.effort}/10`}
                    >
                      {exercise.cardio.effort}
                    </span>
                  )}
                </div>
              ) : exercise.sets.length === 0 ? (
                <p className={styles.empty}>No sets logged.</p>
              ) : (
                exercise.sets.map((set, i) => (
                  <div key={i} className={styles.setChip}>
                    <span className={styles.setIndex}>{i + 1}</span>
                    <span>
                      {formatSetWeight(set)} × {set.reps}
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

        {session.loggedByName && <p className={styles.empty}>Logged by {session.loggedByName}</p>}

        {!(isTrainerLed(program) && !clientUserId) && (
          <button type="button" className={styles.restartButton} onClick={() => router.push(restartHref)}>
            Restart this day
          </button>
        )}
      </div>
    </>
  );
}
