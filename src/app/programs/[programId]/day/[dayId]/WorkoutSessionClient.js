"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "../../../../../components/AuthProvider";
import { api } from "../../../../../lib/apiClient";
import AppHeader from "../../../../../components/AppHeader";
import ExerciseCard from "../../../../../components/ExerciseCard";
import ElapsedTimer from "../../../../../components/ElapsedTimer";
import RestTimer from "../../../../../components/RestTimer";
import { slugify } from "../../../../../lib/slugify";
import styles from "./page.module.css";

export default function WorkoutSessionClient() {
  const { programId, dayId } = useParams();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const week = Number(searchParams.get("week")) || 1;
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  const [program, setProgram] = useState(null);
  const [day, setDay] = useState(null);
  const [lastSession, setLastSession] = useState(null);
  const [exerciseLibrary, setExerciseLibrary] = useState({});
  const [setsByExercise, setSetsByExercise] = useState(null);
  const [startedAt] = useState(() => Date.now());
  const [restFor, setRestFor] = useState(null);
  const [finishing, setFinishing] = useState(false);
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
        const [{ program }, { session }, { exercises }] = await Promise.all([
          api.get(`/api/programs/${programId}`),
          api.get("/api/sessions/last", { programId, dayId }),
          api.get("/api/exercises"),
        ]);
        const foundDay = program.days.find((d) => d.dayId === dayId);
        if (!foundDay) {
          setError("Day not found in this program.");
          return;
        }

        const initial = {};
        for (const exercise of foundDay.exercises) {
          initial[exercise.exerciseId] = Array.from({ length: exercise.targetSets }, () => ({
            weight: "",
            reps: "",
            completed: false,
          }));
        }

        const libraryBySlug = {};
        for (const libraryExercise of exercises) {
          libraryBySlug[libraryExercise.exerciseId] = libraryExercise;
        }

        setProgram(program);
        setDay(foundDay);
        setLastSession(session);
        setExerciseLibrary(libraryBySlug);
        setSetsByExercise(initial);
      } catch (err) {
        setError(err.message || "Could not load workout.");
      }
    })();
  }, [user, programId, dayId, runId]);

  if (sessionLoading || !user || !program || !day || !setsByExercise) return null;

  const lastSetsFor = (exerciseId) =>
    lastSession?.exercises.find((e) => e.exerciseId === exerciseId)?.sets;

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

    setSetsByExercise((prev) => ({
      ...prev,
      [exerciseId]: prev[exerciseId].map((s, i) => (i === setIndex ? { ...s, completed: true } : s)),
    }));

    if (!isLastSetOverall) {
      setRestFor(exercise.restSeconds);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setError("");
    try {
      const dayOrder = program.days.findIndex((d) => d.dayId === dayId);
      const exercises = day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        sets: setsByExercise[exercise.exerciseId]
          .filter((s) => s.completed)
          .map((s) => ({
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            restSeconds: exercise.restSeconds,
            completedAt: new Date().toISOString(),
          })),
      }));

      await api.post("/api/sessions", {
        runId,
        programId,
        dayId,
        dayName: day.label,
        week,
        startedAt: new Date(startedAt).toISOString(),
        durationSeconds: Math.floor((Date.now() - startedAt) / 1000),
        exercises,
        dayOrder,
        totalDaysInProgram: program.days.length,
        durationWeeks: program.durationWeeks,
      });

      router.push(`/programs/${programId}`);
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
            onSetField={(setIndex, field, value) => onSetField(exercise.exerciseId, setIndex, field, value)}
            onLogSet={(setIndex) => onLogSet(exercise.exerciseId, setIndex)}
          />
        ))}

        <div className={styles.footer}>
          <button type="button" className={styles.finishButton} disabled={finishing} onClick={handleFinish}>
            {finishing ? "Saving…" : "Finish workout"}
          </button>
        </div>
      </main>

      {restFor != null && (
        <RestTimer seconds={restFor} onClose={() => setRestFor(null)} />
      )}
    </>
  );
}
