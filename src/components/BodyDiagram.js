import { MEASUREMENT_LABELS } from "../lib/measurements";
import styles from "./BodyDiagram.module.css";

// Where each tape measurement goes, drawn across a front-facing figure
// (so the person's right side is on the viewer's left). [x1, x2, y].
const MEASURE_LINES = {
  neck: [86, 114, 68],
  shoulders: [50, 150, 88],
  chest: [60, 140, 114],
  waist: [70, 130, 166],
  hips: [64, 136, 202],
  rightArm: [38, 66, 124],
  leftArm: [134, 162, 124],
  rightLeg: [64, 100, 244],
  leftLeg: [100, 136, 244],
  rightCalf: [66, 94, 322],
  leftCalf: [106, 134, 322],
};

// Front-view figure with a measurement line per MEASUREMENTS key. The
// `active` line is highlighted and labelled; lines with a value in
// `filled` are drawn solid. Clicking a line calls onSelect(key).
export default function BodyDiagram({ active, filled = {}, onSelect }) {
  return (
    <svg className={styles.svg} viewBox="0 0 200 400" role="img" aria-label="Body measurement guide">
      <g className={styles.body}>
        <ellipse cx="100" cy="36" rx="19" ry="23" />
        <rect x="91" y="54" width="18" height="20" rx="6" />
        <path d="M66 82 C80 72 120 72 134 82 L140 118 C138 146 130 160 128 176 L134 204 C136 216 64 216 66 204 L72 176 C70 160 62 146 60 118 Z" />
        {/* Arms: upper arm, forearm, hand — viewer's left is the person's right. */}
        <line x1="60" y1="90" x2="48" y2="158" strokeWidth="20" />
        <line x1="48" y1="158" x2="40" y2="222" strokeWidth="15" />
        <circle cx="38" cy="234" r="9" />
        <line x1="140" y1="90" x2="152" y2="158" strokeWidth="20" />
        <line x1="152" y1="158" x2="160" y2="222" strokeWidth="15" />
        <circle cx="162" cy="234" r="9" />
        {/* Legs: thigh, calf, foot. */}
        <line x1="84" y1="206" x2="81" y2="290" strokeWidth="32" />
        <line x1="81" y1="290" x2="80" y2="368" strokeWidth="24" />
        <ellipse cx="78" cy="380" rx="13" ry="7" />
        <line x1="116" y1="206" x2="119" y2="290" strokeWidth="32" />
        <line x1="119" y1="290" x2="120" y2="368" strokeWidth="24" />
        <ellipse cx="122" cy="380" rx="13" ry="7" />
      </g>

      {Object.entries(MEASURE_LINES).map(([key, [x1, x2, y]]) => {
        const isActive = key === active;
        const isFilled = filled[key] != null && filled[key] !== "";
        return (
          <g key={key} className={styles.measure} onClick={() => onSelect?.(key)}>
            {/* Wide invisible hit target so thin lines are easy to tap. */}
            <line className={styles.hit} x1={x1} x2={x2} y1={y} y2={y} />
            <line
              className={`${styles.line} ${isFilled ? styles.lineFilled : ""} ${isActive ? styles.lineActive : ""}`}
              x1={x1}
              x2={x2}
              y1={y}
              y2={y}
            />
            {isActive && (
              <>
                <circle className={styles.cap} cx={x1} cy={y} r="3" />
                <circle className={styles.cap} cx={x2} cy={y} r="3" />
              </>
            )}
            <title>{MEASUREMENT_LABELS[key]}</title>
          </g>
        );
      })}

      {active && MEASURE_LINES[active] && (
        <text
          className={styles.label}
          x={(MEASURE_LINES[active][0] + MEASURE_LINES[active][1]) / 2}
          y={MEASURE_LINES[active][2] - 7}
          textAnchor="middle"
        >
          {MEASUREMENT_LABELS[active]}
        </text>
      )}

      <text className={styles.caption} x="100" y="398" textAnchor="middle">
        Facing you — your right is on the left
      </text>
    </svg>
  );
}
