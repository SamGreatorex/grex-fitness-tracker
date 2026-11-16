"use client";

import { loginHref } from "../lib/loginRedirect";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "./AppHeader";
import WorkoutSummary from "./WorkoutSummary";
import SessionEditor from "./SessionEditor";
import { averageEffortOf, averageWeightOf } from "../lib/sessionStats";
import { sessionExerciseChanges } from "../lib/exerciseProgress";

// The 50 workouts logged before `completedAt` (newest first), the same
// window the live workout compares against. Pages back through the
// history, but no more than 10 pages for a very old workout. `userId`: a
// trainer viewing a client's workout.
const HISTORY_SIZE = 50;
async function historyBefore(completedAt, userId) {
  const earlier = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const { sessions, nextCursor } = await api.get("/api/sessions", { limit: 100, cursor, userId });
    earlier.push(...sessions.filter((s) => s.completedAt < completedAt));
    if (!nextCursor || earlier.length >= HISTORY_SIZE) break;
    cursor = nextCursor;
  }
  return earlier.slice(0, HISTORY_SIZE);
}
import { effortColor, effortLabel } from "../lib/effort";
import { formatCardio } from "../lib/exerciseTypes";
import { formatSetWeight } from "../lib/units";
import { isTrainerLed, programmeBasePath } from "../lib/programLead";
import styles from "./SessionView.module.css";

// A session that's already been logged: its summary and every set, with
// "Edit workout" to correct what was logged (weights, reps, effort, sets)
// and "Restart this day" to redo it from the live workout page. Neither is
// offered to a client viewing a trainer-led programme — only to whoever
// runs it. Opens straight into editing with ?edit=1. Shared by the client's
// own pages and trainer mode's run pages, where the `userId` route param is
// the client.
export default function SessionView() {
  const { programId, sessionId: rawSessionId, userId: clientUserId } = useParams();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
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
  // Workouts logged before this one, newest first — for "Since last time".
  // Null until loaded (the section just doesn't show if they can't be).
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace(loginHref());
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ session }, { program }] = await Promise.all([
        api.get(`/api/sessions/${encodeURIComponent(sessionId)}`, clientUserId ? { userId: clientUserId } : undefined),
        api.get(`/api/programs/${programId}`),
      ]);
      setSession(session);
      setProgram(program);
      historyBefore(session.completedAt, clientUserId)
        .then(setHistory)
        .catch(() => setHistory(null));
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

  if (!session || !program) return null;

  const restartHref = `${basePath}/day/${session.dayId}?runId=${encodeURIComponent(session.runId)}&week=${session.week}`;
  // Only whoever runs the programme — not a client viewing a trainer-led one.
  const canChange = !(isTrainerLed(program) && !clientUserId);

  if (editing && canChange) {
    return (
      <>
        <AppHeader backHref={basePath} backLabel={program.name || "Program"} />
        <main className={styles.editWrap}>
          <h1 className={styles.editTitle}>Edit {session.dayName}</h1>
          <p className={styles.editMeta}>
            Week {session.week} · logged {new Date(session.completedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <SessionEditor
            session={session}
            userId={clientUserId}
            onSaved={(updated) => {
              setSession(updated);
              setEditing(false);
              // Drop ?edit=1, so a refresh shows the saved workout.
              router.replace(`${basePath}/sessions/${encodeURIComponent(sessionId)}`);
            }}
            onCancel={() => setEditing(false)}
          />
        </main>
      </>
    );
  }

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
        exerciseChanges={history ? sessionExerciseChanges(session, history) : undefined}
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
                  <EffortDot effort={exercise.cardio.effort} />
                </div>
              ) : exercise.sets.length === 0 ? (
                <p className={styles.empty}>No sets logged.</p>
              ) : (
                exercise.sets.map((set, i) => (
                  <div key={i} className={styles.setGroup}>
                    <div className={styles.setChip}>
                      <span className={styles.setIndex}>{i + 1}</span>
                      <span>
                        {formatSetWeight(set)} × {set.reps}
                      </span>
                      <EffortDot effort={set.effort} />
                    </div>
                    {(set.drops ?? []).map((drop, j) => (
                      <div key={j} className={`${styles.setChip} ${styles.dropChip}`}>
                        <span className={styles.dropMark} title="Drop set" aria-label="Drop set">
                          ↳
                        </span>
                        <span>
                          {formatSetWeight(drop)} × {drop.reps}
                        </span>
                        <EffortDot effort={drop.effort} label="Drop set effort" />
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        {session.loggedByName && <p className={styles.empty}>Logged by {session.loggedByName}</p>}
        {session.editedAt && (
          <p className={styles.empty}>Edited {new Date(session.editedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</p>
        )}

        {canChange && (
          <>
            <button type="button" className={styles.editButton} onClick={() => setEditing(true)}>
              Edit workout
            </button>
            <button type="button" className={styles.restartButton} onClick={() => router.push(restartHref)}>
              Restart this day
            </button>
          </>
        )}
      </div>
    </>
  );
}

// A set's, drop's or cardio's effort rating, in its colour; nothing if unrated.
function EffortDot({ effort, label = "Effort" }) {
  if (effort == null) return null;
  return (
    <span className={styles.effortDot} style={{ "--effort-color": effortColor(effort) }} title={`${label}: ${effort}/10 · ${effortLabel(effort)}`}>
      {effort}
    </span>
  );
}
