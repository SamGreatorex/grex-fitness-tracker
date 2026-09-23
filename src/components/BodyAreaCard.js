import styles from "./BodyAreaCard.module.css";
import Sparkline from "./Sparkline";
import { trendDelta } from "../lib/reports";

// Stat-tile form: label + value + signed delta (up is good here — more
// weight means more strength) + a muted sparkline of the period history.
export default function BodyAreaCard({ area, series }) {
  const latest = series[series.length - 1];
  const delta = trendDelta(series);

  const deltaClass =
    delta == null || Math.abs(delta) < 1 ? styles.deltaFlat : delta > 0 ? styles.deltaUp : styles.deltaDown;
  const deltaText = delta == null ? "New" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;

  return (
    <div className="vizRoot">
      <div className={styles.card}>
        <p className={styles.label}>{area}</p>
        <div className={styles.valueRow}>
          <span className={styles.value}>{latest.value.toFixed(1)}</span>
          <span className={styles.unit}>kg avg</span>
          <span className={`${styles.delta} ${deltaClass}`}>{deltaText}</span>
        </div>
        <div className={styles.sparklineRow}>
          <Sparkline values={series.map((s) => s.value)} />
        </div>
      </div>
    </div>
  );
}
