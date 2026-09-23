import Link from "next/link";
import styles from "./ProgramCard.module.css";
import WeekProgress from "./WeekProgress";

// `activeRun` (if any) is the program's currently in-progress run.
// `completedRun` (if any, and only relevant when there's no active run) is
// the most recent run that finished — shown as "✓ Completed" with a "Start
// again" button right here, no need to open the program first.
export default function ProgramCard({ program, activeRun, completedRun, onStart, starting }) {
  const isCompleted = !activeRun && completedRun;

  return (
    <div className={`${styles.card} ${isCompleted ? styles.cardCompleted : ""}`}>
      {isCompleted && <span className={styles.completedBadge}>✓ Completed</span>}

      <Link href={`/programs/${program.programId}`} className={styles.cardLink}>
        <h3 className={styles.name}>{program.name}</h3>
        <p className={styles.goal}>{program.goal} · {program.days.length} days/week · {program.durationWeeks} weeks</p>

        {activeRun && (
          <div className={styles.progressRow}>
            <WeekProgress durationWeeks={program.durationWeeks} currentWeek={activeRun.currentWeek} />
            <span className={`${styles.badge} ${styles.badgeActive}`}>
              Week {activeRun.currentWeek} in progress
            </span>
          </div>
        )}
      </Link>

      {!activeRun && (
        <button type="button" className={styles.startButton} disabled={starting} onClick={onStart}>
          {starting ? "Starting…" : isCompleted ? "Start again" : "Start program"}
        </button>
      )}
    </div>
  );
}
