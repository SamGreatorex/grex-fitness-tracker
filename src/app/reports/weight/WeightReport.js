"use client";

import Link from "next/link";
import ReportShell from "../ReportShell";
import MetricDetail from "../MetricDetail";
import { useReportData } from "../useReportData";
import { bodyWeightFormat } from "../formatters";
import { bodyMetricSeries } from "../../../lib/reports";
import { kgToChartWeight } from "../../../lib/units";
import styles from "../page.module.css";

// Body weight detail: weight logged over time and how much has been gained
// or lost — since the start, and week / month / year on the previous one.
export default function WeightReport() {
  const data = useReportData();
  const { ready, profile, bodyEntries, granularity } = data;
  const weightUnit = profile?.weightUnit;

  if (!ready) return null;

  const weightSeriesFor = (g, range) =>
    bodyMetricSeries(bodyEntries ?? [], (e) => (e.weightKg != null ? kgToChartWeight(e.weightKg, weightUnit) : null), g, range);
  const hasWeighIns = bodyEntries?.some((e) => e.weightKg != null);

  return (
    <ReportShell title="Body weight" subtitle="Your weigh-ins, and how much you've gained or lost." data={data}>
      {!bodyEntries ? (
        <p className={styles.empty}>Loading…</p>
      ) : !hasWeighIns ? (
        <p className={styles.empty}>
          <Link href="/measurements" className={styles.link}>
            Log your weight
          </Link>{" "}
          to see it here.
        </p>
      ) : (
        <MetricDetail title="Body weight" seriesFor={weightSeriesFor} granularity={granularity} date={data.date} {...bodyWeightFormat(weightUnit)} />
      )}
    </ReportShell>
  );
}
