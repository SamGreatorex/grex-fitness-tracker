"use client";

import { useEffect, useRef } from "react";
import styles from "./EffortDialog.module.css";
import { effortColor } from "../lib/effort";

const EFFORT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

// Opens the moment a set is logged, purely to capture how it felt —
// closes itself the instant a level is picked, no separate confirm step.
// The rest countdown lives independently in RestOverlay, not here, so
// rating effort and waiting out rest are two unrelated things now instead
// of being stuck together in one blocking dialog.
export default function EffortDialog({ effort, onSelectEffort, onClose }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleSelect = (level) => {
    onSelectEffort(level);
    dialogRef.current?.close();
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) dialogRef.current.close();
  };

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

        <div className={styles.effortGrid}>
          {EFFORT_LEVELS.map((level) => {
            const selected = effort === level;
            return (
              <button
                key={level}
                type="button"
                className={`${styles.effortButton} ${selected ? styles.effortButtonSelected : ""}`}
                style={{ "--effort-color": effortColor(level) }}
                onClick={() => handleSelect(level)}
                aria-pressed={selected}
                aria-label={`Effort ${level} out of 10`}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className={styles.effortHint}>
          <span>Easy</span>
          <span>Hard</span>
        </div>
      </div>
    </dialog>
  );
}
