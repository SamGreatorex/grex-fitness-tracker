"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { api } from "../../lib/apiClient";

export const GRANULARITIES = [
  { key: "week", label: "Weekly", period: "week" },
  { key: "month", label: "Monthly", period: "month" },
  { key: "year", label: "Yearly", period: "year" },
];

// Everything the reports overview and its detail pages chart: the user's
// workout sessions, the exercise library (keyed by slug, for body areas)
// and their body measurement entries. Each is null until loaded. Also
// sends signed-out users to the login page.
//
// The chosen granularity lives in the URL (?period=week|month|year), so it
// carries from the overview into a detail page and back. Callers using this
// must be inside a <Suspense> boundary (useSearchParams needs one).
export function useReportData() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading, profile } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [exerciseLibrary, setExerciseLibrary] = useState({});
  const [bodyEntries, setBodyEntries] = useState(null);
  const [error, setError] = useState("");

  const requested = searchParams.get("period");
  const granularity = GRANULARITIES.some((g) => g.key === requested) ? requested : "week";

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

  // Swaps the period in the URL without adding a history entry per click.
  const setGranularity = (key) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return {
    ready: !sessionLoading && !!user,
    profile,
    sessions,
    exerciseLibrary,
    bodyEntries,
    error,
    granularity,
    setGranularity,
  };
}
