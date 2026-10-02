"use client";

import { useParams } from "next/navigation";
import ReportShell from "../../ReportShell";
import MetricDetail from "../../MetricDetail";
import { useReportData } from "../../useReportData";
import { liftedFormat } from "../../formatters";
import { bodyAreaWeightSeries } from "../../../../lib/reports";
import styles from "../../page.module.css";

// One body area's detail: average weight per set on exercises whose primary
// tag is this area, and how it's changed.
export default function AreaReport() {
  const area = decodeURIComponent(useParams().area);
  const data = useReportData();
  const { ready, sessions, exerciseLibrary, granularity } = data;

  if (!ready) return null;

  const seriesFor = (g, range) => bodyAreaWeightSeries(sessions ?? [], exerciseLibrary, g, range)[area] ?? [];

  return (
    <ReportShell title={area} subtitle={`Average weight per set on exercises that mainly work your ${area.toLowerCase()}.`} data={data}>
      {!sessions ? (
        <p className={styles.empty}>Loading…</p>
      ) : (
        <MetricDetail title="Average weight per set" seriesFor={seriesFor} granularity={granularity} date={data.date} {...liftedFormat({ decimals: 1 })} />
      )}
    </ReportShell>
  );
}
