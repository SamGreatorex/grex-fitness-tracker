// Shared stat helpers for a session's `exercises` array (same shape whether
// it's the in-progress payload about to be posted, or a saved session
// fetched back from the API): [{ sets: [{ weight, reps, effort, drops }] }].
//
// A drop set is part of the set it follows: set.drops is
// [{ weight, reps, effort }] — the same weight/reps/effort, one per drop.
// Each part counts on its own: its reps × weight towards volume, its weight
// and effort towards averages.

// A set and its drops, as one list of { weight, reps, effort } parts.
export function setParts(set) {
  return [set, ...(set.drops ?? [])];
}

// Every part of every set of an exercise.
export function exerciseParts(exercise) {
  return (exercise.sets ?? []).flatMap(setParts);
}

// Total weight lifted (kg): reps × weight over every set and drop.
export function totalWeightLiftedOf(exercises) {
  return exercises.reduce(
    (sum, ex) => sum + exerciseParts(ex).reduce((s, part) => s + (Number(part.weight) || 0) * (Number(part.reps) || 0), 0),
    0
  );
}

// Effort covers strength sets, their drops, and cardio (one rating per
// cardio exercise).
export function averageEffortOf(exercises) {
  const efforts = exercises
    .flatMap((ex) => [...exerciseParts(ex).map((s) => s.effort), ex.cardio?.effort])
    .filter((e) => e != null);
  if (efforts.length === 0) return null;
  return efforts.reduce((sum, e) => sum + e, 0) / efforts.length;
}

export function averageWeightOf(exercises) {
  const weights = exercises.flatMap((ex) => exerciseParts(ex).map((s) => s.weight)).filter((w) => w != null);
  if (weights.length === 0) return null;
  return weights.reduce((sum, w) => sum + w, 0) / weights.length;
}

// Rolls up several whole sessions (e.g. every session logged this week, or
// this entire run) into the same shape WorkoutSummary already knows how to
// render.
export function aggregateSessionStats(sessions) {
  const allExercises = sessions.flatMap((s) => s.exercises);
  return {
    sessionCount: sessions.length,
    totalWeightLifted: sessions.reduce((sum, s) => sum + (s.totalWeightLifted || 0), 0),
    averageWeight: averageWeightOf(allExercises),
    averageEffort: averageEffortOf(allExercises),
    durationSeconds: sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
  };
}
