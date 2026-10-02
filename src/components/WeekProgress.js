import styles from "./WeekProgress.module.css";

// currentWeek: 1-4 (or > durationWeeks if the run is complete).
// With `onSelectWeek`, every week reached so far (completed ones and the
// current one) is a button, to look back at what was logged in it;
// `selectedWeek` is ringed.
export default function WeekProgress({ durationWeeks = 4, currentWeek = 1, selectedWeek, onSelectWeek }) {
  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);
  return (
    <div className={styles.wrap}>
      {weeks.map((week) => {
        const done = week < currentWeek;
        const current = week === currentWeek;
        const className = `${styles.dot} ${done ? styles.dotDone : ""} ${current ? styles.dotCurrent : ""} ${
          week === selectedWeek ? styles.dotSelected : ""
        }`;
        const label = done ? "✓" : week;

        if (onSelectWeek && week <= currentWeek) {
          return (
            <button
              key={week}
              type="button"
              className={`${className} ${styles.dotButton}`}
              aria-pressed={week === selectedWeek}
              aria-label={`Week ${week}${done ? " (completed)" : current ? " (this week)" : ""}`}
              title={`Week ${week}`}
              onClick={() => onSelectWeek(week)}
            >
              {label}
            </button>
          );
        }
        return (
          <span key={week} className={className} title={`Week ${week}`}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
