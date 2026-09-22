import styles from "./WeekProgress.module.css";

// currentWeek: 1-4 (or > durationWeeks if the run is complete)
export default function WeekProgress({ durationWeeks = 4, currentWeek = 1 }) {
  const weeks = Array.from({ length: durationWeeks }, (_, i) => i + 1);
  return (
    <div className={styles.wrap}>
      {weeks.map((week) => {
        const done = week < currentWeek;
        const current = week === currentWeek;
        return (
          <span
            key={week}
            className={`${styles.dot} ${done ? styles.dotDone : ""} ${current ? styles.dotCurrent : ""}`}
            title={`Week ${week}`}
          >
            {done ? "✓" : week}
          </span>
        );
      })}
    </div>
  );
}
