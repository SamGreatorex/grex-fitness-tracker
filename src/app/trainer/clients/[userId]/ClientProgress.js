"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TrendChart from "../../../../components/TrendChart";
import WeekProgress from "../../../../components/WeekProgress";
import { clientSummary, programProgress, relativeDay } from "../../../../lib/clientProgress";
import { averageEffortOf } from "../../../../lib/sessionStats";
import { averageEffortSeries, bodyMetricSeries, totalWeightSeries } from "../../../../lib/reports";
import { WEIGHT_UNITS, chartWeightToKg, formatSetWeight, formatWeight, kgToChartWeight } from "../../../../lib/units";
import { formatCardio } from "../../../../lib/exerciseTypes";
import { isTrainerLed } from "../../../../lib/programLead";
import styles from "./ClientProgress.module.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : "—");
const fmtKg = (n) => `${Math.round(n).toLocaleString()} kg`;
const fmtDuration = (s) => (s ? `${Math.round(s / 60)} min` : null);

// Trainer's view of one client: headline numbers, where they are in each
// programme, recent workouts, and trends. `weightUnit` is the trainer's own
// body-weight display preference.
export default function ClientProgress({ userId, data, weightUnit }) {
  const { programs, runs, sessions, measurements } = data;
  const summary = useMemo(() => clientSummary(sessions, measurements), [sessions, measurements]);

  return (
    <>
      <SummaryTiles summary={summary} weightUnit={weightUnit} />

      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Programmes</h2>
        <Link href={`/trainer/clients/${userId}/programmes/new`} className={styles.primaryButton}>
          + New programme
        </Link>
      </div>
      {programs.length === 0 ? (
        <p className={styles.empty}>No programmes yet — create one to get them started.</p>
      ) : (
        <>
          <h3 className={styles.subsectionTitle}>Trainer led</h3>
          <ProgrammeProgress
            userId={userId}
            programs={programs.filter(isTrainerLed)}
            runs={runs}
            sessions={sessions}
            emptyText="None yet — these are the programmes you run with them in person."
          />
          <h3 className={styles.subsectionTitle}>User led</h3>
          <ProgrammeProgress
            userId={userId}
            programs={programs.filter((p) => !isTrainerLed(p))}
            runs={runs}
            sessions={sessions}
            emptyText="None yet — these are the programmes they run themselves."
          />
        </>
      )}

      <h2 className={`${styles.sectionTitle} ${styles.spaced}`}>Recent workouts</h2>
      <RecentWorkouts sessions={sessions} programs={programs} runs={runs} />

      <h2 className={`${styles.sectionTitle} ${styles.spaced}`}>Trends (weekly)</h2>
      <Trends sessions={sessions} measurements={measurements} weightUnit={weightUnit} />
    </>
  );
}

function SummaryTiles({ summary, weightUnit }) {
  const change = summary.weightChangeKg;
  return (
    <div className={styles.tiles}>
      <Tile label="Last workout" value={relativeDay(summary.lastWorkoutAt)} sub={summary.lastWorkoutAt ? fmtDate(summary.lastWorkoutAt) : "None logged yet"} />
      <Tile label="Workouts · 30 days" value={summary.workoutsLast30Days} sub={`${summary.totalWorkouts} in total`} />
      <Tile
        label="Body weight"
        value={summary.latestWeightKg != null ? formatWeight(summary.latestWeightKg, weightUnit) : "—"}
        sub={
          change == null
            ? summary.latestWeightKg != null
              ? `Logged ${relativeDay(summary.latestWeightDate)}`
              : "Not logged yet"
            : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${formatWeight(Math.abs(change), weightUnit)} since ${fmtDate(summary.firstWeightDate)}`
        }
      />
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      <span className={styles.tileSub}>{sub}</span>
    </div>
  );
}

const STATUS_LABEL = {
  active: "In progress",
  completed: "Completed",
  abandoned: "Stopped",
  notStarted: "Not started",
};

// Trainer-led rows can be opened and run from here; user-led ones are the
// client's to run, so the trainer can only follow and edit them.
function ProgrammeProgress({ userId, programs, runs, sessions, emptyText }) {
  if (programs.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }

  // In-progress first, then not started, then finished/stopped.
  const order = { active: 0, notStarted: 1, completed: 2, abandoned: 3 };
  const rows = programs
    .map((program) => ({ program, progress: programProgress(program, runs, sessions) }))
    .sort((a, b) => order[a.progress.status] - order[b.progress.status]);

  return (
    <ul className={styles.programmes}>
      {rows.map(({ program, progress }) => (
        <li key={program.programId} className={styles.programme}>
          <div className={styles.programmeHead}>
            <div className={styles.programmeInfo}>
              <span className={styles.programmeName}>{program.name}</span>
              <span className={styles.meta}>
                {[program.goal, `${program.days.length} days/week`, `${program.durationWeeks} weeks`].filter(Boolean).join(" · ")}
              </span>
            </div>
            <span className={`${styles.status} ${styles[`status_${progress.status}`]}`}>{STATUS_LABEL[progress.status]}</span>
          </div>

          {progress.status === "active" && (
            <>
              <div className={styles.weekRow}>
                <WeekProgress durationWeeks={program.durationWeeks} currentWeek={progress.currentWeek} />
                <span className={styles.meta}>
                  Week {progress.currentWeek} of {program.durationWeeks} · {progress.daysDoneThisWeek} of {progress.daysPerWeek} days done
                  this week
                </span>
              </div>
              <ProgressBar done={progress.daysDone} total={progress.totalDays} />
              <span className={styles.meta}>
                Started {fmtDate(progress.startedAt)} · last workout {relativeDay(progress.lastWorkoutAt).toLowerCase()}
              </span>
            </>
          )}
          {progress.status === "completed" && (
            <span className={styles.meta}>
              ✓ Finished {fmtDate(progress.completedAt)}
              {progress.timesCompleted > 1 ? ` · completed ${progress.timesCompleted} times` : ""}
            </span>
          )}
          {progress.status === "abandoned" && (
            <span className={styles.meta}>
              Stopped in week {progress.currentWeek} after {progress.daysDone} of {progress.totalDays} workouts
            </span>
          )}
          {progress.status === "notStarted" && (
            <span className={styles.meta}>
              {isTrainerLed(program) ? "Not started yet — open it to start your first session." : "They haven’t started this programme yet."}
            </span>
          )}

          <div className={styles.programmeActions}>
            <Link href={`/trainer/clients/${userId}/programmes/${program.programId}`} className={styles.ghostButton}>
              Edit programme
            </Link>
            {isTrainerLed(program) && (
              <Link href={`/trainer/clients/${userId}/programmes/${program.programId}/run`} className={styles.primaryButton}>
                Open programme
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressBar({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Programme progress">
      <div className={styles.barTrack}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.barLabel}>
        {done} of {total} workouts · {pct}%
      </span>
    </div>
  );
}

function RecentWorkouts({ sessions, programs, runs }) {
  const [shown, setShown] = useState(8);
  const nameByProgramId = useMemo(() => {
    const names = {};
    for (const r of runs) names[r.programId] = r.programName;
    for (const p of programs) names[p.programId] = p.name;
    return names;
  }, [programs, runs]);

  if (sessions.length === 0) return <p className={styles.empty}>No workouts logged yet.</p>;

  return (
    <>
      <ul className={styles.workouts}>
        {sessions.slice(0, shown).map((s) => {
          const effort = averageEffortOf(s.exercises ?? []);
          return (
            <li key={s.sessionId}>
              <details className={styles.workout}>
                <summary className={styles.workoutSummary}>
                  <span className={styles.workoutMain}>
                    <span className={styles.workoutTitle}>
                      {s.dayName || "Workout"} · Week {s.week}
                    </span>
                    <span className={styles.meta}>
                      {fmtDate(s.completedAt)} · {nameByProgramId[s.programId] ?? "Programme"}
                    </span>
                  </span>
                  <span className={styles.workoutStats}>
                    <span>{fmtKg(s.totalWeightLifted || 0)}</span>
                    <span className={styles.meta}>
                      {[effort != null && `effort ${effort.toFixed(1)}/10`, fmtDuration(s.durationSeconds)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </summary>
                <ul className={styles.exerciseList}>
                  {(s.exercises ?? []).map((ex, i) => (
                    <li key={`${ex.exerciseId ?? i}`} className={styles.exerciseRow}>
                      <span className={styles.exerciseName}>{ex.name}</span>
                      <span className={styles.sets}>
                        {ex.cardio && (
                          <span className={styles.set}>
                            {formatCardio({ settings: ex.cardio.settings, seconds: ex.cardio.durationSeconds })}
                            {ex.cardio.effort != null ? ` · ${ex.cardio.effort}/10` : ""}
                          </span>
                        )}
                        {(ex.sets ?? []).map((set, j) => (
                          <span key={j} className={styles.set}>
                            {set.reps ?? "—"} × {formatSetWeight(set)}{set.effort != null ? ` · ${set.effort}/10` : ""}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
      {sessions.length > shown && (
        <button type="button" className={styles.moreButton} onClick={() => setShown((n) => n + 8)}>
          Show more ({sessions.length - shown} older)
        </button>
      )}
    </>
  );
}

function Trends({ sessions, measurements, weightUnit }) {
  const stones = weightUnit === WEIGHT_UNITS.ST_LB;
  const volume = useMemo(() => totalWeightSeries(sessions, "week"), [sessions]);
  const effort = useMemo(() => averageEffortSeries(sessions, "week"), [sessions]);
  const bodyWeight = useMemo(
    () => bodyMetricSeries(measurements, (m) => (m.weightKg != null ? kgToChartWeight(m.weightKg, weightUnit) : null), "week"),
    [measurements, weightUnit]
  );

  if (sessions.length === 0 && bodyWeight.length === 0) {
    return <p className={styles.empty}>Trends appear once they&apos;ve logged a few workouts.</p>;
  }

  return (
    <div className={styles.charts}>
      <TrendChart title="Total weight lifted" unit=" kg" data={volume} emptyText="No workouts logged yet." />
      <TrendChart title="Average effort" unit="/10" data={effort} formatValue={(v) => v.toFixed(1)} emptyText="No effort ratings yet." />
      <TrendChart
        title={`Body weight (${stones ? "st" : "kg"})`}
        unit={stones ? "" : " kg"}
        data={bodyWeight}
        zeroBaseline={false}
        formatValue={stones ? (v) => formatWeight(chartWeightToKg(v, weightUnit), weightUnit) : (v) => v.toFixed(1)}
        formatAxis={(v) => v.toFixed(1)}
        emptyText="No weigh-ins logged yet."
      />
    </div>
  );
}
