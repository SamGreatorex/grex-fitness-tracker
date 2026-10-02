import { slugify } from "./slugify";

// Weeks run Monday → Sunday (and can span two months, e.g. Mon 28 Sep →
// Sun 4 Oct); months and years are calendar ones. Everything is grouped by
// the user's *local* calendar date: a workout finished at 00:30 on a
// Monday belongs to that Monday's week, even though its UTC timestamp is
// still Sunday.

// A calendar date "YYYY-MM-DD" for a value: plain dates (measurement
// entries) are used as they are; full timestamps (workouts' completedAt)
// become the local date they fell on.
function localDateOf(value) {
  if (DATE_PATTERN.test(value)) return value;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A calendar date as a Date at UTC midnight, for timezone-free day maths.
const utcDay = (date) => new Date(`${date}T00:00:00Z`);

// The Monday that starts the week containing `date` (YYYY-MM-DD).
function mondayOf(date) {
  const d = utcDay(date);
  const day = d.getUTCDay() || 7; // Sunday (0) -> 7, so Monday is always day 1
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

// The day / week / month / year bucket for a date or timestamp, as a key
// that sorts chronologically as a plain string: a day is its date, a week
// its Monday ("2026-09-28"), a month "2026-09", a year "2026". (Days are
// only used to break a week down.)
export function periodKey(dateOrTimestamp, granularity) {
  const date = localDateOf(dateOrTimestamp);
  if (granularity === "day") return date;
  if (granularity === "week") return mondayOf(date);
  if (granularity === "month") return date.slice(0, 7);
  return date.slice(0, 4);
}

// A week's dates, Monday to Sunday — e.g. "28 Sep – 4 Oct", or "21–27 Sep"
// within one month — in the user's own date order (formatRange drops the
// repeated month for them). `withYear` adds the year.
export function weekRange(weekKey, { withYear = false } = {}) {
  const start = utcDay(weekKey);
  const end = utcDay(weekKey);
  end.setUTCDate(end.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC",
  });
  return format.formatRange(start, end);
}

export function periodLabel(key, granularity) {
  if (granularity === "day") {
    return utcDay(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  if (granularity === "week") {
    return utcDay(key).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  if (granularity === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return key;
}

// ---- Picking a period to look at ----
// Reports can be pointed at any week / month / year, not just the latest.
// The choice is held as a plain date (YYYY-MM-DD) — the period is whichever
// one contains it — so switching Weekly → Monthly keeps you around the
// same time.

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Today as YYYY-MM-DD in the user's own timezone.
export function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// `date` moved `delta` weeks / months / years. Months and years land on
// their 1st (so Jan 31 + 1 month isn't March) — or on today, if that's the
// period they land in.
export function shiftDate(date, granularity, delta) {
  const d = utcDay(date);
  if (granularity === "week") d.setUTCDate(d.getUTCDate() + 7 * delta);
  else if (granularity === "month") d.setUTCMonth(d.getUTCMonth() + delta, 1);
  else d.setUTCFullYear(d.getUTCFullYear() + delta, 0, 1);
  const shifted = d.toISOString().slice(0, 10);
  const today = todayDate();
  return periodKey(shifted, granularity) === periodKey(today, granularity) ? today : shifted;
}

// A friendly name for a period: "This week" / "Last week" / "14 – 20 Sep
// 2026"; "This month" / "Last month" / "August 2025"; "This year" /
// "Last year" / "2023". (This/last week's dates come from weekRange.)
export function periodTitle(key, granularity) {
  const current = periodKey(todayDate(), granularity);
  const previous = periodKey(shiftDate(todayDate(), granularity, -1), granularity);
  const noun = granularity === "week" ? "week" : granularity === "month" ? "month" : "year";
  if (key === current) return `This ${noun}`;
  if (key === previous) return `Last ${noun}`;
  if (granularity === "week") return weekRange(key, { withYear: true });
  if (granularity === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return key;
}

// ---- Breaking a period down ----
// The breakdown under a report shows what's inside the selected period:
// a week by day, a month by week, a year by month.
export const SUB_GRANULARITY = { week: "day", month: "week", year: "month" };

const addDays = (date, n) => {
  const d = utcDay(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// First and last calendar dates (inclusive) of a week / month / year key.
export function periodBounds(key, granularity) {
  if (granularity === "day") return { from: key, to: key };
  if (granularity === "week") return { from: key, to: addDays(key, 6) };
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
  }
  return { from: `${key}-01-01`, to: `${key}-12-31` };
}

// The pieces of a period, in date order, up to today: its days, weeks or
// months as { key, from, to, label }. A week that runs into the next (or
// from the previous) month is cut to the days inside this one — e.g.
// "28–30 Sept" in September — since only those days' data counts there.
export function subPeriods(key, granularity) {
  const sub = SUB_GRANULARITY[granularity];
  const bounds = periodBounds(key, granularity);
  const today = todayDate();
  const pieces = [];
  let start = sub === "week" ? mondayOf(bounds.from) : bounds.from;
  while (start <= bounds.to && start <= today) {
    const subKey = periodKey(start, sub);
    const own = periodBounds(subKey, sub);
    const from = own.from < bounds.from ? bounds.from : own.from;
    const to = own.to > bounds.to ? bounds.to : own.to;
    // The parent period already says the year, so a month is just "January".
    const label =
      sub === "week"
        ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" }).formatRange(utcDay(from), utcDay(to))
        : sub === "month"
          ? utcDay(from).toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })
          : periodLabel(subKey, sub);
    pieces.push({ key: subKey, from, to, label });
    start = addDays(own.to, 1);
  }
  return pieces;
}

// Breakdown rows for `pieces` (from subPeriods) given that metric's series
// for the same sub-granularity and range — only the pieces where something
// was logged (a week with workouts on Mon and Fri lists just those two
// days), each with its value and its change from the row before it.
export function breakdownRows(pieces, series) {
  const rows = [];
  for (const piece of pieces) {
    const point = pointAt(series, piece.key);
    if (!point) continue;
    const previous = rows[rows.length - 1];
    rows.push({
      ...piece,
      value: point.value,
      ...(previous ? changeBetween(previous.value, point.value) : { change: null, pct: null }),
    });
  }
  return rows;
}

// Whether a calendar date falls in an optional { from, to } range.
const inRange = (date, range) => !range || (date >= range.from && date <= range.to);

// The series point for one period, or null if nothing was logged in it.
export function pointAt(series, key) {
  return series.find((p) => p.key === key) ?? null;
}

// The selected period against the period with data before it:
// { change, pct, from, to } — or null when the period has no data (or is
// the first one logged).
export function changeAt(series, key) {
  const i = series.findIndex((p) => p.key === key);
  if (i <= 0) return null;
  return { ...changeBetween(series[i - 1].value, series[i].value), from: series[i - 1], to: series[i] };
}

// Every series below takes an optional `range` ({ from, to } calendar
// dates, inclusive) to count only what was logged in it — used to break a
// month down by week without the neighbouring month's days.

// Buckets `sessions` by period and reduces each bucket with `reduceFn`,
// which receives the array of raw values collected for that bucket.
function bucketSessions(sessions, granularity, collectFn, range) {
  const buckets = new Map();
  for (const session of sessions) {
    if (!session.completedAt || !inRange(localDateOf(session.completedAt), range)) continue;
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
export function totalWeightSeries(sessions, granularity, range) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    arr.push(session.totalWeightLifted || 0);
  }, range);
  return toSortedSeries(buckets, granularity, (values) => values.reduce((a, b) => a + b, 0));
}

// Average weight per logged set per period (progressive-overload signal).
export function averageWeightSeries(sessions, granularity, range) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.weight != null) arr.push(set.weight);
      }
    }
  }, range);
  return toSortedSeries(buckets, granularity, (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  );
}

// Average logged effort (1-10) per period.
export function averageEffortSeries(sessions, granularity, range) {
  const buckets = bucketSessions(sessions, granularity, (session, arr) => {
    for (const exercise of session.exercises) {
      for (const set of exercise.sets) {
        if (set.effort != null) arr.push(set.effort);
      }
    }
  }, range);
  return toSortedSeries(buckets, granularity, (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  );
}

// Average weight per set per period, split out per body area — matched via
// each exercise's PRIMARY tag(s) in the exercise library (by slugified name).
// Returns { [area]: [{ key, label, value }] }, areas with no data omitted.
export function bodyAreaWeightSeries(sessions, exerciseLibraryBySlug, granularity, range) {
  const areaBuckets = new Map(); // area -> Map(periodKey -> values[])

  for (const session of sessions) {
    if (!session.completedAt || !inRange(localDateOf(session.completedAt), range)) continue;
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

// { change, pct } from `from` to `to` — pct null when `from` is 0.
function changeBetween(from, to) {
  const change = to - from;
  return { change, pct: from ? (change / Math.abs(from)) * 100 : null };
}

// The first period against the latest — the whole history — or null
// without two periods.
export function overallChange(series) {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  return { ...changeBetween(first.value, last.value), from: first, to: last };
}

// Body weight / a tape measurement over time from measurement entries
// ({ date: "YYYY-MM-DD", weightKg, measurements }). `getValue(entry)`
// picks the number (or null if that entry didn't record it). Each period
// shows the latest reading in it — a weigh-in is a point-in-time value,
// so averaging or summing across a week would misrepresent it.
export function bodyMetricSeries(entries, getValue, granularity, range) {
  const buckets = new Map();
  for (const entry of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!inRange(entry.date, range)) continue;
    const value = getValue(entry);
    if (value == null) continue;
    buckets.set(periodKey(entry.date, granularity), [value]);
  }
  return toSortedSeries(buckets, granularity, (values) => values[values.length - 1]);
}
