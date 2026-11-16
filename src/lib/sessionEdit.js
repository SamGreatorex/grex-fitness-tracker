import { CARDIO_LIMITS } from "./exerciseTypes";
import { LIFT_UNITS, lbToKg } from "./units";
import { totalWeightLiftedOf } from "./sessionStats";

// Editing an already-logged workout: only what was logged changes — the
// weight, reps and effort of each set and its drop sets (sets and drops can
// be added or removed), or a cardio exercise's settings, time and effort.
// Which exercises it holds, its day, week and run never change, so
// programme progress is unaffected.

export const SESSION_EDIT_LIMITS = { sets: 30, dropsPerSet: 10, weightKg: 1000, reps: 1000 };

const isInt = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

function effortOf(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return isInt(n, 1, 10) ? n : undefined;
}

// One set or drop's weight (kg, plus the lb typed if entered in lb), reps
// and effort — or { error }.
function partOf(raw, label) {
  const inLb = raw?.unit === LIFT_UNITS.LB;
  // lb: the number typed is the truth; kg is worked out from it here.
  const entered = Number(inLb ? raw.weightEntered : raw?.weight);
  if (!Number.isFinite(entered) || entered < 0) return { error: `${label}: enter a weight` };
  const weight = inLb ? lbToKg(entered) : Math.round(entered * 100) / 100;
  if (weight > SESSION_EDIT_LIMITS.weightKg) return { error: `${label}: weight is too high` };
  const reps = Number(raw?.reps);
  if (!isInt(reps, 0, SESSION_EDIT_LIMITS.reps)) return { error: `${label}: reps must be a whole number` };
  const effort = effortOf(raw?.effort);
  if (effort === undefined) return { error: `${label}: effort must be 1–10` };
  return { part: { weight, ...(inLb && { unit: LIFT_UNITS.LB, weightEntered: entered }), reps, effort } };
}

// Merges the submitted exercises onto the stored ones (matched by
// exerciseId; exercises not submitted are kept as they were). Returns
// { exercises, totalWeightLifted } or { error }.
export function applySessionEdit(stored, submitted) {
  if (!Array.isArray(submitted)) return { error: "exercises must be a list" };
  const byId = new Map(submitted.map((e) => [String(e?.exerciseId), e]));
  const now = new Date().toISOString();
  const exercises = [];

  for (const original of stored.exercises) {
    const edit = byId.get(String(original.exerciseId));
    if (!edit) {
      exercises.push(original);
      continue;
    }
    const name = original.name;

    if (original.cardio) {
      const c = edit.cardio ?? {};
      const settings = String(c.settings ?? "").trim();
      if (settings.length > CARDIO_LIMITS.settingsLength) {
        return { error: `${name}: settings must be at most ${CARDIO_LIMITS.settingsLength} characters` };
      }
      const durationSeconds = Number(c.durationSeconds);
      if (!isInt(durationSeconds, 1, CARDIO_LIMITS.maxSeconds)) return { error: `${name}: enter a time (up to 6 hours)` };
      const effort = effortOf(c.effort);
      if (effort === undefined) return { error: `${name}: effort must be 1–10` };
      exercises.push({ ...original, cardio: { ...original.cardio, settings: settings || null, durationSeconds, effort } });
      continue;
    }

    const rawSets = Array.isArray(edit.sets) ? edit.sets : [];
    if (rawSets.length > SESSION_EDIT_LIMITS.sets) return { error: `${name}: at most ${SESSION_EDIT_LIMITS.sets} sets` };
    const sets = [];
    for (const [i, raw] of rawSets.entries()) {
      const label = `${name} · set ${i + 1}`;
      const { part, error } = partOf(raw, label);
      if (error) return { error };
      const before = original.sets?.[i];

      const rawDrops = Array.isArray(raw?.drops) ? raw.drops : [];
      if (rawDrops.length > SESSION_EDIT_LIMITS.dropsPerSet) {
        return { error: `${label}: at most ${SESSION_EDIT_LIMITS.dropsPerSet} drop sets` };
      }
      const drops = [];
      for (const [j, rawDrop] of rawDrops.entries()) {
        const dropResult = partOf(rawDrop, `${label} · drop ${j + 1}`);
        if (dropResult.error) return { error: dropResult.error };
        drops.push({ ...dropResult.part, completedAt: before?.drops?.[j]?.completedAt ?? before?.completedAt ?? now });
      }

      sets.push({
        ...part,
        restSeconds: before?.restSeconds ?? original.sets?.[0]?.restSeconds ?? null,
        completedAt: before?.completedAt ?? now,
        ...(drops.length > 0 && { drops }),
      });
    }
    exercises.push({ ...original, sets });
  }

  return { exercises, totalWeightLifted: totalWeightLiftedOf(exercises) };
}
