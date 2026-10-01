"use client";

import { useEffect, useRef } from "react";
import MeasurementStepper, { STEPS } from "./MeasurementStepper";
import styles from "./MeasurementDialog.module.css";

// Phone: tapping a body part (or weight) opens this, on that measurement.
// It's the one-at-a-time stepper in a modal pinned to the top of the
// screen, so it stays above the keyboard. Rendered inside the page's
// <form>, so its Save buttons submit the whole entry. Closing it (×,
// Escape, backdrop) keeps whatever was typed — still unsaved until Save.
export default function MeasurementDialog({ onClose, error, ...stepperProps }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) close();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onClose}
      onClick={handleBackdropClick}
      aria-label={`Log ${STEPS[stepperProps.stepIndex].label.toLowerCase()}`}
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.title}>Log measurements</p>
          <button type="button" className={styles.close} onClick={close}>
            Done
          </button>
        </div>
        <MeasurementStepper {...stepperProps} autoFocus />
        {/* A failed save — shown here, as the page's own message is behind the dialog. */}
        {error && <div className={styles.error}>{error}</div>}
      </div>
    </dialog>
  );
}
