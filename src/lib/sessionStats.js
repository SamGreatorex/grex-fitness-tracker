// Shared stat helpers for a session's `exercises` array (same shape whether
// it's the in-progress payload about to be posted, or a saved session
// fetched back from the API): [{ sets: [{ weight, reps, effort }] }].

export function averageEffortOf(exercises) {
  const efforts = exercises.flatMap((ex) => ex.sets.map((s) => s.effort)).filter((e) => e != null);
  if (efforts.length === 0) return null;
  return efforts.reduce((sum, e) => sum + e, 0) / efforts.length;
}

export function averageWeightOf(exercises) {
  const weights = exercises.flatMap((ex) => ex.sets.map((s) => s.weight)).filter((w) => w != null);
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
