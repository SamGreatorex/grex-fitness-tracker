import { LIFT_UNITS, setWeightIn } from "./units";
import { secondsToMinutes } from "./exerciseTypes";
import { slugify } from "./slugify";

// How each exercise has changed, for the workout summaries: a finished (or
// past) workout against the last time each exercise was done — every set's
// and drop's weight and effort — and, for the week summary, each exercise
// week by week through the programme.

// The sets logged the last `count` times this exact exercise was done,
// most recent first — any program, any day. `sessions` must already be
// sorted most recent first (the sessions API returns them that way).
export function findRecentSetsForExercise(sessions, exerciseName, count) {
  const targetSlug = slugify(exerciseName);
  const found = [];
  for (const session of sessions) {
    const match = session.exercises.find((e) => slugify(e.name) === targetSlug && e.sets?.length > 0);
    if (match) found.push(match.sets);
    if (found.length === count) break;
  }
  return found;
}

// The most recently logged sets for this exact exercise, wherever it was
// last done, or null.
export function findLastSetsForExercise(sessions, exerciseName) {
  return findRecentSetsForExercise(sessions, exerciseName, 1)[0] ?? null;
}

// Cardio equivalent: the last { settings, durationSeconds, effort } logged
// for this exercise, wherever it was last done.
export function findLastCardioForExercise(sessions, exerciseName) {
  const targetSlug = slugify(exerciseName);
  for (const session of sessions) {
    const match = session.exercises.find((e) => slugify(e.name) === targetSlug && e.cardio);
    if (match) return match.cardio;
  }
  return null;
}

const round1 = (n) => Math.round(n * 10) / 10;
const minutesOf = (seconds) => (seconds == null ? null : secondsToMinutes(seconds));

const FIRST_TIME = "First time — nothing to compare yet";

// Effort averages closer than this count as the same (here, and for the
// workout recommendations).
export const EFFORT_SAME = 0.25;

// { value, change }: a value, and how far it moved from the one before
// (null if either side is missing, so there's nothing to compare).
// `sameWithin`: smaller moves count as no change (for averages).
function compared(value, before, sameWithin = 0) {
  if (value == null) return { value: null, change: null };
  if (before == null) return { value: round1(value), change: null };
  const diff = value - before;
  return { value: round1(value), change: Math.abs(diff) < sameWithin ? 0 : round1(diff) };
}

// Each comparison is a small table, the same shape for both summaries:
//   { key, name, first, note, unit, columns: { row, amount, effort }, rows }
// rows: [{ label, drop, amount: { value, change }, effort: { value, change } }]
// `amount` is a weight (in `unit`: kg, or lb if logged in lb) or, for
// cardio, minutes (unit "min"). Effort going down means it felt easier.
const liftUnitOf = (sets) => (sets.some((s) => s.unit === LIFT_UNITS.LB) ? LIFT_UNITS.LB : LIFT_UNITS.KG);

// One set or drop's row: its weight and effort, against the matching set
// or drop last time (`before`, if there was one).
function partRow(label, part, before, unit, drop = false) {
  return {
    label,
    drop,
    amount: compared(setWeightIn(part, unit), before ? setWeightIn(before, unit) : null),
    effort: compared(part.effort, before?.effort),
  };
}

// `exercise`: as saved today ({ sets } or { cardio }). `last`: what was
// logged last time — its sets array for strength, its cardio object for
// cardio — or null if it's never been done before.
//
// Strength: a row per set, and one per drop set straight after it. Set n
// is compared with set n last time, and its drops with that set's drops in
// order; anything with no match has change null. Cardio: one row, its time
// and effort.
export function exerciseChange(exercise, last) {
  const base = { key: exercise.exerciseId, name: exercise.name };

  if (exercise.cardio) {
    return {
      ...base,
      first: !last,
      note: last ? null : FIRST_TIME,
      unit: "min",
      columns: { row: "", amount: "Time (min)", effort: "Effort" },
      rows: [
        {
          label: "",
          drop: false,
          amount: compared(minutesOf(exercise.cardio.durationSeconds), minutesOf(last?.durationSeconds)),
          effort: compared(exercise.cardio.effort, last?.effort),
        },
      ],
    };
  }

  const lastSets = last ?? [];
  const unit = liftUnitOf(exercise.sets);
  const rows = exercise.sets.flatMap((set, i) => [
    partRow(String(i + 1), set, lastSets[i], unit),
    ...(set.drops ?? []).map((drop, j) => partRow("↳", drop, lastSets[i]?.drops?.[j], unit, true)),
  ]);
  const first = lastSets.length === 0;
  return { ...base, first, note: first ? FIRST_TIME : null, unit, columns: { row: "Set", amount: `Weight (${unit})`, effort: "Effort" }, rows };
}

// For a logged session: how each of its exercises compares with the last
// time it was done before it. `history` is the user's sessions, newest
// first; only ones completed before `session` count.
export function sessionExerciseChanges(session, history) {
  const earlier = history.filter((s) => s.sessionId !== session.sessionId && s.completedAt < session.completedAt);
  return session.exercises.map((ex) =>
    exerciseChange(ex, ex.cardio ? findLastCardioForExercise(earlier, ex.name) : findLastSetsForExercise(earlier, ex.name))
  );
}

// Week by week, for the week summary: every exercise done in this run up to
// week `throughWeek`, with a row per week — its heaviest set (or, cardio,
// total time) and average effort across every set and drop that week,
// against the last week it was done before. Weeks it wasn't done show
// blank. An exercise done on several days counts once per week.
// `sessions`: the run's sessions, any order.
export function weeklyExerciseProgress(sessions, throughWeek) {
  const weeks = Array.from({ length: throughWeek }, (_, i) => i + 1);
  // slug → { name, cardio, byWeek: Map(week → exercise entries) }, in the
  // order exercises were first done.
  const exercises = new Map();
  const inOrder = [...sessions].filter((s) => s.week <= throughWeek).sort((a, b) => a.week - b.week || a.completedAt.localeCompare(b.completedAt));
  for (const session of inOrder) {
    for (const ex of session.exercises) {
      const slug = slugify(ex.name);
      if (!exercises.has(slug)) exercises.set(slug, { name: ex.name, cardio: !!ex.cardio, byWeek: new Map() });
      const entry = exercises.get(slug);
      if (!entry.byWeek.has(session.week)) entry.byWeek.set(session.week, []);
      entry.byWeek.get(session.week).push(ex);
    }
  }

  return [...exercises].map(([slug, { name, cardio, byWeek }]) => {
    // Weights in the unit of the latest week's sets (lb if logged in lb).
    const latest = byWeek.get(Math.max(...byWeek.keys()));
    const unit = cardio ? "min" : liftUnitOf(latest.flatMap((ex) => ex.sets ?? []));

    const totals = (entries) => {
      if (!entries) return { amount: null, effort: null };
      const parts = entries.flatMap((ex) => (ex.sets ?? []).flatMap((s) => [s, ...(s.drops ?? [])]));
      const efforts = [...parts.map((p) => p.effort), ...entries.map((ex) => ex.cardio?.effort)].filter((e) => e != null);
      const effort = efforts.length ? efforts.reduce((a, b) => a + b, 0) / efforts.length : null;
      if (cardio) {
        return { amount: minutesOf(entries.reduce((sum, ex) => sum + (ex.cardio?.durationSeconds ?? 0), 0)), effort };
      }
      // Heaviest set — drop sets are lighter by design.
      const weights = entries.flatMap((ex) => ex.sets ?? []).map((s) => setWeightIn(s, unit)).filter((w) => w != null);
      return { amount: weights.length ? Math.max(...weights) : null, effort };
    };

    let previous = { amount: null, effort: null };
    const rows = weeks.map((week) => {
      const current = totals(byWeek.get(week));
      const row = {
        label: `Wk ${week}`,
        drop: false,
        amount: compared(current.amount, previous.amount),
        effort: compared(current.effort, previous.effort, EFFORT_SAME),
      };
      // Compare with the last week it was actually done.
      if (current.amount != null) previous = { ...previous, amount: current.amount };
      if (current.effort != null) previous = { ...previous, effort: current.effort };
      return row;
    });

    return {
      key: slug,
      name,
      first: byWeek.size < 2,
      note: byWeek.size < 2 ? "Only done in one week so far" : null,
      unit,
      columns: { row: "Week", amount: cardio ? "Total time (min)" : `Top weight (${unit})`, effort: "Avg. effort" },
      rows,
    };
  });
}
