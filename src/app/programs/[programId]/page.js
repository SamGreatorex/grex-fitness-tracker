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
  const [sessionByDayId, setSessionByDayId] = useState({});
  const [starting, setStarting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
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
      const activeRun = runs.find((r) => r.status === "active") || null;
      setRun(activeRun);
      setLastRun(runs[0] || null);

      if (activeRun) {
        const { sessions } = await api.get("/api/sessions", { runId: activeRun.runId });
        const thisWeek = sessions
          .filter((s) => s.week === activeRun.currentWeek)
          .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
        const latestByDay = {};
        for (const session of thisWeek) {
          if (!latestByDay[session.dayId]) latestByDay[session.dayId] = session;
        }
        setSessionByDayId(latestByDay);
      } else {
        setSessionByDayId({});
      }
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
      await load();
    } catch (err) {
      setError(err.message || "Could not start program.");
    } finally {
      setStarting(false);
    }
  };

  const startEditingName = () => {
    setNameDraft(program.name);
    setEditingName(true);
  };

  const cancelEditingName = () => {
    setEditingName(false);
    setError("");
  };

  const saveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === program.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    setError("");
    try {
      const { program: updated } = await api.patch(`/api/programs/${programId}`, { name: nameDraft.trim() });
      setProgram(updated);
      setEditingName(false);
    } catch (err) {
      setError(err.message || "Could not rename program.");
    } finally {
      setSavingName(false);
    }
  };

  const restart = async (scope) => {
    const confirmMessage =
      scope === "program"
        ? "Restart this program? This ends your current run and takes you back to the start screen. Your logged history is kept, and you'll begin again from week 1 when you start it."
        : `Restart week ${run.currentWeek}? This clears everything logged for this week so far.`;
    if (!window.confirm(confirmMessage)) return;

    setRestarting(true);
    setError("");
    try {
      await api.post(`/api/runs/${encodeURIComponent(run.runId)}/restart`, { scope, week: run.currentWeek });
      await load();
    } catch (err) {
      setError(err.message || "Could not restart.");
    } finally {
      setRestarting(false);
    }
  };

  if (sessionLoading || !user || !program) return null;

  const canStart = !run;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        {editingName ? (
          <div className={styles.nameEditRow}>
            <input
              className={styles.nameInput}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              disabled={savingName}
            />
            <button type="button" className={styles.nameSaveButton} disabled={savingName} onClick={saveName}>
              {savingName ? "Saving…" : "Save"}
            </button>
            <button type="button" className={styles.nameCancelButton} disabled={savingName} onClick={cancelEditingName}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{program.name}</h1>
            <button type="button" className={styles.editNameButton} aria-label="Rename program" onClick={startEditingName}>
              Rename
            </button>
          </div>
        )}
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

        {run && (
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

        <div className={styles.days}>
          {program.days.map((day) => {
            const doneSession = sessionByDayId[day.dayId];
            return (
              <div key={day.dayId} className={`${styles.dayCard} ${doneSession ? styles.dayCardDone : ""}`}>
                <div>
                  <p className={styles.dayName}>
                    {day.label}
                    {doneSession && <span className={styles.doneBadge}>✓ Done</span>}
                  </p>
                  {day.subtitle && <p className={styles.daySubtitle}>{day.subtitle}</p>}
                  <p className={styles.dayMeta}>{day.exercises.length} exercises</p>
                </div>

                {!run ? (
                  <button type="button" className={styles.dayButton} disabled>
                    Start program first
                  </button>
                ) : doneSession ? (
                  <div className={styles.dayButtonGroup}>
                    <button
                      type="button"
                      className={styles.dayButton}
                      onClick={() => router.push(`/programs/${programId}/sessions/${encodeURIComponent(doneSession.sessionId)}`)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className={styles.dayButton}
                      onClick={() =>
                        router.push(
                          `/programs/${programId}/day/${day.dayId}?runId=${encodeURIComponent(run.runId)}&week=${run.currentWeek}`
                        )
                      }
                    >
                      Restart
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.dayButton}
                    onClick={() =>
                      router.push(
                        `/programs/${programId}/day/${day.dayId}?runId=${encodeURIComponent(run.runId)}&week=${run.currentWeek}`
                      )
                    }
                  >
                    {`Start ${day.label}`}
                  </button>
                )}
              </div>
            );
          })}
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
