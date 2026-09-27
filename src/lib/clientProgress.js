// Pure helpers that turn a client's programmes, runs, sessions and body
// measurements into "where are they, and how are they doing" for trainer
// mode. No I/O here, so it's easy to reason about and test.

const DAY_MS = 24 * 60 * 60 * 1000;

// Where a client is in one programme, based on its most relevant run:
// the active one if there is one, otherwise the most recent.
//   status: "active" | "completed" | "abandoned" | "notStarted"
export function programProgress(program, runs, sessions) {
  const programRuns = runs
    .filter((r) => r.programId === program.programId)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const run = programRuns.find((r) => r.status === "active") ?? programRuns[0] ?? null;
  const daysPerWeek = program.days.length;
  const totalDays = daysPerWeek * program.durationWeeks;

  if (!run) {
    return { status: "notStarted", run: null, daysPerWeek, totalDays, daysDone: 0, percent: 0, timesCompleted: 0 };
  }

  const runSessions = sessions.filter((s) => s.runId === run.runId);
  // A day re-done in the same week only counts once.
  const doneKeys = new Set(runSessions.map((s) => `${s.week}#${s.dayId}`));
  const currentWeek = Math.min(run.currentWeek ?? 1, program.durationWeeks);
  const daysDoneThisWeek = new Set(runSessions.filter((s) => s.week === currentWeek).map((s) => s.dayId)).size;
  const daysDone = run.status === "completed" ? totalDays : Math.min(doneKeys.size, totalDays);
  const lastSession = runSessions.reduce(
    (latest, s) => (!latest || s.completedAt > latest.completedAt ? s : latest),
    null
  );

  return {
    status: run.status ?? "active",
    run,
    currentWeek,
    daysPerWeek,
    daysDoneThisWeek,
    totalDays,
    daysDone,
    percent: totalDays ? Math.round((daysDone / totalDays) * 100) : 0,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? null,
    lastWorkoutAt: lastSession?.completedAt ?? null,
    timesCompleted: programRuns.filter((r) => r.status === "completed").length,
  };
}

// Headline numbers for the top of a client's page.
export function clientSummary(sessions, measurements, now = Date.now()) {
  const completed = sessions.filter((s) => s.completedAt);
  const lastWorkoutAt = completed.reduce((latest, s) => (s.completedAt > (latest ?? "") ? s.completedAt : latest), null);
  const last30 = completed.filter((s) => now - new Date(s.completedAt).getTime() <= 30 * DAY_MS).length;

  const weighIns = measurements.filter((m) => m.weightKg != null).sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = weighIns.at(-1) ?? null;
  const firstWeight = weighIns[0] ?? null;

  return {
    totalWorkouts: completed.length,
    workoutsLast30Days: last30,
    lastWorkoutAt,
    latestWeightKg: latestWeight?.weightKg ?? null,
    latestWeightDate: latestWeight?.date ?? null,
    weightChangeKg:
      latestWeight && firstWeight && latestWeight !== firstWeight
        ? Math.round((latestWeight.weightKg - firstWeight.weightKg) * 10) / 10
        : null,
    firstWeightDate: firstWeight?.date ?? null,
  };
}

// "Today", "Yesterday", "3 days ago", "2 weeks ago", or a date.
export function relativeDay(iso, now = Date.now()) {
  if (!iso) return "—";
  const startOf = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(iso)) / DAY_MS);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
