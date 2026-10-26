"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./EffortDialog.module.css";
import { EFFORT_SCALE, effortColor, effortLabel } from "../lib/effort";

// How long the picked level's label stays up before the dialog closes.
const CLOSE_DELAY_MS = 700;

// Opens the moment a set is logged, purely to capture how it felt. Picking
// a level saves it straight away and shows its label (e.g. "7 · Harder")
// for a moment, then the dialog closes itself — no separate confirm step.
// The rest countdown lives independently in RestOverlay, not here, so
// rating effort and waiting out rest are two unrelated things now instead
// of being stuck together in one blocking dialog.
export default function EffortDialog({ effort, onSelectEffort, onClose }) {
  const dialogRef = useRef(null);
  const closeTimer = useRef(null);
  const [picked, setPicked] = useState(effort ?? null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => clearTimeout(closeTimer.current);
  }, []);

  const handleSelect = (level) => {
    setPicked(level);
    setHovered(null);
    onSelectEffort(level);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => dialogRef.current?.close(), CLOSE_DELAY_MS);
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) dialogRef.current.close();
  };

  // Hovering previews a level's label; otherwise show the picked one.
  const shown = hovered ?? picked;

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} onClick={handleBackdropClick}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.label}>How did that set feel?</p>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Close without rating"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </div>

        <div className={styles.effortGrid} onMouseLeave={() => setHovered(null)}>
          {EFFORT_SCALE.map(({ level, color, label }) => {
            const selected = picked === level;
            return (
              <button
                key={level}
                type="button"
                className={`${styles.effortButton} ${selected ? styles.effortButtonSelected : ""}`}
                style={{ "--effort-color": color }}
                onClick={() => handleSelect(level)}
                onMouseEnter={() => setHovered(level)}
                aria-pressed={selected}
                aria-label={`Effort ${level} out of 10: ${label}`}
              >
                {level}
              </button>
            );
          })}
        </div>
        <p className={styles.effortLabel} style={shown != null ? { color: effortColor(shown) } : undefined} aria-live="polite">
          {shown != null ? `${shown} · ${effortLabel(shown)}` : "1 = Extremely Easy · 10 = Maximal Exertion"}
        </p>
      </div>
    </dialog>
  );
}
