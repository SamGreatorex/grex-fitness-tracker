"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "./AppHeader";
import WeekProgress from "./WeekProgress";
import { isTrainerLed, programmeBasePath } from "../lib/programLead";
import { formatCardio, isCardio } from "../lib/exerciseTypes";
import styles from "./ProgrammeDetail.module.css";

// One programme: where its current run is, and each day to start/view.
// Shared by the client's own /programs/[programId] page and trainer mode's
// /trainer/clients/[userId]/programmes/[programId]/run page — the `userId`
// route param is set only in the latter, meaning a trainer is running this
// (trainer-led) programme for that client. A client opening one of their
// own trainer-led programmes gets it view-only.
export default function ProgrammeDetail({ clientName }) {
  const { programId, userId: clientUserId } = useParams();
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const basePath = programmeBasePath(programId, clientUserId);
  // Runs/sessions are stored under the client; a trainer asks for theirs.
  const subject = clientUserId ? { userId: clientUserId } : {};

  const [program, setProgram] = useState(null);
  const [run, setRun] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  // The latest logged session for each day of each week of the run being
  // shown: { [week]: { [dayId]: session } }.
  const [sessionsByWeek, setSessionsByWeek] = useState({});
  // The week whose days are listed — any week reached so far can be picked
  // to look back at (and correct) what was logged. null = the current week.
  const [pickedWeek, setPickedWeek] = useState(null);
  const [starting, setStarting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    const who = clientUserId ? { userId: clientUserId } : {};
    try {
      const [{ program }, { runs }] = await Promise.all([
        api.get(`/api/programs/${programId}`),
        api.get("/api/runs", { programId, ...who }),
      ]);
      setProgram(program);
      const activeRun = runs.find((r) => r.status === "active") || null;
      setRun(activeRun);
      setLastRun(runs[0] || null);

      // The active run — or, once a programme's finished, the run just
      // completed, so its weeks can still be looked back on and corrected.
      const shownRun = activeRun ?? (runs[0]?.status === "completed" ? runs[0] : null);
      if (shownRun) {
        const { sessions } = await api.get("/api/sessions", { runId: shownRun.runId, ...who });
        // Newest first, so the first one seen per week/day is the latest.
        sessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        const byWeek = {};
        for (const session of sessions) {
          const week = (byWeek[session.week] ??= {});
          if (!week[session.dayId]) week[session.dayId] = session;
        }
        setSessionsByWeek(byWeek);
      } else {
        setSessionsByWeek({});
      }
    } catch (err) {
      setError(err.message || "Could not load program.");
    }
  }, [programId, clientUserId]);

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
      await load();
    } catch (err) {
      setError(err.message || "Could not start program.");
    } finally {
      setStarting(false);
    }
  };

  const restart = async (scope) => {
    const confirmMessage =
      scope === "program"
        ? "Restart this program? This ends the current run and takes you back to the start screen. Logged history is kept, and it begins again from week 1 when started."
        : `Restart week ${run.currentWeek}? This clears everything logged for this week so far.`;
    if (!window.confirm(confirmMessage)) return;

    setRestarting(true);
    setError("");
    try {
      await api.post(`/api/runs/${encodeURIComponent(run.runId)}/restart`, { scope, week: run.currentWeek, ...subject });
      await load();
    } catch (err) {
      setError(err.message || "Could not restart.");
    } finally {
      setRestarting(false);
    }
  };

  if (sessionLoading || !user) return null;

  const backHref = clientUserId ? `/trainer/clients/${clientUserId}` : "/";
  const backLabel = clientUserId ? clientName || "Client" : "Programs";

  if (!program) {
    return (
      <>
        <AppHeader backHref={backHref} backLabel={backLabel} />
        <main className={styles.main}>{error && <p>{error}</p>}</main>
      </>
    );
  }

  const trainerLed = isTrainerLed(program);
  // The client looking at a programme their trainer runs with them.
  const viewOnly = trainerLed && !clientUserId;
  // One the client built themselves — fully editable from the builder.
  const ownBuild = !clientUserId && program.ownerUserId === user.userId && program.createdBy === user.userId;
  const canStart = !run && !viewOnly;
  const dayHref = (day) => `${basePath}/day/${day.dayId}?runId=${encodeURIComponent(run.runId)}&week=${run.currentWeek}`;

  // Weeks that can be picked: every one reached so far in the active run, or
  // every week of a finished one.
  const finishedRun = !run && lastRun?.status === "completed" ? lastRun : null;
  const currentWeek = run ? Math.min(run.currentWeek, program.durationWeeks) : null;
  const lastReachedWeek = run ? currentWeek : finishedRun ? program.durationWeeks : 0;
  const shownWeek = Math.min(pickedWeek ?? currentWeek ?? lastReachedWeek, lastReachedWeek);
  // Looking back at an earlier week (or a finished programme): its logged
  // days can be viewed and edited, but nothing new is started there.
  const lookingBack = shownWeek > 0 && shownWeek !== currentWeek;
  const sessionByDayId = sessionsByWeek[shownWeek] ?? {};
  const sessionHref = (session, edit = false) =>
    `${basePath}/sessions/${encodeURIComponent(session.sessionId)}${edit ? "?edit=1" : ""}`;

  return (
    <>
      <AppHeader backHref={backHref} backLabel={backLabel} />
      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{program.name}</h1>
          {clientUserId ? (
            <Link href={`/trainer/clients/${clientUserId}/programmes/${programId}`} className={styles.editNameButton}>
              Edit programme
            </Link>
          ) : (
            // Ones their PT built can't be changed by the client at all.
            ownBuild && (
              <Link href={`/programs/${programId}/edit`} className={styles.editNameButton}>
                Edit programme
              </Link>
            )
          )}
        </div>
        <p className={styles.goal}>
          {[program.goal, `${program.days.length} days/week`, `${program.durationWeeks} weeks`].filter(Boolean).join(" · ")}
        </p>

        {trainerLed && (
          <p className={styles.leadNote}>
            <span className={styles.leadBadge}>Trainer led</span>
            {clientUserId
              ? `You run these sessions with ${clientName || "your client"} — workouts are logged to their history.`
              : `${program.createdByName || "Your trainer"} runs these sessions with you. You can view the programme and your logged workouts here.`}
          </p>
        )}

        {error && <p>{error}</p>}

        <div className={styles.progressRow}>
          {run || finishedRun ? (
            <WeekProgress
              durationWeeks={program.durationWeeks}
              currentWeek={run ? run.currentWeek : program.durationWeeks + 1}
              selectedWeek={shownWeek}
              onSelectWeek={(week) => setPickedWeek(week)}
            />
          ) : (
            <span />
          )}
          {canStart && (
            <button type="button" className={styles.startButton} disabled={starting} onClick={startProgram}>
              {starting ? "Starting…" : lastRun ? "Start again" : "Start program"}
            </button>
          )}
        </div>

        {run && !viewOnly && (
          <div className={styles.restartRow}>
            <button
              type="button"
              className={styles.restartLink}
              disabled={restarting}
              onClick={() => restart("week")}
            >
              Restart week {run.currentWeek}
            </button>
            <button
              type="button"
              className={styles.restartLink}
              disabled={restarting}
              onClick={() => restart("program")}
            >
              Restart programme
            </button>
          </div>
        )}

        {shownWeek > 0 && (
          <div className={styles.weekHeading}>
            <span className={styles.weekHeadingTitle}>
              Week {shownWeek}
              {shownWeek === currentWeek ? " · this week" : finishedRun ? "" : " · completed"}
            </span>
            {lookingBack && run && (
              <button type="button" className={styles.restartLink} onClick={() => setPickedWeek(null)}>
                Back to week {currentWeek}
              </button>
            )}
          </div>
        )}
        {lookingBack && !viewOnly && (
          <p className={styles.weekHint}>Open a day to see what you logged, or tap Edit to correct it.</p>
        )}

        <div className={styles.days}>
          {program.days.map((day) => {
            const doneSession = sessionByDayId[day.dayId];
            const viewButton = doneSession && (
              <button type="button" className={styles.dayButton} onClick={() => router.push(sessionHref(doneSession))}>
                View
              </button>
            );
            const editButton = doneSession && (
              <button type="button" className={styles.dayButton} onClick={() => router.push(sessionHref(doneSession, true))}>
                Edit
              </button>
            );
            return (
              <div key={day.dayId} className={`${styles.dayCard} ${doneSession ? styles.dayCardDone : ""}`}>
                <div>
                  <p className={styles.dayName}>
                    {day.label}
                    {doneSession && <span className={styles.doneBadge}>✓ Done</span>}
                  </p>
                  {day.subtitle && <p className={styles.daySubtitle}>{day.subtitle}</p>}
                  {viewOnly ? (
                    <ul className={styles.dayExercises}>
                      {day.exercises.map((ex) => (
                        <li key={ex.exerciseId}>
                          {ex.name}
                          <span className={styles.dayExerciseTarget}>
                            {isCardio(ex)
                              ? formatCardio({ settings: ex.settings, seconds: ex.targetSeconds })
                              : `${ex.targetSets} × ${ex.targetReps ?? "—"}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.dayMeta}>{day.exercises.length} exercises</p>
                  )}
                </div>

                {viewOnly ? (
                  viewButton
                ) : lookingBack ? (
                  // An earlier week: view or correct what was logged; a day
                  // that wasn't done can't be started back there.
                  doneSession ? (
                    <div className={styles.dayButtonGroup}>
                      {viewButton}
                      {editButton}
                    </div>
                  ) : (
                    <span className={styles.notLogged}>Not logged</span>
                  )
                ) : !run ? (
                  <button type="button" className={styles.dayButton} disabled>
                    Start program first
                  </button>
                ) : doneSession ? (
                  <div className={styles.dayButtonGroup}>
                    {viewButton}
                    {editButton}
                    <button type="button" className={styles.dayButton} onClick={() => router.push(dayHref(day))}>
                      Restart
                    </button>
                  </div>
                ) : (
                  <button type="button" className={styles.dayButton} onClick={() => router.push(dayHref(day))}>
                    {`Start ${day.label}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {!run && lastRun?.status === "completed" && (
          <p className={styles.completedSummary}>
            {viewOnly
              ? `You completed this program on ${new Date(lastRun.completedAt).toLocaleDateString()}.`
              : `${clientUserId ? "They" : "You"} completed this program on ${new Date(lastRun.completedAt).toLocaleDateString()}. Start it again above to run another ${program.durationWeeks} weeks.`}
          </p>
        )}
      </main>
    </>
  );
}
