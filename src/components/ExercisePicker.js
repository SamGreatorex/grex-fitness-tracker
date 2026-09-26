"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ExercisePicker.module.css";

// Lets a PT pick exercises from the library to add to a programme day.
// Stays open so several can be added in one go; `addedCounts` shows how
// many times each one is already on the day.
export default function ExercisePicker({ library, addedCounts, onAdd, onClose }) {
  const dialogRef = useRef(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const tags = useMemo(
    () => [...new Set(library.flatMap((e) => e.primaryTags ?? []))].sort((a, b) => a.localeCompare(b)),
    [library]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return library.filter(
      (e) =>
        (!q || e.name.toLowerCase().includes(q)) &&
        (!tag || (e.primaryTags ?? []).includes(tag) || (e.secondaryTags ?? []).includes(tag))
    );
  }, [library, search, tag]);

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

        <div className={styles.filters}>
          <input
            className={styles.search}
            type="search"
            placeholder="Search exercises"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <select className={styles.tagSelect} value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by body area">
            <option value="">All areas</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <ul className={styles.list}>
          {filtered.length === 0 && <li className={styles.empty}>No exercises match.</li>}
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
                    <span className={styles.itemName}>{exercise.name}</span>
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
