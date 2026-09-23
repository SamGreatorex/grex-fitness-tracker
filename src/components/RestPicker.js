"use client";

import { useRef, useState } from "react";
import styles from "./RestPicker.module.css";

const PRESETS = [15, 30, 45, 60, 90, 120, 180];

function formatMmSs(totalSeconds) {
  const safe = Math.max(0, totalSeconds || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// A tappable "1:00"-style chip that opens a small dialog for adjusting a
// set's rest time (+/-15s, or a quick preset), then either applies it to
// just that set or to every set of the exercise.
export default function RestPicker({ seconds, onApplyToSet, onApplyToAll }) {
  const dialogRef = useRef(null);
  const [draft, setDraft] = useState(seconds);

  const open = () => {
    setDraft(seconds);
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();
  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) close();
  };

  const adjust = (delta) => setDraft((prev) => Math.max(0, prev + delta));

  return (
    <>
      <button type="button" className={styles.chip} onClick={open} aria-label="Edit rest time">
        {formatMmSs(seconds)}
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClick={handleBackdropClick}>
        <div className={styles.inner}>
          <p className={styles.label}>Rest time</p>
          <p className={styles.value}>{formatMmSs(draft)}</p>

          <div className={styles.adjustRow}>
            <button type="button" className={styles.adjustButton} onClick={() => adjust(-15)}>
              -15s
            </button>
            <button type="button" className={styles.adjustButton} onClick={() => adjust(15)}>
              +15s
            </button>
          </div>

          <div className={styles.presets}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.presetButton} ${draft === preset ? styles.presetButtonSelected : ""}`}
                onClick={() => setDraft(preset)}
              >
                {formatMmSs(preset)}
              </button>
            ))}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.applyOne}
              onClick={() => {
                onApplyToSet(draft);
                close();
              }}
            >
              Apply to this set
            </button>
            <button
              type="button"
              className={styles.applyAll}
              onClick={() => {
                onApplyToAll(draft);
                close();
              }}
            >
              Apply to all sets
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
