"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../../components/AuthProvider";
import { api } from "../../../../../lib/apiClient";
import AppHeader from "../../../../../components/AppHeader";
import ExerciseCard from "../../../../../components/ExerciseCard";
import ElapsedTimer from "../../../../../components/ElapsedTimer";
import RestOverlay from "../../../../../components/RestOverlay";
import EffortDialog from "../../../../../components/EffortDialog";
import WorkoutSummary from "../../../../../components/WorkoutSummary";
import { slugify } from "../../../../../lib/slugify";
import { averageEffortOf, averageWeightOf, aggregateSessionStats } from "../../../../../lib/sessionStats";
import { useWakeLock } from "../../../../../lib/useWakeLock";
import styles from "./page.module.css";

// Walks backward from `index` through this exercise's sets (in the current
// session) for the last non-empty value of `field` — weight/reps use "" as
// their unset sentinel, effort uses null. Falls back to that same sentinel
// if nothing earlier was entered either.
function carryForwardValue(sets, index, field) {
  for (let i = index; i >= 0; i--) {
    const value = sets[i][field];
    if (value !== "" && value != null) return value;
  }
  return field === "effort" ? null : "";
}

// The last non-null effort rating from a previous session's sets for this
// exercise (searching backward, in case its final set wasn't rated).
function lastLoggedEffort(lastSets) {
  if (!lastSets) return null;
  for (let i = lastSets.length - 1; i >= 0; i--) {
    if (lastSets[i].effort != null) return lastSets[i].effort;
  }
  return null;
}

// The most recently logged sets for this exact exercise, wherever it was
// last done — any program, any day. `sessions` must already be sorted most
// recent first (the sessions API returns them that way).
function findLastSetsForExercise(sessions, exerciseName) {
  const targetSlug = slugify(exerciseName);
  for (const session of sessions) {
    const match = session.exercises.find(
      (e) => slugify(e.name) === targetSlug && e.sets.length > 0
    );
    if (match) return match.sets;
  }
  return null;
}

// Builds the editable set rows for one exercise slot — used both on initial
// load and when the user switches that slot to a different exercise, since
// both cases need the same last-time/default-value prefill logic.
function buildSetRows({ targetSets, restSeconds, lastSets, defaultWeight, defaultReps }) {
  return Array.from({ length: targetSets }, (_, i) => {
    const last = lastSets?.[i] ?? lastSets?.[lastSets.length - 1];
    return {
      weight: last ? String(last.weight) : defaultWeight != null ? String(defaultWeight) : "",
      reps: last ? String(last.reps) : defaultReps != null ? String(defaultReps) : "",
      completed: false,
      effort: null,
      restSeconds,
    };
  });
}

export default function WorkoutSessionClient() {
  const { programId, dayId } = useParams();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const week = Number(searchParams.get("week")) || 1;
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  // Held for as long as this workout session is open — the elapsed
  // workout timer in the header runs the whole time too, and this is
  // exactly the kind of screen you'd otherwise glance at only occasionally
  // between sets, which is enough for the phone's own screen-lock timeout
  // to kick in.
  useWakeLock();

  const [program, setProgram] = useState(null);
  const [day, setDay] = useState(null);
  const [lastSetsByExerciseId, setLastSetsByExerciseId] = useState({});
  const [exerciseLibrary, setExerciseLibrary] = useState({});
  const [exerciseLibraryList, setExerciseLibraryList] = useState([]);
  const [sessionsCache, setSessionsCache] = useState([]);
  const [setsByExercise, setSetsByExercise] = useState(null);
  const [startedAt] = useState(() => Date.now());
  // Independent of each other: the rest countdown is a non-blocking
  // floating overlay (browsing the rest of the app stays possible while
  // it counts down), while the effort dialog is a small blocking modal
  // that only asks "how did that feel?" and closes itself on an answer.
  const [restOverlay, setRestOverlay] = useState(null);
  const [effortContext, setEffortContext] = useState(null);
  // Forces RestOverlay to remount (fresh countdown) each time a new rest
  // period starts, without reaching for an impure Date.now()/Math.random()
  // key during an event handler.
  const restOverlayKeyRef = useRef(0);
  const [finishing, setFinishing] = useState(false);
  // Which summary screen is showing right now, and the (possibly several)
  // summaries queued up behind it — finishing a day can also complete the
  // week and, on the last week, the whole programme, and each gets its own
  // screen, shown one after another in that order.
  const [summaryStage, setSummaryStage] = useState(null); // null | "day" | "week" | "program"
  const [daySummary, setDaySummary] = useState(null);
  const [weekSummary, setWeekSummary] = useState(null);
  const [programSummary, setProgramSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!runId) {
      router.replace(`/programs/${programId}`);
    }
  }, [runId, programId, router]);

  useEffect(() => {
    if (!user || !runId) return;
    (async () => {
      try {
        const [{ program }, { sessions }, { exercises }] = await Promise.all([
          api.get(`/api/programs/${programId}`),
          api.get("/api/sessions"),
          api.get("/api/exercises"),
        ]);
        const foundDay = program.days.find((d) => d.dayId === dayId);
        if (!foundDay) {
          setError("Day not found in this program.");
          return;
        }

        const libraryBySlug = {};
        for (const libraryExercise of exercises) {
          libraryBySlug[libraryExercise.exerciseId] = libraryExercise;
        }

        const initial = {};
        const lastSetsByExerciseId = {};
        for (const exercise of foundDay.exercises) {
          const lastSets = findLastSetsForExercise(sessions, exercise.name);
          lastSetsByExerciseId[exercise.exerciseId] = lastSets;
          const libraryEntry = libraryBySlug[slugify(exercise.name)];

          initial[exercise.exerciseId] = buildSetRows({
            targetSets: exercise.targetSets,
            restSeconds: exercise.restSeconds,
            lastSets,
            defaultWeight: libraryEntry?.defaultWeight,
            defaultReps: libraryEntry?.defaultReps,
          });
        }

        setProgram(program);
        setDay(foundDay);
        setLastSetsByExerciseId(lastSetsByExerciseId);
        setExerciseLibrary(libraryBySlug);
        setExerciseLibraryList(exercises);
        setSessionsCache(sessions);
        setSetsByExercise(initial);
      } catch (err) {
        setError(err.message || "Could not load workout.");
      }
    })();
  }, [user, programId, dayId, runId]);

  if (sessionLoading || !user || !program || !day || !setsByExercise) return null;

  if (summaryStage === "day") {
    const nextStage = weekSummary ? "week" : null;
    return (
      <WorkoutSummary
        dayLabel={day.label}
        week={week}
        durationSeconds={daySummary.durationSeconds}
        totalWeightLifted={daySummary.totalWeightLifted}
        averageWeight={daySummary.averageWeight}
        averageEffort={daySummary.averageEffort}
        continueLabel={nextStage ? "See week summary →" : "Back to program"}
        onContinue={() => (nextStage ? setSummaryStage(nextStage) : router.push(`/programs/${programId}`))}
      />
    );
  }

  if (summaryStage === "week") {
    const nextStage = programSummary ? "program" : null;
    return (
      <WorkoutSummary
        title={`Week ${week} complete! 🎉`}
        subtitle={`${weekSummary.sessionCount} day${weekSummary.sessionCount === 1 ? "" : "s"} logged this week`}
        durationSeconds={weekSummary.durationSeconds}
        totalWeightLifted={weekSummary.totalWeightLifted}
        averageWeight={weekSummary.averageWeight}
        averageEffort={weekSummary.averageEffort}
        continueLabel={nextStage ? "See programme summary →" : "Back to program"}
        onContinue={() => (nextStage ? setSummaryStage(nextStage) : router.push(`/programs/${programId}`))}
      />
    );
  }

  if (summaryStage === "program") {
    return (
      <WorkoutSummary
        title="Programme complete! 🏆"
        subtitle={`${program.name} · ${programSummary.sessionCount} day${programSummary.sessionCount === 1 ? "" : "s"} logged in total`}
        durationSeconds={programSummary.durationSeconds}
        totalWeightLifted={programSummary.totalWeightLifted}
        averageWeight={programSummary.averageWeight}
        averageEffort={programSummary.averageEffort}
        continueLabel="Back to program"
        onContinue={() => router.push(`/programs/${programId}`)}
      />
    );
  }

  const lastSetsFor = (exerciseId) => lastSetsByExerciseId[exerciseId];

  // Switching persists straight to the programme itself — so this slot uses
  // the new exercise every future time this day comes up, not just today.
  const handleSwitchExercise = async (exerciseId, newExercise) => {
    const dayExercise = day.exercises.find((e) => e.exerciseId === exerciseId);
    setError("");
    try {
      await api.patch(`/api/programs/${programId}/exercises/${exerciseId}`, {
        dayId,
        name: newExercise.name,
      });
    } catch (err) {
      setError(err.message || "Could not save the switched exercise to the programme.");
      return;
    }

    const lastSets = findLastSetsForExercise(sessionsCache, newExercise.name);

    setDay((prev) => ({
      ...prev,
      exercises: prev.exercises.map((e) =>
        e.exerciseId === exerciseId ? { ...e, name: newExercise.name, videoLink: null } : e
      ),
    }));
    setLastSetsByExerciseId((prev) => ({ ...prev, [exerciseId]: lastSets }));
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: buildSetRows({
        targetSets: dayExercise.targetSets,
        restSeconds: dayExercise.restSeconds,
        lastSets,
        defaultWeight: newExercise.defaultWeight,
        defaultReps: newExercise.defaultReps,
      }),
    }));
  };

  const onSetField = (exerciseId, setIndex, field, value) => {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === setIndex ? { ...s, [field]: value } : s)),
    }));
  };

  const onLogSet = (exerciseId, setIndex) => {
    const exerciseIndex = day.exercises.findIndex((e) => e.exerciseId === exerciseId);
    const exercise = day.exercises[exerciseIndex];
    const isLastSetOverall =
      exerciseIndex === day.exercises.length - 1 && setIndex === exercise.targetSets - 1;
    const currentSets = setsByExercise[exerciseId];
    const restSeconds = currentSets[setIndex].restSeconds ?? exercise.restSeconds;

    // Left blank? Fall back to the most recent value typed for this exercise
    // earlier in the same session, rather than logging it as 0.
    const weight = carryForwardValue(currentSets, setIndex, "weight");
    const reps = carryForwardValue(currentSets, setIndex, "reps");

    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === setIndex ? { ...s, weight, reps, completed: true } : s)),
    }));

    // Always ask about effort. Only start a rest countdown if there's
    // actually more to rest for — not after the very last set of the day.
    setEffortContext({ exerciseId, setIndex });
    if (!isLastSetOverall) {
      restOverlayKeyRef.current += 1;
      setRestOverlay({ key: restOverlayKeyRef.current, seconds: restSeconds });
    }
  };

  const setEffort = (exerciseId, setIndex, effort) => {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === setIndex ? { ...s, effort } : s)),
    }));
  };

  // Re-opens the effort dialog for an already-logged set — unlike
  // onLogSet, this never starts a new rest countdown, since the set was
  // logged (and any rest already served) a while ago.
  const onEditEffort = (exerciseId, setIndex) => {
    setEffortContext({ exerciseId, setIndex });
  };

  const onApplyRestToAll = (exerciseId, restSeconds) => {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s) => ({ ...s, restSeconds })),
    }));
  };

  const handleFinish = async () => {
    setFinishing(true);
    setError("");
    try {
      const dayOrder = program.days.findIndex((d) => d.dayId === dayId);
      const exercises = day.exercises
        .map((exercise) => {
          // Only sets actually tapped "Log" count as done today — an
          // exercise nobody touched shouldn't inflate today's progress.
          const completedSets = setsByExercise[exercise.exerciseId].filter((s) => s.completed);
          if (completedSets.length === 0) return null;

          // If effort was never rated at all today for this exercise, fall
          // back to the last time it was rated for this exact exercise
          // (any day), rather than saving it blank.
          const historicalEffort = lastLoggedEffort(lastSetsByExerciseId[exercise.exerciseId]);

          return {
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            // Weight, reps and effort each still carry forward from the
            // last value entered among today's logged sets if left unset,
            // so nothing needs re-entering unless it actually changed.
            sets: completedSets.map((s, i) => ({
              weight: Number(carryForwardValue(completedSets, i, "weight")) || 0,
              reps: Number(carryForwardValue(completedSets, i, "reps")) || 0,
              effort: carryForwardValue(completedSets, i, "effort") ?? historicalEffort,
              restSeconds: s.restSeconds ?? exercise.restSeconds,
              completedAt: new Date().toISOString(),
            })),
          };
        })
        .filter(Boolean);

      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const { session } = await api.post("/api/sessions", {
        runId,
        programId,
        dayId,
        dayName: day.label,
        week,
        startedAt: new Date(startedAt).toISOString(),
        durationSeconds,
        exercises,
        dayOrder,
        totalDaysInProgram: program.days.length,
        durationWeeks: program.durationWeeks,
      });

      setDaySummary({
        totalWeightLifted: session.totalWeightLifted,
        averageWeight: averageWeightOf(exercises),
        averageEffort: averageEffortOf(exercises),
        durationSeconds,
      });

      // This was the last day of the week → also show a week summary; if
      // that week was also the last one, a programme summary follows it.
      const weekCompleted = dayOrder === program.days.length - 1;
      const programCompleted = weekCompleted && week === program.durationWeeks;

      if (weekCompleted) {
        const { sessions: runSessions } = await api.get("/api/sessions", { runId });
        const withThisOne = [...runSessions.filter((s) => s.sessionId !== session.sessionId), session];

        setWeekSummary(aggregateSessionStats(withThisOne.filter((s) => s.week === week)));
        if (programCompleted) {
          setProgramSummary(aggregateSessionStats(withThisOne));
        }
      }

      setSummaryStage("day");
    } catch (err) {
      setError(err.message || "Could not save workout.");
      setFinishing(false);
    }
  };

  return (
    <>
      <AppHeader backHref={`/programs/${programId}`} backLabel={program.name} />
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{day.label}</h1>
          <span className={styles.timer}>
            <ElapsedTimer startedAt={startedAt} />
          </span>
        </div>
        <p className={styles.meta}>
          Week {week} of {program.durationWeeks}
          {day.subtitle ? ` · ${day.subtitle}` : ""}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {day.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.exerciseId}
            exercise={exercise}
            sets={setsByExercise[exercise.exerciseId]}
            lastSets={lastSetsFor(exercise.exerciseId)}
            libraryEntry={exerciseLibrary[slugify(exercise.name)]}
            libraryEntries={exerciseLibraryList}
            onSetField={(setIndex, field, value) => onSetField(exercise.exerciseId, setIndex, field, value)}
            onLogSet={(setIndex) => onLogSet(exercise.exerciseId, setIndex)}
            onEditEffort={(setIndex) => onEditEffort(exercise.exerciseId, setIndex)}
            onApplyRestToAll={(secs) => onApplyRestToAll(exercise.exerciseId, secs)}
            onSwitchExercise={(newExercise) => handleSwitchExercise(exercise.exerciseId, newExercise)}
          />
        ))}

        <div className={styles.footer}>
          <button type="button" className={styles.finishButton} disabled={finishing} onClick={handleFinish}>
            {finishing ? "Saving…" : "Finish workout"}
          </button>
        </div>
      </main>

      {restOverlay && (
        <RestOverlay key={restOverlay.key} seconds={restOverlay.seconds} onClose={() => setRestOverlay(null)} />
      )}

      {effortContext && (
        <EffortDialog
          effort={setsByExercise[effortContext.exerciseId][effortContext.setIndex].effort}
          onSelectEffort={(value) => setEffort(effortContext.exerciseId, effortContext.setIndex, value)}
          onClose={() => setEffortContext(null)}
        />
      )}
    </>
  );
}
