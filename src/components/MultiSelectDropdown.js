"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./MultiSelectDropdown.module.css";

// A dropdown of checkboxes. The closed state shows the selected values as
// chips. `noteFor(option)` can return a short note shown beside an option
// (e.g. which other group it currently belongs to).
export default function MultiSelectDropdown({
  label,
  hint,
  options,
  selected,
  onToggle,
  noteFor,
  placeholder = "None selected",
  tone,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        // Close just this menu, not the dialog it sits in.
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    rootRef.current?.addEventListener("keydown", onKeyDown);
    const root = rootRef.current;
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      root?.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <span className={styles.label}>{label}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={listId}
      >
        <span className={styles.chips}>
          {selected.length === 0 ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            selected.map((value) => (
              <span key={value} className={`${styles.chip} ${tone ? styles[`chip_${tone}`] : ""}`}>
                {value}
              </span>
            ))
          )}
        </span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} id={listId} role="group" aria-label={label}>
          {options.map((option) => {
            const checked = selected.includes(option);
            const note = !checked && noteFor ? noteFor(option) : null;
            return (
              <label key={option} className={`${styles.option} ${checked ? styles.optionChecked : ""}`}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(option)} />
                <span className={styles.optionLabel}>{option}</span>
                {note && <span className={styles.optionNote}>{note}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
