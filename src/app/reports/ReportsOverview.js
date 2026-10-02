"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "../../components/AppHeader";
import TrendChart from "../../components/TrendChart";
import BodyAreaCard from "../../components/BodyAreaCard";
import { ReportControls } from "./ReportShell";
import { useReportData } from "./useReportData";
import { bodyWeightFormat, lengthFormat } from "./formatters";
import { WORKOUT_METRICS } from "./workouts/WorkoutsReport";
import { bodyAreaWeightSeries, bodyMetricSeries } from "../../lib/reports";
import { MEASUREMENTS } from "../../lib/measurements";
import { WEIGHT_UNITS, cmToDisplayLength, kgToChartWeight, lengthUnitFor } from "../../lib/units";
import styles from "./page.module.css";

// A report on the overview, tappable through to its detail page.
function ReportLink({ href, children }) {
  return (
    <Link href={href} className={styles.reportLink}>
      {children}
      <span className={styles.reportLinkMore}>View details →</span>
    </Link>
  );
}

// The reports overview: a chart per report, each opening its detail view
// (gained/lost since the start and week / month / year, plus a breakdown).
export default function ReportsOverview() {
  const data = useReportData();
  const { ready, profile, sessions, exerciseLibrary, bodyEntries, error, granularity, selectedKey } = data;
  const weightUnit = profile?.weightUnit;
  const lengthUnit = lengthUnitFor(profile);
  const [measurementKey, setMeasurementKey] = useState(null);
  // Carries the period and date into the detail pages.
  const q = data.query;

  const bodyAreas = useMemo(
    () => (sessions ? bodyAreaWeightSeries(sessions, exerciseLibrary, granularity) : {}),
    [sessions, exerciseLibrary, granularity]
  );

  const weightSeries = useMemo(
    () =>
      bodyEntries
        ? bodyMetricSeries(bodyEntries, (e) => (e.weightKg != null ? kgToChartWeight(e.weightKg, weightUnit) : null), granularity)
        : [],
    [bodyEntries, weightUnit, granularity]
  );

  // Only offer measurements that have been logged at least once.
  const loggedMeasurements = useMemo(
    () => MEASUREMENTS.filter(({ key }) => bodyEntries?.some((e) => e.measurements?.[key] != null)),
    [bodyEntries]
  );
  const selectedMeasurement =
    loggedMeasurements.find((m) => m.key === measurementKey) ??
    loggedMeasurements.find((m) => m.key === "waist") ??
    loggedMeasurements[0];

  const measurementSeries = useMemo(
    () =>
      bodyEntries && selectedMeasurement
        ? bodyMetricSeries(
            bodyEntries,
            (e) => {
              const cm = e.measurements?.[selectedMeasurement.key];
              return cm != null ? cmToDisplayLength(cm, lengthUnit) : null;
            },
            granularity
          )
        : [],
    [bodyEntries, selectedMeasurement, lengthUnit, granularity]
  );

  const stones = weightUnit === WEIGHT_UNITS.ST_LB;
  const bodyAreaEntries = Object.entries(bodyAreas).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  if (!ready) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Progress reports</h1>
        <p className={styles.subtitle}>Tap a report for the detail — how much you&apos;ve gained or lost each week, month and year.</p>

        {error && <p className={styles.errorText}>{error}</p>}

        <ReportControls data={data} />

        <h2 className={styles.sectionTitle}>Body</h2>
        {!bodyEntries ? (
          <p className={styles.empty}>Loading…</p>
        ) : bodyEntries.length === 0 ? (
          <p className={styles.empty}>
            <Link href="/measurements" className={styles.link}>
              Log your weight and measurements
            </Link>{" "}
            to see them charted here.
          </p>
        ) : (
          <>
            <ReportLink href={`/reports/weight?${q}`}>
              <TrendChart
                title={`Body weight (${stones ? "st" : "kg"})`}
                data={weightSeries}
                selectedKey={selectedKey}
                emptyText="No weigh-ins logged yet."
                {...bodyWeightFormat(weightUnit).chart}
              />
            </ReportLink>

            {selectedMeasurement ? (
              <>
                <div className={styles.measureChips} role="tablist" aria-label="Measurement">
                  {loggedMeasurements.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={key === selectedMeasurement.key}
                      className={`${styles.measureChip} ${key === selectedMeasurement.key ? styles.measureChipSelected : ""}`}
                      onClick={() => setMeasurementKey(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <ReportLink href={`/reports/measurements?${q}&measure=${selectedMeasurement.key}`}>
                  <TrendChart
                    title={`${selectedMeasurement.label} (${lengthUnit})`}
                    data={measurementSeries}
                    selectedKey={selectedKey}
                    {...lengthFormat(lengthUnit).chart}
                  />
                </ReportLink>
              </>
            ) : (
              <p className={styles.empty}>
                <Link href="/measurements" className={styles.link}>
                  Log a tape measurement
                </Link>{" "}
                (waist, chest, arms…) to chart it here.
              </p>
            )}
          </>
        )}

        <h2 className={styles.sectionTitle}>Workouts</h2>
        {!sessions ? (
          <p className={styles.empty}>Loading…</p>
        ) : sessions.length === 0 ? (
          <p className={styles.empty}>Complete a workout to start seeing progress here.</p>
        ) : (
          <>
            {WORKOUT_METRICS.map((metric) => (
              <ReportLink key={metric.key} href={`/reports/workouts?${q}&metric=${metric.key}`}>
                <TrendChart
                  title={metric.label}
                  data={metric.series(sessions, granularity)}
                  selectedKey={selectedKey}
                  {...metric.format.chart}
                />
              </ReportLink>
            ))}

            <h2 className={styles.sectionTitle}>Body area progress</h2>
            {bodyAreaEntries.length === 0 ? (
              <p className={styles.empty}>
                Tag your exercises with a primary body area in the exercise library to see progress broken down here.
              </p>
            ) : (
              <div className={styles.bodyAreaGrid}>
                {bodyAreaEntries.map(([area, series]) => (
                  <Link key={area} href={`/reports/areas/${encodeURIComponent(area)}?${q}`} className={styles.areaLink}>
                    <BodyAreaCard area={area} series={series} selectedKey={selectedKey} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
