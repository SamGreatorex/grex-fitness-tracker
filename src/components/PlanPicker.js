"use client";

import { PLANS, PLAN_KEYS, TRIAL_DAYS, formatPrice } from "../lib/billing";
import styles from "./PlanPicker.module.css";

const ORDER = [PLAN_KEYS.TRIAL, PLAN_KEYS.BASIC, PLAN_KEYS.PRO];

// The three ways to use the app, as selectable cards. `trialAvailable`
// false greys out the free trial (it can only be taken once); `current`
// marks the plan they're on; `compact` trims the feature lists (sign-up).
export default function PlanPicker({ selected, onSelect, trialAvailable = true, current, compact = false, name = "plan" }) {
  return (
    <div className={`${styles.plans} ${compact ? styles.compact : ""}`} role="radiogroup" aria-label="Choose a plan">
      {ORDER.map((key) => {
        const plan = PLANS[key];
        const disabled = key === PLAN_KEYS.TRIAL && !trialAvailable;
        const isSelected = selected === key;
        return (
          <label
            key={key}
            className={`${styles.plan} ${isSelected ? styles.selected : ""} ${disabled ? styles.disabled : ""}`}
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onSelect(key)}
              className={styles.radio}
            />
            <span className={styles.head}>
              <span className={styles.name}>
                {plan.name}
                {key === PLAN_KEYS.PRO && <span className={styles.badge}>Personal trainer</span>}
                {current === key && <span className={styles.currentBadge}>Current</span>}
              </span>
              <span className={styles.price}>
                {plan.pricePence === 0 ? (
                  <>Free <span className={styles.per}>for {TRIAL_DAYS} days</span></>
                ) : (
                  <>
                    {formatPrice(plan.pricePence)} <span className={styles.per}>/ month</span>
                  </>
                )}
              </span>
            </span>
            {disabled ? (
              <span className={styles.note}>You&apos;ve already used your free trial.</span>
            ) : (
              <ul className={styles.features}>
                {(compact ? plan.features.slice(0, 2) : plan.features).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </label>
        );
      })}
    </div>
  );
}
