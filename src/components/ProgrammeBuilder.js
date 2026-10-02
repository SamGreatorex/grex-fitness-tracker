"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/apiClient";
import ExercisePicker from "./ExercisePicker";
import { EXERCISE_TYPES, isCardio, minutesToSeconds, secondsToMinutes } from "../lib/exerciseTypes";
import { PROGRAM_LEADS } from "../lib/programLead";
import styles from "./ProgrammeBuilder.module.css";

const LEAD_OPTIONS = [
  {
    value: PROGRAM_LEADS.USER,
    title: "User led",
    hint: "They run it themselves — starting workouts, logging sets and rating effort.",
  },
  {
    value: PROGRAM_LEADS.TRAINER,
    title: "Trainer led",
    hint: "You run it with them from trainer mode (no timers). They can view it but not start it.",
  },
];

let keyCounter = 0;
const newKey = () => `k${++keyCounter}`;

const DEFAULT_SETS = 3;
const DEFAULT_REPS = "10";
const DEFAULT_REST = 60;
const DEFAULT_CARDIO_MINUTES = 10;

function emptyDay(index) {
  return { key: newKey(), dayId: null, label: `Day ${index + 1}`, subtitle: "", exercises: [] };
}

// Stored programme → editable form state (every row gets a stable React key).
// `fromTemplate` starts a new programme from a template: a copy, so its days
// get fresh ids rather than the template's.
function toFormState(program, { fromTemplate = false } = {}) {
  if (!program) {
    return { name: "", goal: "", ledBy: PROGRAM_LEADS.USER, durationWeeks: 4, days: [emptyDay(0)] };
  }
  return {
    name: program.name ?? "",
    goal: program.goal ?? "",
    ledBy: program.ledBy ?? PROGRAM_LEADS.USER,
    durationWeeks: program.durationWeeks ?? 4,
    days: [...program.days]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((d) => ({
        key: newKey(),
        dayId: fromTemplate ? null : d.dayId,
        label: d.label ?? "",
        subtitle: d.subtitle ?? "",
        exercises: [...d.exercises]
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((e) =>
            isCardio(e)
              ? {
                  key: newKey(),
                  name: e.name,
                  type: EXERCISE_TYPES.CARDIO,
                  settings: e.settings ?? "",
                  minutes: secondsToMinutes(e.targetSeconds),
                }
              : {
                  key: newKey(),
                  name: e.name,
                  targetSets: e.targetSets ?? DEFAULT_SETS,
                  targetReps: e.targetReps ?? "",
                  targetWeight: e.targetWeight ?? "",
                  restSeconds: e.restSeconds ?? DEFAULT_REST,
                }
          ),
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
// exercises from the library. Used from trainer mode. With `isTemplate`,
// creates/edits a shared template instead (no owner). `template` prefills a
// new programme from a template. Client programmes also offer "Save as
// template", copying what's in the form into a new template. With
// `selfBuilt`, a user is building a programme for themselves: always
// user-led, and no templates. `deletedHref` is where to go after deleting
// (default: `backHref`).
export default function ProgrammeBuilder({
  ownerUserId,
  program,
  template,
  isTemplate = false,
  selfBuilt = false,
  backHref,
  deletedHref = backHref,
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => (program ? toFormState(program) : toFormState(template, { fromTemplate: true })));
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [notice, setNotice] = useState("");
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
    const item = isCardio(libraryExercise)
      ? { key: newKey(), name: libraryExercise.name, type: EXERCISE_TYPES.CARDIO, settings: "", minutes: DEFAULT_CARDIO_MINUTES }
      : {
          key: newKey(),
          name: libraryExercise.name,
          targetSets: DEFAULT_SETS,
          targetReps: DEFAULT_REPS,
          targetWeight: "",
          restSeconds: DEFAULT_REST,
        };
    updateDay(pickerDayKey, (d) => ({ ...d, exercises: [...d.exercises, item] }));
  };

  const pickerDay = form.days.find((d) => d.key === pickerDayKey);
  const addedCounts = useMemo(() => {
    const counts = {};
    for (const e of pickerDay?.exercises ?? []) counts[e.name] = (counts[e.name] ?? 0) + 1;
    return counts;
  }, [pickerDay]);

  const buildPayload = () => ({
      name: form.name,
      goal: form.goal,
      ledBy: form.ledBy,
      durationWeeks: Number(form.durationWeeks),
      days: form.days.map((d) => ({
        dayId: d.dayId,
        label: d.label,
        subtitle: d.subtitle,
        exercises: d.exercises.map((ex) =>
          isCardio(ex)
            ? { name: ex.name, type: EXERCISE_TYPES.CARDIO, settings: ex.settings, targetSeconds: minutesToSeconds(ex.minutes) }
            : {
                name: ex.name,
                targetSets: Number(ex.targetSets),
                targetReps: ex.targetReps,
                targetWeight: ex.targetWeight,
                restSeconds: Number(ex.restSeconds),
              }
        ),
      })),
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = { ...buildPayload(), ...(isTemplate ? { isTemplate: true } : { ownerUserId }) };
    try {
      if (program) await api.put(`/api/programs/${program.programId}`, payload);
      else await api.post("/api/programs", payload);
      router.push(backHref);
    } catch (err) {
      setError(err.message || "Could not save the programme.");
      setSaving(false);
    }
  };

  // Copies what's in the form now (saved or not) into a new shared template.
  // The client's programme itself is left as it is.
  const handleSaveAsTemplate = async () => {
    const name = window.prompt("Template name", form.name);
    if (name === null) return;
    setSavingTemplate(true);
    setError("");
    setNotice("");
    try {
      await api.post("/api/programs", { ...buildPayload(), name, isTemplate: true });
      setNotice(`Saved "${name.trim()}" as a template.`);
    } catch (err) {
      setError(err.message || "Could not save the template.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDelete = async () => {
    const message = isTemplate
      ? `Delete the "${program.name}" template? Programmes already created from it are kept.`
      : selfBuilt
        ? `Delete "${program.name}"? Your logged workouts are kept, but the programme is removed.`
        : `Delete "${program.name}"? Their logged workouts are kept, but the programme is removed.`;
    if (!window.confirm(message)) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/programs/${program.programId}`);
      router.push(deletedHref);
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
        {!selfBuilt && (
          <fieldset className={styles.leadChoice}>
            <legend className={styles.label}>Who runs it?</legend>
            {LEAD_OPTIONS.map((option) => (
              <label key={option.value} className={`${styles.leadOption} ${form.ledBy === option.value ? styles.leadOptionActive : ""}`}>
                <input
                  type="radio"
                  name="ledBy"
                  value={option.value}
                  checked={form.ledBy === option.value}
                  onChange={() => setField("ledBy", option.value)}
                />
                <span>
                  <span className={styles.leadTitle}>{option.title}</span>
                  <span className={styles.leadHint}>{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
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
                    {isCardio(ex) && <span className={styles.cardioBadge}>Cardio</span>}
                  </span>
                  <div className={styles.exerciseInputs}>
                    {isCardio(ex) ? (
                      <>
                        <label className={`${styles.miniField} ${styles.settingsField}`}>
                          <span>Settings</span>
                          <input
                            className={`${styles.miniInput} ${styles.settingsInput}`}
                            maxLength={60}
                            value={ex.settings}
                            onChange={(e) => updateExercise(day.key, ex.key, "settings", e.target.value)}
                            placeholder="e.g. 8 mph, incline 2"
                          />
                        </label>
                        <label className={styles.miniField}>
                          <span>Time (min)</span>
                          <input
                            className={styles.miniInput}
                            type="number"
                            inputMode="decimal"
                            required
                            min={0.5}
                            max={360}
                            step="0.5"
                            value={ex.minutes}
                            onChange={(e) => updateExercise(day.key, ex.key, "minutes", e.target.value)}
                          />
                        </label>
                      </>
                    ) : (
                      <>
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
                        <label className={styles.miniField}>
                          <span>Start kg</span>
                          <input
                            className={styles.miniInput}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={500}
                            step="0.1"
                            value={ex.targetWeight}
                            onChange={(e) => updateExercise(day.key, ex.key, "targetWeight", e.target.value)}
                            placeholder="—"
                            title={
                              selfBuilt
                                ? "Optional — prefills your first workout; your logged weights take over after that"
                                : "Optional — prefills the client's first workout; their logged weights take over after that"
                            }
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
                      </>
                    )}
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
      {notice && <div className={styles.notice}>{notice}</div>}

      <div className={styles.actions}>
        {program && (
          <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={deleting || saving}>
            {deleting ? "Deleting…" : isTemplate ? "Delete template" : "Delete programme"}
          </button>
        )}
        {!isTemplate && !selfBuilt && (
          <button type="button" className={styles.templateButton} onClick={handleSaveAsTemplate} disabled={savingTemplate || saving || deleting}>
            {savingTemplate ? "Saving template…" : "Save as template"}
          </button>
        )}
        <button type="submit" className={styles.saveButton} disabled={saving || deleting}>
          {saving ? "Saving…" : program ? "Save changes" : isTemplate ? "Create template" : "Create programme"}
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
