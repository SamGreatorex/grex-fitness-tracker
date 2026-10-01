"use client";

import AppHeader from "../../components/AppHeader";
import { GRANULARITIES } from "./useReportData";
import styles from "./page.module.css";

// Weekly / Monthly / Yearly switch, shared by the overview and detail pages.
export function GranularityToggle({ granularity, onChange }) {
  return (
    <div className={styles.granularityRow} role="tablist" aria-label="Report period">
      {GRANULARITIES.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={granularity === key}
          className={`${styles.granularityButton} ${granularity === key ? styles.granularityButtonSelected : ""}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Frame for a report detail page: header back to the overview (keeping the
// chosen period), title, period switch, then the page's own content.
export default function ReportShell({ title, subtitle, data, children }) {
  const { granularity, setGranularity, error } = data;
  return (
    <>
      <AppHeader backHref={`/reports?period=${granularity}`} backLabel="Reports" />
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {error && <p className={styles.errorText}>{error}</p>}
        <GranularityToggle granularity={granularity} onChange={setGranularity} />
        {children}
      </main>
    </>
  );
}
