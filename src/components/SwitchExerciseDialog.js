"use client";

import { useRef, useState } from "react";
import styles from "./SwitchExerciseDialog.module.css";
import { rankAlternatives } from "../lib/exerciseSimilarity";

function LibraryThumb({ exercise }) {
  if (exercise.mediaType === "video" && exercise.mediaUrl) {
    return <video className={styles.thumb} src={exercise.mediaUrl} muted playsInline preload="metadata" />;
  }
  if (exercise.mediaUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.thumb} src={exercise.mediaUrl} alt="" loading="lazy" />;
  }
  return <div className={styles.thumbPlaceholder} />;
}

// A "Switch exercise" trigger + dialog listing every other library exercise,
// ranked by how closely its body-area tags match the one currently in this
// slot — the best substitutes for training the same muscles surface first.
// Switching only affects this session; the programme's own exercise list is
// never changed.
export default function SwitchExerciseDialog({ currentName, currentLibraryEntry, library, onSelect }) {
  const dialogRef = useRef(null);
  const [ranked, setRanked] = useState([]);

  const open = () => {
    setRanked(rankAlternatives(currentLibraryEntry, library || []));
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();
  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) close();
  };

  const handleSelect = (exercise) => {
    onSelect(exercise);
    close();
  };

  return (
    <>
      <button type="button" className={styles.trigger} onClick={open}>
        Switch exercise
      </button>

      <dialog ref={dialogRef} className={styles.dialog} onClick={handleBackdropClick}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <h2 className={styles.title}>Switch &ldquo;{currentName}&rdquo;</h2>
            <button type="button" className={styles.close} aria-label="Close" onClick={close}>
              ×
            </button>
          </div>
          <p className={styles.hint}>Ordered by closest match to the same body areas.</p>

          {ranked.length === 0 ? (
            <p className={styles.empty}>No other exercises in the library yet.</p>
          ) : (
            <div className={styles.list}>
              {ranked.map(({ exercise, score }) => (
                <button
                  key={exercise.exerciseId}
                  type="button"
                  className={styles.row}
                  onClick={() => handleSelect(exercise)}
                >
                  <LibraryThumb exercise={exercise} />
                  <div className={styles.rowInfo}>
                    <p className={styles.rowName}>{exercise.name}</p>
                    <div className={styles.rowTags}>
                      {exercise.primaryTags?.map((tag) => (
                        <span key={`p-${tag}`} className={`${styles.tag} ${styles.tagPrimary}`}>{tag}</span>
                      ))}
                      {exercise.secondaryTags?.map((tag) => (
                        <span key={`s-${tag}`} className={`${styles.tag} ${styles.tagSecondary}`}>{tag}</span>
                      ))}
                      {exercise.stabilizerTags?.map((tag) => (
                        <span key={`st-${tag}`} className={`${styles.tag} ${styles.tagStabilizer}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  {score > 0 && <span className={styles.matchBadge}>Match</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
