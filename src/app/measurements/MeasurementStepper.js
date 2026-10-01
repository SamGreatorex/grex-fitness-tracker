"use client";

import { useEffect, useRef } from "react";
import BodyDiagram from "../../components/BodyDiagram";
import { MEASUREMENTS } from "../../lib/measurements";
import { WEIGHT_UNITS } from "../../lib/units";
import styles from "./MeasurementStepper.module.css";

const WEIGHT_STEP = {
  key: "weight",
  label: "Weight",
  hint: "For consistent readings, weigh yourself at the same time of day — ideally first thing in the morning.",
};

// Weight first, then the measurements the user tracks (default: all).
export function stepsFor(measurements = MEASUREMENTS) {
  return [WEIGHT_STEP, ...measurements];
}

// Keeps focus (and so the phone keyboard) in the input when tapping
// a step button, instead of the button stealing it.
const keepFocus = (e) => e.preventDefault();

// Phone layout: one measurement at a time in a compact card that fits
// above the on-screen keyboard — small diagram, what/where to measure, one
// big input, last reading, and prev/next. The keyboard's Next/Enter key
// advances. The same input element is reused for every tape measurement,
// so the keyboard stays open while stepping through.
export default function MeasurementStepper({
  steps: STEPS,
  stepIndex: requestedStepIndex,
  onStepChange,
  form,
  setForm,
  setLength,
  weightUnit,
  lengthUnit,
  lastText,
  saving,
  saveLabel,
  canSave,
  // Focus the input straight away (e.g. when opened in a dialog), so the
  // keyboard comes up without another tap.
  autoFocus = false,
}) {
  // Clamped in case the tracked list just shrank under the current step.
  const stepIndex = Math.min(requestedStepIndex, STEPS.length - 1);
  const step = STEPS[stepIndex];
  const isWeight = step.key === "weight";
  const isLast = stepIndex === STEPS.length - 1;
  const stones = weightUnit === WEIGHT_UNITS.ST_LB;

  const inputRef = useRef(null);
  const chipRefs = useRef({});
  const focusAfterStep = useRef(autoFocus);

  const isFilled = (key) =>
    key === "weight"
      ? (stones ? form.weightSt !== "" || form.weightLb !== "" : form.weightKg !== "")
      : form.lengths[key] != null && form.lengths[key] !== "";

  const goTo = (index) => {
    focusAfterStep.current = true;
    onStepChange(Math.max(0, Math.min(STEPS.length - 1, index)));
  };

  useEffect(() => {
    chipRefs.current[step.key]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    if (focusAfterStep.current) {
      focusAfterStep.current = false;
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [step.key]);

  // Keyboard "Next"/Enter moves on; on the last step it saves (submits).
  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || isLast) return;
    e.preventDefault();
    goTo(stepIndex + 1);
  };

  const inputProps = {
    className: styles.input,
    type: "number",
    inputMode: "decimal",
    min: "0",
    step: "0.1",
    enterKeyHint: isLast ? "done" : "next",
    onKeyDown: handleKeyDown,
  };

  const side = step.key.startsWith("right") ? "right" : step.key.startsWith("left") ? "left" : null;

  return (
    <div className={styles.stepper}>
      <div className={styles.chips} role="tablist" aria-label="Measurements">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            ref={(el) => (chipRefs.current[s.key] = el)}
            type="button"
            role="tab"
            aria-selected={i === stepIndex}
            className={`${styles.chip} ${i === stepIndex ? styles.chipActive : ""} ${isFilled(s.key) ? styles.chipFilled : ""}`}
            onPointerDown={keepFocus}
            onClick={() => goTo(i)}
          >
            {isFilled(s.key) && <span aria-hidden="true">✓ </span>}
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.diagram}>
          <BodyDiagram
            compact
            active={isWeight ? null : step.key}
            filled={form.lengths}
            keys={STEPS.filter((s) => s.key !== "weight").map((s) => s.key)}
            onSelect={(key) => goTo(STEPS.findIndex((s) => s.key === key))}
          />
        </div>

        <div className={styles.detail}>
          <p className={styles.stepCount}>
            {stepIndex + 1} of {STEPS.length}
          </p>
          <label htmlFor="stepper-input" className={styles.stepLabel}>
            {step.label}
          </label>
          <p className={styles.hint}>
            {step.hint}
            {side && <span className={styles.sideNote}> Your {side} side — the figure faces you.</span>}
          </p>

          {isWeight && stones ? (
            <div className={styles.pair}>
              <span className={styles.inputWrap}>
                <input
                  {...inputProps}
                  id="stepper-input"
                  ref={inputRef}
                  step="1"
                  value={form.weightSt}
                  onChange={(e) => setForm((f) => ({ ...f, weightSt: e.target.value }))}
                  aria-label="Weight, stones"
                />
                <span className={styles.suffix}>st</span>
              </span>
              <span className={styles.inputWrap}>
                <input
                  {...inputProps}
                  value={form.weightLb}
                  onChange={(e) => setForm((f) => ({ ...f, weightLb: e.target.value }))}
                  aria-label="Weight, pounds"
                />
                <span className={styles.suffix}>lb</span>
              </span>
            </div>
          ) : (
            <span className={styles.inputWrap}>
              <input
                {...inputProps}
                id="stepper-input"
                ref={inputRef}
                value={isWeight ? form.weightKg : form.lengths[step.key] ?? ""}
                onChange={(e) =>
                  isWeight ? setForm((f) => ({ ...f, weightKg: e.target.value })) : setLength(step.key, e.target.value)
                }
              />
              <span className={styles.suffix}>{isWeight ? "kg" : lengthUnit}</span>
            </span>
          )}

          <p className={styles.last}>{lastText(step.key) ? `Last time: ${lastText(step.key)}` : " "}</p>
        </div>
      </div>

      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          onPointerDown={keepFocus}
          onClick={() => goTo(stepIndex - 1)}
          disabled={stepIndex === 0}
          aria-label="Previous measurement"
        >
          ‹
        </button>
        {isLast ? (
          <button type="submit" className={styles.primary} disabled={saving || !canSave}>
            {saving ? "Saving…" : saveLabel}
          </button>
        ) : (
          <>
            <button type="submit" className={styles.secondary} disabled={saving || !canSave}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className={styles.primary} onPointerDown={keepFocus} onClick={() => goTo(stepIndex + 1)}>
              Next: {STEPS[stepIndex + 1].label}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
