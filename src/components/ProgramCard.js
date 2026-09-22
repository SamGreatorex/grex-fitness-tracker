import Link from "next/link";
import styles from "./ProgramCard.module.css";
import WeekProgress from "./WeekProgress";

export default function ProgramCard({ program, activeRun }) {
  return (
    <Link href={`/programs/${program.programId}`} className={styles.card}>
      <h3 className={styles.name}>{program.name}</h3>
      <p className={styles.goal}>{program.goal} · {program.days.length} days/week · {program.durationWeeks} weeks</p>
      <div className={styles.footer}>
        {activeRun ? (
          <WeekProgress durationWeeks={program.durationWeeks} currentWeek={activeRun.currentWeek} />
        ) : (
          <span />
        )}
        <span className={`${styles.badge} ${activeRun ? styles.badgeActive : ""}`}>
          {activeRun ? `Week ${activeRun.currentWeek} in progress` : "Start program"}
        </span>
      </div>
    </Link>
  );
}
