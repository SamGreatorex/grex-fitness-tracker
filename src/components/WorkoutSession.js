"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { api } from "../lib/apiClient";
import AppHeader from "./AppHeader";
import ExerciseCard from "./ExerciseCard";
import ElapsedTimer from "./ElapsedTimer";
import RestOverlay from "./RestOverlay";
import EffortDialog from "./EffortDialog";
import WorkoutSummary from "./WorkoutSummary";
import ExercisePicker from "./ExercisePicker";
import { slugify } from "../lib/slugify";
import { averageEffortOf, averageWeightOf, aggregateSessionStats } from "../lib/sessionStats";
import { useWakeLock } from "../lib/useWakeLock";
import { EXERCISE_TYPES, isCardio, minutesToSeconds, secondsToMinutes } from "../lib/exerciseTypes";
import { programmeBasePath } from "../lib/programLead";
import styles from "./WorkoutSession.module.css";

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
      (e) => slugify(e.name) === targetSlug && e.sets?.length > 0
    );
    if (match) return match.sets;
  }
  return null;
}

// Cardio equivalent: the last { settings, durationSeconds, effort } logged
// for this exercise, wherever it was last done.
function findLastCardioForExercise(sessions, exerciseName) {
  const targetSlug = slugify(exerciseName);
  for (const session of sessions) {
    const match = session.exercises.find((e) => slugify(e.name) === targetSlug && e.cardio);
    if (match) return match.cardio;
  }
  return null;
}

// Cardio is one editable "row": the setting and total time. Settings
// prefill from last time (so progress carries forward), falling back to the
// trainer's target; time prefills from the programme's target.
function buildCardioRow({ targetSettings, targetSeconds, lastCardio }) {
  return [
    {
      settings: lastCardio?.settings ?? targetSettings ?? "",
      minutes: targetSeconds != null ? String(secondsToMinutes(targetSeconds)) : "",
      completed: false,
      effort: null,
    },
  ];
}

// Builds the editable set rows for one exercise slot — used both on initial
// load and when the user switches that slot to a different exercise, since
// both cases need the same last-time/default-value prefill logic.
// A plain rep count ("10") prefills the reps box; ranges like "8-12" or
// "AMRAP" don't, since there's no single number to put in.
function numericReps(targetReps) {
  return /^\d+$/.test(String(targetReps ?? "")) ? Number(targetReps) : null;
}

function buildSetRows({ targetSets, restSeconds, lastSets, startWeight, startReps }) {
  return Array.from({ length: targetSets }, (_, i) => {
    const last = lastSets?.[i] ?? lastSets?.[lastSets.length - 1];
    return {
      weight: last ? String(last.weight) : startWeight != null ? String(startWeight) : "",
      reps: last ? String(last.reps) : startReps != null ? String(startReps) : "",
      completed: false,
      effort: null,
      restSeconds,
    };
  });
}

// The live workout for one day. Shared by the client's own
// /programs/[programId]/day/[dayId] page and trainer mode's
// /trainer/clients/[userId]/programmes/[programId]/run/day/[dayId] — the
// `userId` route param is set only in the latter, where a trainer runs a
// trainer-led programme with their client in person. Those sessions are
// untimed: no elapsed workout timer, no rest countdowns, no duration saved.
export default function WorkoutSession() {
  const { programId, dayId, userId: clientUserId } = useParams();
  const untimed = !!clientUserId;
  const basePath = programmeBasePath(programId, clientUserId);
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
  // Adding and switching exercises change the programme itself, so they're
  // only offered on programmes the person running this workout created —
  // never on ones someone else built (e.g. a PT's programme for a client).
  const [canEdit, setCanEdit] = useState(false);
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
  const [pickerOpen, setPickerOpen] = useState(false);
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
      router.replace(basePath);
    }
  }, [runId, basePath, router]);

  useEffect(() => {
    if (!user || !runId) return;
    (async () => {
      try {
        const [{ program, canChangeExercises }, { sessions }, { exercises }] = await Promise.all([
          api.get(`/api/programs/${programId}`),
          // History (for last-time prefill) is the client's, not the trainer's.
          api.get("/api/sessions", clientUserId ? { userId: clientUserId } : undefined),
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
          if (isCardio(exercise)) {
            const lastCardio = findLastCardioForExercise(sessions, exercise.name);
            lastSetsByExerciseId[exercise.exerciseId] = lastCardio;
            initial[exercise.exerciseId] = buildCardioRow({
              targetSettings: exercise.settings,
              targetSeconds: exercise.targetSeconds,
              lastCardio,
            });
            continue;
          }
          const lastSets = findLastSetsForExercise(sessions, exercise.name);
          lastSetsByExerciseId[exercise.exerciseId] = lastSets;

          initial[exercise.exerciseId] = buildSetRows({
            targetSets: exercise.targetSets,
            restSeconds: exercise.restSeconds,
            lastSets,
            // First-time prefill comes from what the trainer set in the programme.
            startWeight: exercise.targetWeight,
            startReps: numericReps(exercise.targetReps),
          });
        }

        setProgram(program);
        setCanEdit(!!canChangeExercises);
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
  }, [user, programId, dayId, runId, clientUserId]);

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
        onContinue={() => (nextStage ? setSummaryStage(nextStage) : router.push(basePath))}
      />
    );
  }

  if (summaryStage === "week") {
    const nextStage = programSummary ? "program" : null;
    return (
      <WorkoutSummary
        title={`Week ${week} complete! 🎉`}
        subtitle={`${weekSummary.sessionCount} day${weekSummary.sessionCount === 1 ? "" : "s"} logged this week`}
        durationSeconds={untimed ? null : weekSummary.durationSeconds}
        totalWeightLifted={weekSummary.totalWeightLifted}
        averageWeight={weekSummary.averageWeight}
        averageEffort={weekSummary.averageEffort}
        continueLabel={nextStage ? "See programme summary →" : "Back to program"}
        onContinue={() => (nextStage ? setSummaryStage(nextStage) : router.push(basePath))}
      />
    );
  }

  if (summaryStage === "program") {
    return (
      <WorkoutSummary
        title="Programme complete! 🏆"
        subtitle={`${program.name} · ${programSummary.sessionCount} day${programSummary.sessionCount === 1 ? "" : "s"} logged in total`}
        durationSeconds={untimed ? null : programSummary.durationSeconds}
        totalWeightLifted={programSummary.totalWeightLifted}
        averageWeight={programSummary.averageWeight}
        averageEffort={programSummary.averageEffort}
        continueLabel="Back to program"
        onContinue={() => router.push(basePath)}
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

    if (isCardio(dayExercise)) {
      const lastCardio = findLastCardioForExercise(sessionsCache, newExercise.name);
      setDay((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId ? { ...e, name: newExercise.name, videoLink: null } : e
        ),
      }));
      setLastSetsByExerciseId((prev) => ({ ...prev, [exerciseId]: lastCardio }));
      setSetsByExercise((prev) => ({
        ...prev,
        // The slot's time target still applies; its settings were for the
        // original exercise, so only this exercise's own history carries over.
        [exerciseId]: buildCardioRow({ targetSettings: null, targetSeconds: dayExercise.targetSeconds, lastCardio }),
      }));
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
        // The slot's rep target still applies; its start weight was for the
        // original exercise, so it doesn't carry over to the swapped-in one.
        startWeight: null,
        startReps: numericReps(dayExercise.targetReps),
      }),
    }));
  };

  // Adding one mid-workout also persists to the programme (appended to this
  // day), so it's there every future time this day comes up too.
  const handleAddExercise = async (libraryExercise) => {
    setError("");
    let exercise;
    try {
      ({ exercise } = await api.post(`/api/programs/${programId}/exercises`, {
        dayId,
        name: libraryExercise.name,
        type: isCardio(libraryExercise) ? EXERCISE_TYPES.CARDIO : EXERCISE_TYPES.STRENGTH,
      }));
    } catch (err) {
      // Close the picker so the error (shown on the page) isn't hidden behind it.
      setPickerOpen(false);
      setError(err.message || "Could not add the exercise to the programme.");
      return;
    }

    if (isCardio(exercise)) {
      const lastCardio = findLastCardioForExercise(sessionsCache, exercise.name);
      setLastSetsByExerciseId((prev) => ({ ...prev, [exercise.exerciseId]: lastCardio }));
      setSetsByExercise((prev) => ({
        ...prev,
        [exercise.exerciseId]: buildCardioRow({ targetSettings: null, targetSeconds: exercise.targetSeconds, lastCardio }),
      }));
    } else {
      const lastSets = findLastSetsForExercise(sessionsCache, exercise.name);
      setLastSetsByExerciseId((prev) => ({ ...prev, [exercise.exerciseId]: lastSets }));
      setSetsByExercise((prev) => ({
        ...prev,
        [exercise.exerciseId]: buildSetRows({
          targetSets: exercise.targetSets,
          restSeconds: exercise.restSeconds,
          lastSets,
          startWeight: null,
          startReps: numericReps(exercise.targetReps),
        }),
      }));
    }
    setDay((prev) => ({ ...prev, exercises: [...prev.exercises, exercise] }));
  };

  const addedCounts = {};
  for (const e of day.exercises) addedCounts[e.name] = (addedCounts[e.name] ?? 0) + 1;

  const onSetField = (exerciseId, setIndex, field, value) => {
    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === setIndex ? { ...s, [field]: value } : s)),
    }));
  };

  const onLogSet = (exerciseId, setIndex) => {
    const exerciseIndex = day.exercises.findIndex((e) => e.exerciseId === exerciseId);
    const exercise = day.exercises[exerciseIndex];

    // Cardio: just mark it done and ask how it felt — no rest countdown.
    if (isCardio(exercise)) {
      setSetsByExercise((prev) => ({
        ...prev,
        [exerciseId]: prev[exerciseId].map((s) => ({ ...s, completed: true })),
      }));
      setEffortContext({ exerciseId, setIndex: 0 });
      return;
    }

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
    if (!isLastSetOverall && !untimed) {
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

          if (isCardio(exercise)) {
            const row = completedSets[0];
            const lastCardio = lastSetsByExerciseId[exercise.exerciseId];
            return {
              exerciseId: exercise.exerciseId,
              name: exercise.name,
              type: EXERCISE_TYPES.CARDIO,
              // No sets for cardio, so weight totals/averages simply skip it.
              sets: [],
              cardio: {
                settings: row.settings.trim() || null,
                durationSeconds: minutesToSeconds(row.minutes) ?? exercise.targetSeconds ?? 0,
                effort: row.effort ?? lastCardio?.effort ?? null,
                completedAt: new Date().toISOString(),
              },
            };
          }

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

      const durationSeconds = untimed ? null : Math.floor((Date.now() - startedAt) / 1000);
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
        const { sessions: runSessions } = await api.get("/api/sessions", { runId, ...(clientUserId && { userId: clientUserId }) });
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
      <AppHeader backHref={basePath} backLabel={program.name} />
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{day.label}</h1>
          {!untimed && (
            <span className={styles.timer}>
              <ElapsedTimer startedAt={startedAt} />
            </span>
          )}
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
            // Only offer swaps of the same kind (cardio ↔ cardio, strength ↔ strength).
            libraryEntries={exerciseLibraryList.filter((e) => isCardio(e) === isCardio(exercise))}
            onSetField={(setIndex, field, value) => onSetField(exercise.exerciseId, setIndex, field, value)}
            onLogSet={(setIndex) => onLogSet(exercise.exerciseId, setIndex)}
            onEditEffort={(setIndex) => onEditEffort(exercise.exerciseId, setIndex)}
            onApplyRestToAll={(secs) => onApplyRestToAll(exercise.exerciseId, secs)}
            showRest={!untimed}
            onSwitchExercise={canEdit ? (newExercise) => handleSwitchExercise(exercise.exerciseId, newExercise) : undefined}
          />
        ))}

        {canEdit && (
          <button type="button" className={styles.addExerciseButton} onClick={() => setPickerOpen(true)}>
            + Add exercise
          </button>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.finishButton} disabled={finishing} onClick={handleFinish}>
            {finishing ? "Saving…" : "Finish workout"}
          </button>
        </div>
      </main>

      {restOverlay && (
        <RestOverlay key={restOverlay.key} seconds={restOverlay.seconds} onClose={() => setRestOverlay(null)} />
      )}

      {pickerOpen && (
        <ExercisePicker
          library={exerciseLibraryList}
          addedCounts={addedCounts}
          onAdd={handleAddExercise}
          onClose={() => setPickerOpen(false)}
        />
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
