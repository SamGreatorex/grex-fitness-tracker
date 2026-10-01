"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ExerciseFilters from "./ExerciseFilters";
import { EMPTY_FILTERS, filterExercises } from "../lib/exerciseFilters";
import styles from "./ExercisePicker.module.css";

// Picks exercises from the library to add to a programme day — in the
// builder, or mid-workout.
// Stays open so several can be added in one go; `addedCounts` shows how
// many times each one is already on the day.
export default function ExercisePicker({ library, addedCounts, onAdd, onClose }) {
  const dialogRef = useRef(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const filtered = useMemo(() => filterExercises(library, filters), [library, filters]);

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) dialogRef.current.close();
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose} onClick={handleBackdropClick}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <p className={styles.title}>Add exercises</p>
          <button type="button" className={styles.done} onClick={() => dialogRef.current?.close()}>
            Done
          </button>
        </div>

        <ExerciseFilters
          value={filters}
          onChange={setFilters}
          exercises={library}
          shown={filtered.length}
          total={library.length}
          autoFocus
        />

        <ul className={styles.list}>
          {filtered.length === 0 && <li className={styles.empty}>No exercises match these filters.</li>}
          {filtered.map((exercise) => {
            const count = addedCounts[exercise.name] ?? 0;
            return (
              <li key={exercise.exerciseId}>
                <button type="button" className={styles.item} onClick={() => onAdd(exercise)}>
                  {exercise.mediaType === "image" && exercise.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={exercise.mediaUrl} alt="" className={styles.thumb} />
                  ) : (
                    <span className={styles.thumb} />
                  )}
                  <span className={styles.itemText}>
                    <span className={styles.itemName}>
                      {exercise.name}
                      {exercise.type === "cardio" && <span className={styles.cardioBadge}>Cardio</span>}
                    </span>
                    {exercise.primaryTags?.length > 0 && (
                      <span className={styles.itemTags}>{exercise.primaryTags.join(" · ")}</span>
                    )}
                  </span>
                  <span className={count ? styles.addedBadge : styles.addBadge}>{count ? `✓ ${count}` : "+"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </dialog>
  );
}
