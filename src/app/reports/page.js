"use client";

import { useEffect, useState, useMemo } from "react";
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
} from "../../lib/reports";
import styles from "./page.module.css";

const GRANULARITIES = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

export default function ReportsPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  const [sessions, setSessions] = useState(null);
  const [exerciseLibrary, setExerciseLibrary] = useState({});
  const [granularity, setGranularity] = useState("week");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [{ sessions }, { exercises }] = await Promise.all([
          api.get("/api/sessions"),
          api.get("/api/exercises"),
        ]);
        setSessions(sessions);
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

  const bodyAreaEntries = Object.entries(bodyAreas).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Progress reports</h1>
        <p className={styles.subtitle}>How your weights, volume and effort are trending over time.</p>

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
