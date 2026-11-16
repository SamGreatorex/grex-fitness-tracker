"use client";

import { useState } from "react";
import { api } from "../lib/apiClient";
import { LIFT_UNITS, convertTypedWeight, setWeightIn } from "../lib/units";
import { minutesToSeconds, secondsToMinutes } from "../lib/exerciseTypes";
import styles from "./SessionEditor.module.css";

const str = (v) => (v === null || v === undefined ? "" : String(v));

// Stored session → editable form: weights in each exercise's own unit (lb
// if it was logged in lb), everything as strings for the inputs.
function toForm(session) {
  return session.exercises.map((ex) => {
    if (ex.cardio) {
      return {
        exerciseId: ex.exerciseId,
        name: ex.name,
        cardio: { settings: ex.cardio.settings ?? "", minutes: str(secondsToMinutes(ex.cardio.durationSeconds)), effort: str(ex.cardio.effort) },
      };
    }
    const unit = ex.sets.some((s) => s.unit === LIFT_UNITS.LB) ? LIFT_UNITS.LB : LIFT_UNITS.KG;
    const toFields = (part) => ({ weight: str(setWeightIn(part, unit)), reps: str(part.reps), effort: str(part.effort) });
    return {
      exerciseId: ex.exerciseId,
      name: ex.name,
      unit,
      sets: ex.sets.map((s) => ({ ...toFields(s), drops: (s.drops ?? []).map(toFields) })),
    };
  });
}

// A set or drop as the API takes it: the weight as typed, in the exercise's unit.
function partPayload(part, unit) {
  return {
    ...(unit === LIFT_UNITS.LB ? { unit: LIFT_UNITS.LB, weightEntered: part.weight } : { weight: part.weight }),
    reps: part.reps,
    effort: part.effort || null,
  };
}

// Form → what PUT /api/sessions/[sessionId] takes.
function toPayload(form) {
  return form.map((ex) =>
    ex.cardio
      ? {
          exerciseId: ex.exerciseId,
          cardio: { settings: ex.cardio.settings, durationSeconds: minutesToSeconds(ex.cardio.minutes), effort: ex.cardio.effort || null },
        }
      : {
          exerciseId: ex.exerciseId,
          sets: ex.sets.map((s) => ({ ...partPayload(s, ex.unit), drops: s.drops.map((d) => partPayload(d, ex.unit)) })),
        }
  );
}

// Edit an already-logged workout: each set's and drop set's weight (kg or
// lb), reps and effort, adding or removing sets and drops; or a cardio
// exercise's settings, time and effort. `userId` is set when a trainer edits a client's workout.
// onSaved(updatedSession) / onCancel().
export default function SessionEditor({ session, userId, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toForm(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateExercise = (index, updater) => setForm((f) => f.map((ex, i) => (i === index ? updater(ex) : ex)));
  const updateSet = (exIndex, setIndex, field, value) =>
    updateExercise(exIndex, (ex) => ({ ...ex, sets: ex.sets.map((s, i) => (i === setIndex ? { ...s, [field]: value } : s)) }));

  const updateDrops = (exIndex, setIndex, updater) =>
    updateExercise(exIndex, (ex) => ({ ...ex, sets: ex.sets.map((s, i) => (i === setIndex ? { ...s, drops: updater(s.drops, s) } : s)) }));
  const updateDrop = (exIndex, setIndex, dropIndex, field, value) =>
    updateDrops(exIndex, setIndex, (drops) => drops.map((d, j) => (j === dropIndex ? { ...d, [field]: value } : d)));

  const switchUnit = (exIndex, unit) => {
    const convert = (part, from) => ({ ...part, weight: convertTypedWeight(part.weight, from, unit) });
    updateExercise(exIndex, (ex) =>
      ex.unit === unit ? ex : { ...ex, unit, sets: ex.sets.map((s) => ({ ...convert(s, ex.unit), drops: s.drops.map((d) => convert(d, ex.unit)) })) }
    );
  };

  // A new set starts as a copy of the last one — usually the same again —
  // but without its drop sets.
  const addSet = (exIndex) =>
    updateExercise(exIndex, (ex) => {
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, last ? { ...last, drops: [] } : { weight: "", reps: "", effort: "", drops: [] }] };
    });

  const removeSet = (exIndex, setIndex) => updateExercise(exIndex, (ex) => ({ ...ex, sets: ex.sets.filter((_, i) => i !== setIndex) }));

  // A new drop starts at the reps of the part before it, with the weight and
  // effort left to fill in.
  const addDrop = (exIndex, setIndex) =>
    updateDrops(exIndex, setIndex, (drops, set) => [...drops, { weight: "", reps: (drops[drops.length - 1] ?? set).reps, effort: "" }]);

  const removeDrop = (exIndex, setIndex, dropIndex) => updateDrops(exIndex, setIndex, (drops) => drops.filter((_, j) => j !== dropIndex));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { session: updated } = await api.put(`/api/sessions/${encodeURIComponent(session.sessionId)}`, {
        exercises: toPayload(form),
        ...(userId && { userId }),
      });
      onSaved(updated);
    } catch (err) {
      setError(err.message || "Could not save your changes.");
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={save}>
      {form.map((ex, exIndex) => (
        <div key={ex.exerciseId} className={styles.exercise}>
          <div className={styles.exerciseHeader}>
            <p className={styles.exerciseName}>{ex.name}</p>
            {!ex.cardio && (
              <span className={styles.unitToggle} role="group" aria-label={`Weight unit for ${ex.name}`}>
                {[LIFT_UNITS.KG, LIFT_UNITS.LB].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    aria-pressed={ex.unit === unit}
                    className={`${styles.unitOption} ${ex.unit === unit ? styles.unitOptionActive : ""}`}
                    onClick={() => switchUnit(exIndex, unit)}
                  >
                    {unit}
                  </button>
                ))}
              </span>
            )}
          </div>

          {ex.cardio ? (
            <div className={styles.cardioRow}>
              <label className={styles.field}>
                <span>Settings</span>
                <input
                  className={styles.input}
                  maxLength={60}
                  value={ex.cardio.settings}
                  onChange={(e) => updateExercise(exIndex, (x) => ({ ...x, cardio: { ...x.cardio, settings: e.target.value } }))}
                  placeholder="e.g. 8 mph"
                />
              </label>
              <label className={styles.field}>
                <span>Time (min)</span>
                <input
                  className={styles.input}
                  type="number"
                  inputMode="decimal"
                  min="0.5"
                  step="0.5"
                  required
                  value={ex.cardio.minutes}
                  onChange={(e) => updateExercise(exIndex, (x) => ({ ...x, cardio: { ...x.cardio, minutes: e.target.value } }))}
                />
              </label>
              <label className={styles.field}>
                <span>Effort</span>
                <EffortInput
                  value={ex.cardio.effort}
                  onChange={(v) => updateExercise(exIndex, (x) => ({ ...x, cardio: { ...x.cardio, effort: v } }))}
                />
              </label>
            </div>
          ) : (
            <>
              <div className={styles.setsHeader}>
                <span>Set</span>
                <span>Weight ({ex.unit})</span>
                <span>Reps</span>
                <span>Effort</span>
                <span />
              </div>
              {ex.sets.map((set, setIndex) => (
                <div key={setIndex}>
                  <PartRow
                    marker={<span className={styles.setIndex}>{setIndex + 1}</span>}
                    part={set}
                    unit={ex.unit}
                    label={`Set ${setIndex + 1}`}
                    onChange={(field, value) => updateSet(exIndex, setIndex, field, value)}
                    onRemove={() => removeSet(exIndex, setIndex)}
                  />
                  {set.drops.map((drop, dropIndex) => (
                    <PartRow
                      key={dropIndex}
                      marker={
                        <span className={styles.dropMark} title="Drop set">
                          ↳
                        </span>
                      }
                      part={drop}
                      unit={ex.unit}
                      label={`Set ${setIndex + 1} drop ${dropIndex + 1}`}
                      onChange={(field, value) => updateDrop(exIndex, setIndex, dropIndex, field, value)}
                      onRemove={() => removeDrop(exIndex, setIndex, dropIndex)}
                    />
                  ))}
                  <button type="button" className={styles.addDrop} onClick={() => addDrop(exIndex, setIndex)}>
                    + Drop set
                  </button>
                </div>
              ))}
              {ex.sets.length === 0 && <p className={styles.noSets}>No sets — add one, or save to leave this exercise empty.</p>}
              <button type="button" className={styles.addSet} onClick={() => addSet(exIndex)}>
                + Add set
              </button>
            </>
          )}
        </div>
      ))}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={styles.save} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

// One set or drop set: marker · weight · reps · effort · remove.
function PartRow({ marker, part, unit, label, onChange, onRemove }) {
  return (
    <div className={styles.setRow}>
      {marker}
      <input
        className={styles.input}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.1"
        required
        value={part.weight}
        onChange={(e) => onChange("weight", e.target.value)}
        aria-label={`${label} weight in ${unit}`}
      />
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        required
        value={part.reps}
        onChange={(e) => onChange("reps", e.target.value)}
        aria-label={`${label} reps`}
      />
      <EffortInput value={part.effort} onChange={(v) => onChange("effort", v)} label={`${label} effort`} />
      <button type="button" className={styles.removeSet} onClick={onRemove} aria-label={`Remove ${label.toLowerCase()}`} title="Remove">
        ×
      </button>
    </div>
  );
}

// Effort 1–10, or blank for "not rated".
function EffortInput({ value, onChange, label = "Effort" }) {
  return (
    <input
      className={styles.input}
      type="number"
      inputMode="numeric"
      min="1"
      max="10"
      step="1"
      placeholder="–"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${label}, 1 to 10`}
    />
  );
}
