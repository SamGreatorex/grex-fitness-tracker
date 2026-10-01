"use client";

import TrendChart from "../../components/TrendChart";
import { latestPeriodChange, overallChange, periodBreakdown } from "../../lib/reports";
import { GRANULARITIES } from "./useReportData";
import styles from "./MetricDetail.module.css";

// Latest period with data vs the one before — which may not be the
// current calendar week, hence "week on week" rather than "this week".
const PERIOD_NAMES = { week: "week", month: "month", year: "year" };
const PERIOD_TITLES = { week: "Week on week", month: "Month on month", year: "Year on year" };

// The detail view of one report metric (body weight, a measurement, total
// lifted…): where it is now, how much it's changed since the start and
// versus the previous week / month / year (in its units and as a % gained
// or lost), its chart, and a period-by-period breakdown.
//
// `seriesFor(granularity)` returns that metric's [{ key, label, value }]
// series. `formatValue(v)` shows a value with its unit; `formatChange(d)`
// shows the size of a change (no sign) with its unit. `words` names the
// directions ("gained"/"lost" for weight). `goodDirection` ("up" | "down")
// colours changes green/red; leave it unset where neither is better (e.g.
// body weight, which depends on the person's goal). `chart` is passed to
// TrendChart as-is.
export default function MetricDetail({
  title,
  seriesFor,
  granularity,
  formatValue,
  formatChange,
  words = { up: "up", down: "down" },
  goodDirection,
  chart,
}) {
  const series = seriesFor(granularity);
  const last = series[series.length - 1];
  const overall = overallChange(series);
  const rows = periodBreakdown(series);
  const granularityLabel = GRANULARITIES.find((g) => g.key === granularity)?.label ?? "";

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
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Current</span>
          <span className={styles.tileValue}>{formatValue(last.value)}</span>
          <span className={styles.tileNote}>{last.label}</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Since start</span>
          {overall ? (
            <>
              <span className={`${styles.tileValue} ${tone(overall.change)}`}>{describe(overall.change)}</span>
              <span className={styles.tileNote}>
                {pctText(overall.pct)} since {overall.from.label}
              </span>
            </>
          ) : (
            <span className={styles.tileNote}>Log more to compare</span>
          )}
        </div>
      </div>

      {/* Week / month / year at a glance, whichever view is selected below. */}
      <div className={styles.periods}>
        {GRANULARITIES.map(({ key }) => {
          const change = latestPeriodChange(seriesFor(key));
          return (
            <div key={key} className={`${styles.tile} ${key === granularity ? styles.tileSelected : ""}`}>
              <span className={styles.tileLabel}>{PERIOD_TITLES[key]}</span>
              {change ? (
                <>
                  <span className={`${styles.periodValue} ${tone(change.change)}`}>{describe(change.change)}</span>
                  <span className={`${styles.periodPct} ${tone(change.change)}`}>{pctText(change.pct)}</span>
                  <span className={styles.tileNote}>
                    {change.to.label} vs {change.from.label}
                  </span>
                </>
              ) : (
                <span className={styles.tileNote}>Needs two {PERIOD_NAMES[key]}s of data</span>
              )}
            </div>
          );
        })}
      </div>

      <TrendChart title={`${title} — ${granularityLabel.toLowerCase()}`} data={series} {...chart} />

      <h3 className={styles.tableTitle}>{granularityLabel} breakdown</h3>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{granularityLabel.replace(/ly$/, "")}</th>
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
    </section>
  );
}
