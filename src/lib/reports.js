import { slugify } from "./slugify";

// Groups a UTC date into a week/month/year bucket key that sorts
// chronologically as a plain string.
function startOfIsoWeek(date) {
  const d = new Date(date);
  const day = d.getUTCDay() || 7; // Sunday (0) -> 7, so Monday is always day 1
  d.setUTCDate(d.getUTCDate() - day + 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function periodKey(dateStr, granularity) {
  const d = new Date(dateStr);
  if (granularity === "week") return startOfIsoWeek(d).toISOString().slice(0, 10);
  if (granularity === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return String(d.getUTCFullYear());
}

export function periodLabel(key, granularity) {
  if (granularity === "week") {
    return new Date(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  if (granularity === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return key;
}

// Buckets `sessions` by period and reduces each bucket with `reduceFn`,
// which receives the array of raw values collected for that bucket.
function bucketSessions(sessions, granularity, collectFn) {
  const buckets = new Map();
  for (const session of sessions) {
    if (!session.completedAt) continue;
    const key = periodKey(session.completedAt, granularity);
    if (!buckets.has(key)) buckets.set(key, []);
    collectFn(session, buckets.get(key));
  }
  return buckets;
}

function toSortedSeries(buckets, granularity, reduceFn) {
  return [...buckets.entries()]
    .map(([key, values]) => ({ key, label: periodLabel(key, granularity), value: reduceFn(values) }))
    .filter((point) => point.value != null)
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Total kg lifted per period (sum of each session's totalWeightLifted).
export function totalWeightSeries(sessions, granularity) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    arr.push(session.totalWeightLifted || 0);
  });
  return toSortedSeries(buckets, granularity, (values) => values.reduce((a, b) => a + b, 0));
}

// Average weight per logged set per period (progressive-overload signal).
export function averageWeightSeries(sessions, granularity) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.weight != null) arr.push(set.weight);
      }
    }
  });
  return toSortedSeries(buckets, granularity, (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  );
}

// Average logged effort (1-10) per period.
export function averageEffortSeries(sessions, granularity) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.effort != null) arr.push(set.effort);
      }
    }
  });
  return toSortedSeries(buckets, granularity, (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  );
}

// Average weight per set per period, split out per body area — matched via
// each exercise's PRIMARY tag(s) in the exercise library (by slugified name).
// Returns { [area]: [{ key, label, value }] }, areas with no data omitted.
export function bodyAreaWeightSeries(sessions, exerciseLibraryBySlug, granularity) {
  const areaBuckets = new Map(); // area -> Map(periodKey -> values[])

  for (const session of sessions) {
    if (!session.completedAt) continue;
    const key = periodKey(session.completedAt, granularity);

    for (const exercise of session.exercises) {
      const libraryEntry = exerciseLibraryBySlug[slugify(exercise.name)];
      const areas = libraryEntry?.primaryTags || [];
      if (areas.length === 0) continue;

      for (const set of exercise.sets) {
        if (set.weight == null) continue;
        for (const area of areas) {
          if (!areaBuckets.has(area)) areaBuckets.set(area, new Map());
          const periodMap = areaBuckets.get(area);
          if (!periodMap.has(key)) periodMap.set(key, []);
          periodMap.get(key).push(set.weight);
        }
      }
    }
  }

  const result = {};
  for (const [area, periodMap] of areaBuckets) {
    result[area] = toSortedSeries(periodMap, granularity, (values) =>
      values.reduce((a, b) => a + b, 0) / values.length
    );
  }
  return result;
}

// Percent change from the second-to-last point to the last point, or null
// if there aren't at least two points to compare.
export function trendDelta(series) {
  if (series.length < 2) return null;
  const prev = series[series.length - 2].value;
  const current = series[series.length - 1].value;
  if (!prev) return null;
  return ((current - prev) / prev) * 100;
}

// Body weight / a tape measurement over time from measurement entries
// ({ date: "YYYY-MM-DD", weightKg, measurements }). `getValue(entry)`
// picks the number (or null if that entry didn't record it). Each period
// shows the latest reading in it — a weigh-in is a point-in-time value,
// so averaging or summing across a week would misrepresent it.
export function bodyMetricSeries(entries, getValue, granularity) {
  const buckets = new Map();
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const value = getValue(entry);
    if (value == null) continue;
    buckets.set(periodKey(entry.date, granularity), [value]);
  }
  return toSortedSeries(buckets, granularity, (values) => values[values.length - 1]);
}
