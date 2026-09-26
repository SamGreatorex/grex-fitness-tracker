"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { api } from "../../lib/apiClient";
import AppHeader from "../../components/AppHeader";
import TrendChart from "../../components/TrendChart";
import BodyAreaCard from "../../components/BodyAreaCard";
import {
  totalWeightSeries,
  averageWeightSeries,
  averageEffortSeries,
  bodyAreaWeightSeries,
  bodyMetricSeries,
} from "../../lib/reports";
import { MEASUREMENTS } from "../../lib/measurements";
import {
  WEIGHT_UNITS,
  chartWeightToKg,
  cmToDisplayLength,
  formatWeight,
  kgToChartWeight,
  lengthUnitLabel,
} from "../../lib/units";
import styles from "./page.module.css";

const GRANULARITIES = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

export default function ReportsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile } = useAuth();
  const weightUnit = profile?.weightUnit;
  const heightUnit = profile?.heightUnit;
  const lengthUnit = lengthUnitLabel(heightUnit);

  const [sessions, setSessions] = useState(null);
  const [exerciseLibrary, setExerciseLibrary] = useState({});
  const [bodyEntries, setBodyEntries] = useState(null);
  const [measurementKey, setMeasurementKey] = useState(null);
  const [granularity, setGranularity] = useState("week");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [{ sessions }, { exercises }, { entries }] = await Promise.all([
          api.get("/api/sessions"),
          api.get("/api/exercises"),
          api.get("/api/measurements"),
        ]);
        setSessions(sessions);
        setBodyEntries(entries);
        const bySlug = {};
        for (const exercise of exercises) bySlug[exercise.exerciseId] = exercise;
        setExerciseLibrary(bySlug);
      } catch (err) {
        setError(err.message || "Could not load reports.");
      }
    })();
  }, [user]);

  const totalWeight = useMemo(() => (sessions ? totalWeightSeries(sessions, granularity) : []), [sessions, granularity]);
  const avgWeight = useMemo(() => (sessions ? averageWeightSeries(sessions, granularity) : []), [sessions, granularity]);
  const avgEffort = useMemo(() => (sessions ? averageEffortSeries(sessions, granularity) : []), [sessions, granularity]);
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
              return cm != null ? cmToDisplayLength(cm, heightUnit) : null;
            },
            granularity
          )
        : [],
    [bodyEntries, selectedMeasurement, heightUnit, granularity]
  );

  const stones = weightUnit === WEIGHT_UNITS.ST_LB;

  const bodyAreaEntries = Object.entries(bodyAreas).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Progress reports</h1>
        <p className={styles.subtitle}>How your body, weights, volume and effort are trending over time.</p>

        {error && <p>{error}</p>}

        <div className={styles.granularityRow}>
          {GRANULARITIES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.granularityButton} ${granularity === key ? styles.granularityButtonSelected : ""}`}
              onClick={() => setGranularity(key)}
            >
              {label}
            </button>
          ))}
        </div>

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
            <TrendChart
              title={`Body weight (${stones ? "st" : "kg"})`}
              unit={stones ? "" : " kg"}
              data={weightSeries}
              zeroBaseline={false}
              formatValue={stones ? (v) => formatWeight(chartWeightToKg(v, weightUnit), weightUnit) : (v) => v.toFixed(1)}
              formatAxis={(v) => v.toFixed(1)}
              emptyText="No weigh-ins logged yet."
            />

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
                <TrendChart
                  title={`${selectedMeasurement.label} (${lengthUnit})`}
                  unit={` ${lengthUnit}`}
                  data={measurementSeries}
                  zeroBaseline={false}
                  formatValue={(v) => v.toFixed(1)}
                />
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
            <TrendChart title="Total weight lifted" unit=" kg" data={totalWeight} />
            <TrendChart title="Average weight per set" unit=" kg" data={avgWeight} formatValue={(v) => v.toFixed(1)} />
            <TrendChart title="Average effort" unit="/10" data={avgEffort} formatValue={(v) => v.toFixed(1)} />

            <h2 className={styles.sectionTitle}>Body area progress</h2>
            {bodyAreaEntries.length === 0 ? (
              <p className={styles.empty}>
                Tag your exercises with a primary body area in the exercise library to see progress broken down here.
              </p>
            ) : (
              <div className={styles.bodyAreaGrid}>
                {bodyAreaEntries.map(([area, series]) => (
                  <BodyAreaCard key={area} area={area} series={series} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
