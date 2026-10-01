"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReportShell from "../ReportShell";
import MetricDetail from "../MetricDetail";
import { useReportData } from "../useReportData";
import { lengthFormat } from "../formatters";
import { bodyMetricSeries } from "../../../lib/reports";
import { MEASUREMENTS } from "../../../lib/measurements";
import { cmToDisplayLength, lengthUnitFor } from "../../../lib/units";
import styles from "../page.module.css";

// Tape measurements detail: one measurement at a time (chips), with how
// much it's changed since the start and week / month / year on the previous
// one. Offers every measurement ever logged — including ones no longer
// tracked, so their history stays reachable. ?measure=<key> preselects one.
export default function MeasurementsReport() {
  const data = useReportData();
  const { ready, profile, bodyEntries, granularity } = data;
  const lengthUnit = lengthUnitFor(profile);
  const searchParams = useSearchParams();
  const [measureKey, setMeasureKey] = useState(searchParams.get("measure"));

  if (!ready) return null;

  const logged = MEASUREMENTS.filter(({ key }) => bodyEntries?.some((e) => e.measurements?.[key] != null));
  const measure = logged.find((m) => m.key === measureKey) ?? logged.find((m) => m.key === "waist") ?? logged[0];
  const measureSeriesFor = (g) =>
    bodyMetricSeries(
      bodyEntries ?? [],
      (e) => {
        const cm = e.measurements?.[measure.key];
        return cm != null ? cmToDisplayLength(cm, lengthUnit) : null;
      },
      g
    );

  return (
    <ReportShell title="Measurements" subtitle="Your tape measurements, and how much each has changed." data={data}>
      {!bodyEntries ? (
        <p className={styles.empty}>Loading…</p>
      ) : !measure ? (
        <p className={styles.empty}>
          <Link href="/measurements" className={styles.link}>
            Log a tape measurement
          </Link>{" "}
          (waist, chest, arms…) to see it here.
        </p>
      ) : (
        <>
          <div className={styles.measureChips} role="tablist" aria-label="Measurement">
            {logged.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={key === measure.key}
                className={`${styles.measureChip} ${key === measure.key ? styles.measureChipSelected : ""}`}
                onClick={() => setMeasureKey(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <MetricDetail
            key={measure.key}
            title={measure.label}
            seriesFor={measureSeriesFor}
            granularity={granularity}
            {...lengthFormat(lengthUnit)}
          />
        </>
      )}
    </ReportShell>
  );
}
