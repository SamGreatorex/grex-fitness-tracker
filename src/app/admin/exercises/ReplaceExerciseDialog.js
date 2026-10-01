"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/apiClient";
import { isCardio } from "../../../lib/exerciseTypes";
import { rankAlternatives } from "../../../lib/exerciseSimilarity";
import ConfirmDialog from "../../../components/ConfirmDialog";
import Dropdown from "../../../components/Dropdown";
import UsageItem from "./UsageItem";
import styles from "./page.module.css";

// Deleting an exercise that programmes use: the admin must pick one to
// switch it to (same type), which replaces it in every programme and
// template listed, and then it's deleted. `usage` is one entry per
// programme day: { programName, isTemplate, ownerUserId, dayLabel };
// `userNames` maps userId → display name.
export default function ReplaceExerciseDialog({ exercise, usage, library, userNames, onCancel, onDeleted }) {
  const dialogRef = useRef(null);
  const [replacementId, setReplacementId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Same type only — closest body-area matches first.
  const ranked = useMemo(
    () => rankAlternatives(exercise, library.filter((e) => isCardio(e) === isCardio(exercise))),
    [exercise, library]
  );
  const matches = ranked.filter((r) => r.score > 0);
  const others = ranked.filter((r) => r.score === 0);

  const programmeCount = new Set(usage.map((u) => u.programId ?? u.programName)).size;
  const replacement = library.find((e) => e.exerciseId === replacementId);

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current && !deleting) dialogRef.current.close();
  };

  // Submitting only asks "are you sure?"; confirming that does the work.
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!replacement) return;
    setError("");
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/exercises/${encodeURIComponent(exercise.exerciseId)}?replaceWith=${encodeURIComponent(replacementId)}`);
      onDeleted();
    } catch (err) {
      setError(err.message || "Could not switch and delete the exercise.");
      setDeleting(false);
    }
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onCancel} onClick={handleBackdropClick}>
      <div className={styles.dialogInner}>
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>Delete &ldquo;{exercise.name}&rdquo;</h2>
          <button type="button" className={styles.dialogClose} aria-label="Close" disabled={deleting} onClick={() => dialogRef.current?.close()}>
            ×
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <p className={styles.replaceIntro}>
            It&apos;s used in {programmeCount} programme{programmeCount === 1 ? "" : "s"}. Pick an exercise to switch it
            to everywhere before it&apos;s deleted — each slot keeps its sets, reps and rest
            {isCardio(exercise) ? " (or time)" : ""}.
          </p>

          <ul className={`${styles.usageList} ${styles.replaceUsage}`}>
            {usage.map((u, i) => (
              <UsageItem key={i} usage={u} userNames={userNames} />
            ))}
          </ul>

          <div className={styles.field}>
            <span className={styles.label} id="replacement-label">Switch to</span>
            <Dropdown
              className={styles.select}
              aria-labelledby="replacement-label"
              value={replacementId}
              onChange={setReplacementId}
              disabled={deleting}
              placeholder={`Choose a ${isCardio(exercise) ? "cardio" : "strength"} exercise…`}
              options={[
                ...(matches.length > 0
                  ? [{ label: "Closest matches", options: matches.map(({ exercise: e }) => ({ value: e.exerciseId, label: e.name })) }]
                  : []),
                ...(others.length > 0
                  ? [
                      {
                        label: matches.length > 0 ? "Other exercises" : "Exercises",
                        options: others.map(({ exercise: e }) => ({ value: e.exerciseId, label: e.name })),
                      },
                    ]
                  : []),
              ]}
            />
            {ranked.length === 0 && (
              <span className={styles.hint}>
                There&apos;s no other {isCardio(exercise) ? "cardio" : "strength"} exercise to switch to — create one first.
              </span>
            )}
          </div>

          <div className={styles.dialogActions}>
            <button type="button" className={styles.rowButton} disabled={deleting} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="submit" className={`${styles.submitButton} ${styles.dangerButton}`} disabled={!replacement || deleting}>
              {replacement ? `Switch to ${replacement.name} & delete` : "Switch & delete"}
            </button>
          </div>
        </form>
      </div>

      {confirming && replacement && (
        <ConfirmDialog
          title="Delete exercise?"
          confirmLabel="Switch & delete"
          busyLabel="Switching…"
          danger
          busy={deleting}
          error={error}
          onConfirm={handleConfirm}
          onCancel={() => {
            setConfirming(false);
            setError("");
          }}
        >
          <p>
            Are you sure you want to delete <strong>{exercise.name}</strong>?
          </p>
          <p>
            It will be switched to <strong>{replacement.name}</strong> in {programmeCount} programme
            {programmeCount === 1 ? "" : "s"} ({usage.length} day{usage.length === 1 ? "" : "s"}), then deleted along
            with its uploaded image or video. This can&apos;t be undone.
          </p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}
