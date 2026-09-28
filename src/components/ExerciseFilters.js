"use client";

import { useId, useMemo, useState } from "react";
import MultiSelectDropdown from "./MultiSelectDropdown";
import { BODY_AREAS, EXERCISE_LOCATIONS, EXERCISE_TYPES } from "../lib/exerciseTypes";
import { EMPTY_FILTERS, activeFilterCount, equipmentIn } from "../lib/exerciseFilters";
import styles from "./ExerciseFilters.module.css";

const TYPE_OPTIONS = [
  { value: EXERCISE_TYPES.STRENGTH, label: "Strength" },
  { value: EXERCISE_TYPES.CARDIO, label: "Cardio" },
];

// Search + filters for an exercise list. Controlled: `value` is a filters
// object (see EMPTY_FILTERS), `onChange` gets the updated one. `exercises`
// is the full (unfiltered) list, used to build the Equipment options.
// The filter dropdowns sit in a collapsible panel (closed by default) behind
// a "Filters" button; search, the result count and Clear stay visible.
export default function ExerciseFilters({ value, onChange, exercises, shown, total, autoFocus = false }) {
  const equipmentOptions = useMemo(() => equipmentIn(exercises), [exercises]);
  const set = (patch) => onChange({ ...value, ...patch });
  // Add/remove one value from a multi-select filter.
  const toggle = (key, item) =>
    set({ [key]: value[key].includes(item) ? value[key].filter((x) => x !== item) : [...value[key], item] });
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const active = activeFilterCount(value);
  const anything = active > 0 || value.search.trim();

  return (
    <div className={styles.filters}>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.search}
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search exercises…"
          aria-label="Search exercises"
          autoFocus={autoFocus}
        />
        <button
          type="button"
          className={`${styles.toggle} ${open || active ? styles.toggleActive : ""}`}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={active > 0 ? `Filters, ${active} active` : "Filters"}
          onClick={() => setOpen((o) => !o)}
        >
          <FilterIcon />
          <span className={styles.toggleLabel}>Filters</span>
          {active > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {active}
            </span>
          )}
          <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className={styles.panel} id={panelId}>
          <div className={styles.dropdowns}>
            <MultiSelectDropdown
              label="Type"
              options={TYPE_OPTIONS.map((o) => o.label)}
              selected={value.type.map((t) => TYPE_OPTIONS.find((o) => o.value === t)?.label).filter(Boolean)}
              onToggle={(label) => toggle("type", TYPE_OPTIONS.find((o) => o.label === label).value)}
              placeholder="Any type"
            />
            <MultiSelectDropdown
              label="Location"
              options={EXERCISE_LOCATIONS}
              selected={value.location}
              onToggle={(l) => toggle("location", l)}
              placeholder="Anywhere"
            />
            <MultiSelectDropdown
              label="Equipment"
              options={equipmentOptions}
              selected={value.equipment}
              onToggle={(eq) => toggle("equipment", eq)}
              placeholder="Any equipment"
            />
            <MultiSelectDropdown
              label="Muscles"
              options={BODY_AREAS}
              selected={value.muscles}
              onToggle={(area) => toggle("muscles", area)}
              placeholder="Any muscle"
            />
          </div>
          <label className={styles.checkbox}>
            <input type="checkbox" checked={value.primaryOnly} onChange={(e) => set({ primaryOnly: e.target.checked })} />
            Only where it&apos;s the primary muscle
          </label>
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.count}>
          {anything ? `${shown} of ${total} exercises` : `${total} exercises`}
        </span>
        {anything && (
          <button type="button" className={styles.clear} onClick={() => onChange(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
