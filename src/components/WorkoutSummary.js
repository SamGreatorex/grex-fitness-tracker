import styles from "./WorkoutSummary.module.css";
import { effortColor } from "../lib/effort";

function formatDuration(totalSeconds) {
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${mm}:${String(ss).padStart(2, "0")}`;
}

// Shown right after "Finish workout" (and reused for viewing a past session
// read-only, and for the "complete week"/"complete program" actions) — a
// quick recap of a session or a run of sessions. `averageEffort` and
// `averageWeight` are means across every logged set (null if none).
// `title`/`subtitle` override the default day-oriented copy for those other
// contexts; leave them unset for the day-finish case.
export default function WorkoutSummary({
  title,
  subtitle,
  dayLabel,
  week,
  completedAt,
  durationSeconds,
  totalWeightLifted,
  averageWeight,
  averageEffort,
  weekCompleted,
  continueLabel = "Back to program",
  onContinue,
}) {
  const resolvedTitle = title || `${dayLabel} complete`;
  const resolvedSubtitle =
    subtitle ??
    `Week ${week}${completedAt ? ` · Completed ${new Date(completedAt).toLocaleDateString()}` : ""}`;

  return (
    <main className={styles.main}>
      <div className={styles.checkmark}>✓</div>
      <h1 className={styles.title}>{resolvedTitle}</h1>
      <p className={styles.subtitle}>{resolvedSubtitle}</p>

      {weekCompleted && <div className={styles.weekBanner}>🎉 Week {week} complete!</div>}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{Math.round(totalWeightLifted).toLocaleString()}</span>
          <span className={styles.statLabel}>kg lifted</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{averageWeight != null ? averageWeight.toFixed(1) : "—"}</span>
          <span className={styles.statLabel}>Avg. weight (kg)</span>
        </div>
        <div className={styles.stat}>
          <span
            className={styles.statValue}
            style={averageEffort != null ? { color: effortColor(averageEffort) } : undefined}
          >
            {averageEffort != null ? averageEffort.toFixed(1) : "—"}
          </span>
          <span className={styles.statLabel}>Avg. effort</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatDuration(durationSeconds)}</span>
          <span className={styles.statLabel}>Duration</span>
        </div>
      </div>

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        {continueLabel}
      </button>
    </main>
  );
}
