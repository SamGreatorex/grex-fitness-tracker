"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import ReportShell from "../ReportShell";
import MetricDetail from "../MetricDetail";
import { useReportData } from "../useReportData";
import { effortFormat, liftedFormat } from "../formatters";
import { averageEffortSeries, averageWeightSeries, totalWeightSeries } from "../../../lib/reports";
import styles from "../page.module.css";

// Each workout metric the overview charts. `key` is what ?metric= takes.
export const WORKOUT_METRICS = [
  { key: "total", label: "Total weight lifted", series: totalWeightSeries, format: liftedFormat() },
  { key: "average", label: "Average weight per set", series: averageWeightSeries, format: liftedFormat({ decimals: 1 }) },
  { key: "effort", label: "Average effort", series: averageEffortSeries, format: effortFormat },
];

// Workouts detail: one metric at a time (tabs), with its change since the
// start and week / month / year on the previous one.
export default function WorkoutsReport() {
  const data = useReportData();
  const { ready, sessions, granularity } = data;
  const searchParams = useSearchParams();
  const [metricKey, setMetricKey] = useState(searchParams.get("metric"));

  if (!ready) return null;

  const metric = WORKOUT_METRICS.find((m) => m.key === metricKey) ?? WORKOUT_METRICS[0];

  return (
    <ReportShell title="Workouts" subtitle="How much you're lifting and how hard it feels, over time." data={data}>
      {!sessions ? (
        <p className={styles.empty}>Loading…</p>
      ) : sessions.length === 0 ? (
        <p className={styles.empty}>Complete a workout to start seeing progress here.</p>
      ) : (
        <>
          <div className={styles.measureChips} role="tablist" aria-label="Workout metric">
            {WORKOUT_METRICS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === metric.key}
                className={`${styles.measureChip} ${key === metric.key ? styles.measureChipSelected : ""}`}
                onClick={() => setMetricKey(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <MetricDetail
            key={metric.key}
            title={metric.label}
            seriesFor={(g) => metric.series(sessions, g)}
            granularity={granularity}
            {...metric.format}
          />
        </>
      )}
    </ReportShell>
  );
}
