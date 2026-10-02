"use client";

import AppHeader from "../../components/AppHeader";
import { GRANULARITIES } from "./useReportData";
import { periodKey, periodTitle, shiftDate, todayDate, weekRange } from "../../lib/reports";
import styles from "./page.module.css";

// Weekly / Monthly / Yearly switch, then ‹ This week › to step back and
// forward through those periods. Shared by the overview and detail pages;
// `data` is useReportData()'s result.
export function ReportControls({ data }) {
  const { granularity, setGranularity, date, setDate, selectedKey, currentKey } = data;
  const atCurrent = selectedKey >= currentKey;
  const lastWeekKey = periodKey(shiftDate(todayDate(), "week", -1), "week");
  const noun = granularity === "week" ? "week" : granularity === "month" ? "month" : "year";

  return (
    <div className={styles.controls}>
      <div className={styles.granularityRow} role="tablist" aria-label="Report period">
        {GRANULARITIES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={granularity === key}
            className={`${styles.granularityButton} ${granularity === key ? styles.granularityButtonSelected : ""}`}
            onClick={() => setGranularity(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.periodNav}>
        <button
          type="button"
          className={styles.periodArrow}
          onClick={() => setDate(shiftDate(date, granularity, -1))}
          aria-label={`Previous ${noun}`}
        >
          ‹
        </button>
        <span className={styles.periodTitle} aria-live="polite">
          {periodTitle(selectedKey, granularity)}
          {/* "This week" / "Last week" don't say which days — show them
              (Mon–Sun). Older weeks' titles are already their dates. */}
          {granularity === "week" && (selectedKey === currentKey || selectedKey === lastWeekKey) && (
            <span className={styles.periodRange}>{weekRange(selectedKey)}</span>
          )}
        </span>
        <button
          type="button"
          className={styles.periodArrow}
          onClick={() => setDate(shiftDate(date, granularity, 1))}
          disabled={atCurrent}
          aria-label={`Next ${noun}`}
        >
          ›
        </button>
        {!atCurrent && (
          <button type="button" className={styles.periodToday} onClick={() => setDate(null)}>
            Back to this {noun}
          </button>
        )}
      </div>
    </div>
  );
}

// Frame for a report detail page: header back to the overview (keeping the
// chosen period and date), title, report controls, then the page's content.
export default function ReportShell({ title, subtitle, data, children }) {
  return (
    <>
      <AppHeader backHref={`/reports?${data.query}`} backLabel="Reports" />
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {data.error && <p className={styles.errorText}>{data.error}</p>}
        <ReportControls data={data} />
        {children}
      </main>
    </>
  );
}
