"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/apiClient";
import ExercisePicker from "./ExercisePicker";
import styles from "./ProgrammeBuilder.module.css";

let keyCounter = 0;
const newKey = () => `k${++keyCounter}`;

const DEFAULT_SETS = 3;
const DEFAULT_REPS = "10";
const DEFAULT_REST = 60;

function emptyDay(index) {
  return { key: newKey(), dayId: null, label: `Day ${index + 1}`, subtitle: "", exercises: [] };
}

// Stored programme → editable form state (every row gets a stable React key).
function toFormState(program) {
  if (!program) {
    return { name: "", goal: "", durationWeeks: 4, days: [emptyDay(0)] };
  }
  return {
    name: program.name ?? "",
    goal: program.goal ?? "",
    durationWeeks: program.durationWeeks ?? 4,
    days: [...program.days]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((d) => ({
        key: newKey(),
        dayId: d.dayId,
        label: d.label ?? "",
        subtitle: d.subtitle ?? "",
        exercises: [...d.exercises]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((e) => ({
            key: newKey(),
            name: e.name,
            targetSets: e.targetSets ?? DEFAULT_SETS,
            targetReps: e.targetReps ?? "",
            restSeconds: e.restSeconds ?? DEFAULT_REST,
          })),
      })),
  };
}

function move(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Create (no `program`) or edit a programme for `ownerUserId`, picking
// exercises from the library. Used from trainer mode.
export default function ProgrammeBuilder({ ownerUserId, program, backHref }) {
  const router = useRouter();
  const [form, setForm] = useState(() => toFormState(program));
  const [library, setLibrary] = useState(null);
  const [pickerDayKey, setPickerDayKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { exercises } = await api.get("/api/exercises");
        setLibrary(exercises);
      } catch (err) {
        setError(err.message || "Could not load the exercise library.");
      }
    })();
  }, []);

  const setField = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const updateDay = (dayKey, updater) =>
    setForm((f) => ({ ...f, days: f.days.map((d) => (d.key === dayKey ? updater(d) : d)) }));

  const updateExercise = (dayKey, exKey, field, value) =>
    updateDay(dayKey, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.key === exKey ? { ...e, [field]: value } : e)),
    }));

  const addDay = () => setForm((f) => ({ ...f, days: [...f.days, emptyDay(f.days.length)] }));

  const removeDay = (dayKey) => {
    const day = form.days.find((d) => d.key === dayKey);
    if (day.exercises.length > 0 && !window.confirm(`Remove ${day.label || "this day"} and its exercises?`)) return;
    setForm((f) => ({ ...f, days: f.days.filter((d) => d.key !== dayKey) }));
  };

  const addExercise = (libraryExercise) => {
    updateDay(pickerDayKey, (d) => ({
      ...d,
      exercises: [
        ...d.exercises,
        {
          key: newKey(),
          name: libraryExercise.name,
          targetSets: DEFAULT_SETS,
          targetReps: libraryExercise.defaultReps != null ? String(libraryExercise.defaultReps) : DEFAULT_REPS,
          restSeconds: DEFAULT_REST,
        },
      ],
    }));
  };

  const pickerDay = form.days.find((d) => d.key === pickerDayKey);
  const addedCounts = useMemo(() => {
    const counts = {};
    for (const e of pickerDay?.exercises ?? []) counts[e.name] = (counts[e.name] ?? 0) + 1;
    return counts;
  }, [pickerDay]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      ownerUserId,
      name: form.name,
      goal: form.goal,
      durationWeeks: Number(form.durationWeeks),
      days: form.days.map((d) => ({
        dayId: d.dayId,
        label: d.label,
        subtitle: d.subtitle,
        exercises: d.exercises.map((ex) => ({
          name: ex.name,
          targetSets: Number(ex.targetSets),
          targetReps: ex.targetReps,
          restSeconds: Number(ex.restSeconds),
        })),
      })),
    };
    try {
      if (program) await api.put(`/api/programs/${program.programId}`, payload);
      else await api.post("/api/programs", payload);
      router.push(backHref);
    } catch (err) {
      setError(err.message || "Could not save the programme.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${program.name}"? Their logged workouts are kept, but the programme is removed.`)) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/programs/${program.programId}`);
      router.push(backHref);
    } catch (err) {
      setError(err.message || "Could not delete the programme.");
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className={styles.form}>
      <section className={styles.card}>
        <label className={styles.field}>
          <span className={styles.label}>Programme name</span>
          <input
            className={styles.input}
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            placeholder="e.g. 12-week strength block"
          />
        </label>
        <div className={styles.row}>
          <label className={`${styles.field} ${styles.grow}`}>
            <span className={styles.label}>Goal</span>
            <input
              className={styles.input}
              maxLength={200}
              value={form.goal}
              onChange={(e) => setField("goal", e.target.value)}
              placeholder="e.g. Build muscle"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Weeks</span>
            <input
              className={`${styles.input} ${styles.small}`}
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={52}
              value={form.durationWeeks}
              onChange={(e) => setField("durationWeeks", e.target.value)}
            />
          </label>
        </div>
      </section>

      {form.days.map((day, dayIndex) => (
        <section key={day.key} className={styles.card}>
          <div className={styles.dayHeader}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span className={styles.label}>Day name</span>
                <input
                  className={`${styles.input} ${styles.medium}`}
                  maxLength={40}
                  value={day.label}
                  onChange={(e) => updateDay(day.key, (d) => ({ ...d, label: e.target.value }))}
                  placeholder={`Day ${dayIndex + 1}`}
                />
              </label>
              <label className={`${styles.field} ${styles.grow}`}>
                <span className={styles.label}>Focus (optional)</span>
                <input
                  className={styles.input}
                  maxLength={100}
                  value={day.subtitle}
                  onChange={(e) => updateDay(day.key, (d) => ({ ...d, subtitle: e.target.value }))}
                  placeholder="e.g. Upper body"
                />
              </label>
            </div>
            <div className={styles.iconButtons}>
              <IconButton label="Move day up" disabled={dayIndex === 0} onClick={() => setForm((f) => ({ ...f, days: move(f.days, dayIndex, -1) }))}>
                ↑
              </IconButton>
              <IconButton
                label="Move day down"
                disabled={dayIndex === form.days.length - 1}
                onClick={() => setForm((f) => ({ ...f, days: move(f.days, dayIndex, 1) }))}
              >
                ↓
              </IconButton>
              <IconButton label="Remove day" disabled={form.days.length === 1} onClick={() => removeDay(day.key)}>
                ×
              </IconButton>
            </div>
          </div>

          {day.exercises.length === 0 ? (
            <p className={styles.emptyDay}>No exercises yet.</p>
          ) : (
            <ol className={styles.exerciseList}>
              {day.exercises.map((ex, exIndex) => (
                <li key={ex.key} className={styles.exerciseRow}>
                  <span className={styles.exerciseName}>
                    <span className={styles.exerciseIndex}>{exIndex + 1}</span>
                    {ex.name}
                  </span>
                  <div className={styles.exerciseInputs}>
                    <NumberField
                      label="Sets"
                      min={1}
                      max={20}
                      value={ex.targetSets}
                      onChange={(v) => updateExercise(day.key, ex.key, "targetSets", v)}
                    />
                    <label className={styles.miniField}>
                      <span>Reps</span>
                      <input
                        className={styles.miniInput}
                        maxLength={20}
                        value={ex.targetReps}
                        onChange={(e) => updateExercise(day.key, ex.key, "targetReps", e.target.value)}
                        placeholder="8-12"
                      />
                    </label>
                    <NumberField
                      label="Rest (s)"
                      min={0}
                      max={600}
                      step={5}
                      value={ex.restSeconds}
                      onChange={(v) => updateExercise(day.key, ex.key, "restSeconds", v)}
                    />
                    <div className={styles.iconButtons}>
                      <IconButton
                        label="Move exercise up"
                        disabled={exIndex === 0}
                        onClick={() => updateDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, exIndex, -1) }))}
                      >
                        ↑
                      </IconButton>
                      <IconButton
                        label="Move exercise down"
                        disabled={exIndex === day.exercises.length - 1}
                        onClick={() => updateDay(day.key, (d) => ({ ...d, exercises: move(d.exercises, exIndex, 1) }))}
                      >
                        ↓
                      </IconButton>
                      <IconButton
                        label="Remove exercise"
                        onClick={() => updateDay(day.key, (d) => ({ ...d, exercises: d.exercises.filter((e) => e.key !== ex.key) }))}
                      >
                        ×
                      </IconButton>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <button type="button" className={styles.addButton} disabled={!library} onClick={() => setPickerDayKey(day.key)}>
            {library ? "+ Add exercises" : "Loading exercise library…"}
          </button>
        </section>
      ))}

      {form.days.length < 7 && (
        <button type="button" className={styles.addDayButton} onClick={addDay}>
          + Add day
        </button>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.actions}>
        {program && (
          <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={deleting || saving}>
            {deleting ? "Deleting…" : "Delete programme"}
          </button>
        )}
        <button type="submit" className={styles.saveButton} disabled={saving || deleting}>
          {saving ? "Saving…" : program ? "Save changes" : "Create programme"}
        </button>
      </div>

      {pickerDay && library && (
        <ExercisePicker library={library} addedCounts={addedCounts} onAdd={addExercise} onClose={() => setPickerDayKey(null)} />
      )}
    </form>
  );
}

function IconButton({ label, children, ...props }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }) {
  return (
    <label className={styles.miniField}>
      <span>{label}</span>
      <input
        className={styles.miniInput}
        type="number"
        inputMode="numeric"
        required
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
