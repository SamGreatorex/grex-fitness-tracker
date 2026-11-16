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

// How far a weight or time moved since last time: "↑ 1 kg", "↓ 2 kg",
// "= same" if unchanged, nothing if there's no last time to compare with.
// Green when it moved the good way (`betterWhen`: "up").
function Delta({ change, unit, betterWhen }) {
  if (change == null) return <span className={styles.delta} />;
  if (change === 0) {
    return (
      <span className={styles.delta} aria-label="same as last time">
        = same
      </span>
    );
  }
  const up = change > 0;
  const better = up === (betterWhen === "up");
  return (
    <span
      className={`${styles.delta} ${better ? styles.deltaBetter : ""}`}
      aria-label={`${up ? "up" : "down"} ${Math.abs(change)}${unit ? ` ${unit}` : ""} on last time`}
    >
      {up ? "↑" : "↓"} {Math.abs(change)}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}

// Effort since last time, in words rather than numbers: "↓ Easier effort",
// "↑ Harder effort", "= Same effort". Easier is green.
function EffortDelta({ change }) {
  if (change == null) return <span className={styles.delta} />;
  if (change === 0) return <span className={styles.delta}>= Same effort</span>;
  const easier = change < 0;
  return (
    <span className={`${styles.delta} ${easier ? styles.deltaBetter : ""}`}>
      {easier ? "↓ Easier effort" : "↑ Harder effort"}
    </span>
  );
}

// An effort value in its colour, or "–" if unrated.
function EffortValue({ value }) {
  if (value == null) return <span className={styles.cellValue}>–</span>;
  return (
    <span className={styles.cellValue} style={{ color: effortColor(value) }}>
      {value}
    </span>
  );
}

// One exercise's table (see src/lib/exerciseProgress.js): a row per set and
// drop set, or per week — its weight (or cardio time) and effort, and how
// each moved since the row it's compared with.
function ExerciseChanges({ change: c }) {
  return (
    <li className={styles.changeRow}>
      <span className={styles.changeName}>{c.name}</span>
      {c.note && <span className={styles.changeNote}>{c.note}</span>}
      <div className={styles.changeTable} role="table" aria-label={c.name}>
        <div className={`${styles.changeLine} ${styles.changeHeader}`} role="row">
          <span role="columnheader">{c.columns.row}</span>
          <span role="columnheader">{c.columns.amount}</span>
          <span role="columnheader">{c.columns.effort}</span>
        </div>
        {c.rows.map((row, i) => (
          <div key={i} className={`${styles.changeLine} ${row.drop ? styles.dropLine : ""}`} role="row">
            <span role="cell" className={styles.setLabel} title={row.drop ? "Drop set" : undefined}>
              {row.label}
            </span>
            <span role="cell" className={styles.cell}>
              <span className={styles.cellValue}>{row.amount.value ?? "–"}</span>
              <Delta change={row.amount.change} unit={c.unit} betterWhen="up" />
            </span>
            <span role="cell" className={styles.cell}>
              <EffortValue value={row.effort.value} />
              <EffortDelta change={row.effort.change} />
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}

// Shown right after "Finish workout" (and reused for viewing a past session
// read-only, and for the "complete week"/"complete program" actions) — a
// quick recap of a session or a run of sessions. `averageEffort` and
// `averageWeight` are means across every logged set (null if none).
// `title`/`subtitle` override the default day-oriented copy for those other
// contexts; leave them unset for the day-finish case. `exerciseChanges`:
// how each exercise has changed (src/lib/exerciseProgress.js), under
// `changesTitle` — since last time for a day, week by week for a week.
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
  exerciseChanges,
  changesTitle = "Since last time",
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
        {/* Untimed (trainer-led) sessions have no duration. */}
        {durationSeconds != null && (
          <div className={styles.stat}>
            <span className={styles.statValue}>{formatDuration(durationSeconds)}</span>
            <span className={styles.statLabel}>Duration</span>
          </div>
        )}
      </div>

      {exerciseChanges?.length > 0 && (
        <section className={styles.changes} aria-labelledby="exercise-changes">
          <h2 id="exercise-changes" className={styles.changesTitle}>
            {changesTitle}
          </h2>
          <ul className={styles.changeList}>
            {exerciseChanges.map((c) => (
              <ExerciseChanges key={c.key} change={c} />
            ))}
          </ul>
        </section>
      )}

      <button type="button" className={styles.continueButton} onClick={onContinue}>
        {continueLabel}
      </button>
    </main>
  );
}
