"use client";

import TrendChart from "../../components/TrendChart";
import {
  SUB_GRANULARITY,
  breakdownRows,
  changeAt,
  overallChange,
  periodBounds,
  periodKey,
  periodTitle,
  pointAt,
  subPeriods,
  weekRange,
} from "../../lib/reports";
import { GRANULARITIES } from "./useReportData";
import styles from "./MetricDetail.module.css";

const PERIOD_NAMES = { week: "week", month: "month", year: "year" };
// The breakdown table: a week by day, a month by week, a year by month.
const BREAKDOWN_TITLES = { day: "Daily", week: "Weekly", month: "Monthly" };
const BREAKDOWN_COLUMNS = { day: "Day", week: "Week", month: "Month" };

// The detail view of one report metric (body weight, a measurement, total
// lifted…) for the selected period — the week / month / year containing
// `date`: its value, how much it's changed since the start and versus the
// previous week / month / year (in its units and as a % gained or lost),
// the chart, and a breakdown of what's inside it (a week day by day, a
// month week by week, a year month by month).
//
// `seriesFor(granularity, range)` returns that metric's [{ key, label,
// value }] series — granularity "day" | "week" | "month" | "year", counting
// only what was logged within `range` ({ from, to } dates) when given. `formatValue(v)` shows a value with its unit; `formatChange(d)`
// shows the size of a change (no sign) with its unit. `words` names the
// directions ("gained"/"lost" for weight). `goodDirection` ("up" | "down")
// colours changes green/red; leave it unset where neither is better (e.g.
// body weight, which depends on the person's goal). `chart` is passed to
// TrendChart as-is.
export default function MetricDetail({
  title,
  seriesFor,
  granularity,
  date,
  formatValue,
  formatChange,
  words = { up: "up", down: "down" },
  goodDirection,
  chart,
}) {
  const series = seriesFor(granularity);
  const last = series[series.length - 1];
  const selectedKey = periodKey(date, granularity);
  const selectedTitle = periodTitle(selectedKey, granularity);
  const selected = pointAt(series, selectedKey);
  // History as it stood at the selected period (nothing after it).
  const upToSelected = series.filter((p) => p.key <= selectedKey);
  const lastBefore = upToSelected[upToSelected.length - 1] ?? null;
  const overall = overallChange(upToSelected);
  const granularityLabel = GRANULARITIES.find((g) => g.key === granularity)?.label ?? "";
  // How to name a period here: a week by its Monday–Sunday dates
  // ("28 Sep – 4 Oct"), a month or year by its label.
  const nameOf = (point, g = granularity) => (g === "week" ? weekRange(point.key) : point.label);

  // What's inside the selected period, counting only its own days (so a
  // week that runs into next month only counts this month's part).
  const sub = SUB_GRANULARITY[granularity];
  const rows = breakdownRows(subPeriods(selectedKey, granularity), seriesFor(sub, periodBounds(selectedKey, granularity)));

  const tone = (change) => {
    if (!change || !goodDirection) return styles.neutral;
    return (change > 0) === (goodDirection === "up") ? styles.good : styles.bad;
  };

  // "▼ 0.8 kg lost" / "No change".
  const describe = (change) =>
    Math.abs(change) < 1e-9 ? "No change" : `${change > 0 ? "▲" : "▼"} ${formatChange(Math.abs(change))} ${change > 0 ? words.up : words.down}`;

  const pctText = (pct) => (pct == null ? "" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`);

  if (!last) {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.empty}>Nothing logged yet.</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{title}</h2>

      <div className={styles.headline}>
        <div className={`${styles.tile} ${styles.tileSelected}`}>
          <span className={styles.tileLabel}>{selectedTitle}</span>
          {selected ? (
            <>
              <span className={styles.tileValue}>{formatValue(selected.value)}</span>
              <span className={styles.tileNote}>{nameOf(selected)}</span>
            </>
          ) : (
            <>
              <span className={styles.tileValue}>—</span>
              <span className={styles.tileNote}>
                {lastBefore
                  ? `Nothing logged · last ${formatValue(lastBefore.value)} (${nameOf(lastBefore)})`
                  : "Nothing logged yet by then"}
              </span>
            </>
          )}
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Since start</span>
          {overall ? (
            <>
              <span className={`${styles.tileValue} ${tone(overall.change)}`}>{describe(overall.change)}</span>
              <span className={styles.tileNote}>
                {pctText(overall.pct)} · {nameOf(overall.from)} to {nameOf(overall.to)}
              </span>
            </>
          ) : (
            <span className={styles.tileNote}>Log more to compare</span>
          )}
        </div>
      </div>

      {/* The selected time's week, month and year, each against the one
          before it — whichever view is chosen below. */}
      <div className={styles.periods}>
        {GRANULARITIES.map(({ key: g }) => {
          const gSeries = seriesFor(g);
          const gKey = periodKey(date, g);
          const change = changeAt(gSeries, gKey);
          const has = !!pointAt(gSeries, gKey);
          return (
            <div key={g} className={`${styles.tile} ${g === granularity ? styles.tileSelected : ""}`}>
              <span className={styles.tileLabel}>{periodTitle(gKey, g)}</span>
              {change ? (
                <>
                  <span className={`${styles.periodValue} ${tone(change.change)}`}>{describe(change.change)}</span>
                  <span className={`${styles.periodPct} ${tone(change.change)}`}>{pctText(change.pct)}</span>
                  <span className={styles.tileNote}>vs {nameOf(change.from, g)}</span>
                </>
              ) : (
                <span className={styles.tileNote}>
                  {has ? `First ${PERIOD_NAMES[g]} logged — nothing to compare yet` : `Nothing logged this ${PERIOD_NAMES[g]}`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <TrendChart title={`${title} — ${granularityLabel.toLowerCase()}`} data={series} selectedKey={selectedKey} {...chart} />

      <h3 className={styles.tableTitle}>
        {BREAKDOWN_TITLES[sub]} breakdown <span className={styles.tableTitlePeriod}>· {selectedTitle}</span>
      </h3>
      {rows.length === 0 ? (
        <p className={styles.tableNote}>Nothing logged in this {PERIOD_NAMES[granularity]}.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{BREAKDOWN_COLUMNS[sub]}</th>
                <th scope="col" className={styles.num}>Value</th>
                <th scope="col" className={styles.num}>Change</th>
                <th scope="col" className={styles.num}>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td className={styles.num}>{formatValue(row.value)}</td>
                  <td className={`${styles.num} ${tone(row.change)}`}>
                    {row.change == null ? "—" : Math.abs(row.change) < 1e-9 ? "0" : `${row.change > 0 ? "+" : "−"}${formatChange(Math.abs(row.change))}`}
                  </td>
                  <td className={`${styles.num} ${tone(row.change)}`}>{row.pct == null ? "—" : pctText(row.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
