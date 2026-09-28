"use client";

import { TEXT_LIMITS } from "../lib/exerciseText";
import styles from "./InstructionsEditor.module.css";

let keyCounter = 0;
export const newStep = (text = "") => ({ key: `step${++keyCounter}`, text });

function move(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Numbered, editable list of instruction steps. `steps` is
// [{ key, text }] (bare text — numbering is shown here and applied on save).
export default function InstructionsEditor({ steps, onChange }) {
  const update = (key, text) => onChange(steps.map((s) => (s.key === key ? { ...s, text } : s)));
  const remove = (key) => onChange(steps.filter((s) => s.key !== key));
  const canAdd = steps.length < TEXT_LIMITS.steps;

  return (
    <div className={styles.editor}>
      {steps.length === 0 ? (
        <p className={styles.empty}>No steps yet.</p>
      ) : (
        <ol className={styles.steps}>
          {steps.map((step, i) => (
            <li key={step.key} className={styles.step}>
              <span className={styles.number} aria-hidden="true">
                {i + 1}
              </span>
              <textarea
                className={styles.text}
                rows={2}
                maxLength={TEXT_LIMITS.stepLength}
                value={step.text}
                onChange={(e) => update(step.key, e.target.value)}
                placeholder={i === 0 ? "e.g. Stand with feet hip-width apart." : "Next step…"}
                aria-label={`Step ${i + 1}`}
              />
              <div className={styles.actions}>
                <button type="button" className={styles.iconButton} aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => onChange(move(steps, i, -1))}>
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move step ${i + 1} down`}
                  disabled={i === steps.length - 1}
                  onClick={() => onChange(move(steps, i, 1))}
                >
                  ↓
                </button>
                <button type="button" className={styles.iconButton} aria-label={`Remove step ${i + 1}`} onClick={() => remove(step.key)}>
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className={styles.addButton} disabled={!canAdd} onClick={() => onChange([...steps, newStep()])}>
        {canAdd ? "+ Add step" : `Maximum ${TEXT_LIMITS.steps} steps`}
      </button>
    </div>
  );
}
