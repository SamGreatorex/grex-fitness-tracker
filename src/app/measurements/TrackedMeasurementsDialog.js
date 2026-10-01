"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/apiClient";
import { MEASUREMENTS } from "../../lib/measurements";
import styles from "./TrackedMeasurementsDialog.module.css";

// Lets the user pick which tape measurements they track — saved to their
// profile (trackedMeasurements), so it's the same on every device. Weight
// is always tracked. Untracking one only hides it from the measurements
// page; anything already logged for it is kept, and stays in reports.
export default function TrackedMeasurementsDialog({ tracked, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set(tracked));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = () => {
    if (!saving) dialogRef.current?.close();
  };

  const toggle = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      // Stored in the standard order, whatever order they were ticked in.
      const trackedMeasurements = MEASUREMENTS.map((m) => m.key).filter((k) => selected.has(k));
      const { user } = await api.patch("/api/me", { trackedMeasurements });
      onSaved(user);
      dialogRef.current?.close();
    } catch (err) {
      setError(err.message || "Could not save your choice.");
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={onClose}
      onCancel={(e) => saving && e.preventDefault()}
      onClick={(e) => e.target === dialogRef.current && close()}
      aria-labelledby="tracked-title"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 id="tracked-title" className={styles.title}>
            Measurements you track
          </h2>
          <button type="button" className={styles.close} aria-label="Close" disabled={saving} onClick={close}>
            ×
          </button>
        </div>

        <p className={styles.intro}>
          Pick the body measurements you want to log. Weight is always included. Removing one only hides it here —
          anything you&apos;ve already logged is kept and still shows in your reports.
        </p>

        <div className={styles.bulk}>
          <span className={styles.count}>
            {selected.size} of {MEASUREMENTS.length} selected
          </span>
          <button type="button" className={styles.bulkButton} onClick={() => setSelected(new Set(MEASUREMENTS.map((m) => m.key)))}>
            Select all
          </button>
          <button type="button" className={styles.bulkButton} onClick={() => setSelected(new Set())}>
            Clear all
          </button>
        </div>

        <ul className={styles.list}>
          {MEASUREMENTS.map(({ key, label, hint }) => (
            <li key={key}>
              <label className={`${styles.option} ${selected.has(key) ? styles.optionOn : ""}`}>
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} />
                <span className={styles.optionText}>
                  <span className={styles.optionLabel}>{label}</span>
                  <span className={styles.optionHint}>{hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} disabled={saving} onClick={close}>
            Cancel
          </button>
          <button type="button" className={styles.save} disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
