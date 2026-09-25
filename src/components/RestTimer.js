"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RestTimer.module.css";
import { effortColor } from "../lib/effort";
import { playAlarm } from "../lib/alarm";

const EFFORT_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);
// Long enough for the full alarm (6 quick beeps, ~0.96s) to finish before
// the dialog closes itself.
const AUTO_CLOSE_DELAY_MS = 1300;

// Rest countdown, shown between sets. Uses an absolute end timestamp rather
// than decrementing a counter each tick, so it stays accurate even if the
// tab is backgrounded/throttled. Also doubles as the effort-rating prompt
// for the set that was just logged, since rest is the natural pause to ask
// "how did that feel?". Sounds an alarm and closes itself shortly after
// the countdown hits zero.
export default function RestTimer({ seconds, effort, onSelectEffort, onDone, onClose, showTimer = true }) {
  const [endAt, setEndAt] = useState(() => Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);
  const audioCtxRef = useRef(null);

  // Created on mount (a direct result of the "Log" button click that opened
  // this overlay) so the browser treats it as tied to a user gesture and
  // doesn't block autoplay when the alarm fires later.
  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
    return () => audioCtxRef.current?.close();
  }, []);

  // After the very last set of the day there's nothing left to rest for —
  // skip the countdown/alarm/auto-close entirely and just leave the effort
  // prompt open until the user picks a rating and closes it themselves.
  useEffect(() => {
    if (!showTimer) return;
    const tick = () => {
      const msLeft = endAt - Date.now();
      const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setRemaining(secsLeft);
      if (secsLeft === 0 && !firedRef.current) {
        firedRef.current = true;
        playAlarm(audioCtxRef.current);
        onDone?.();
        setTimeout(() => onClose?.(), AUTO_CLOSE_DELAY_MS);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [showTimer, endAt, onDone, onClose]);

  const addSeconds = (delta) => {
    firedRef.current = false;
    setEndAt((prev) => Math.max(Date.now(), prev) + delta * 1000);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const done = remaining === 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        {showTimer ? (
          <>
            <p className={styles.label}>Rest</p>
            <p className={`${styles.time} ${done ? styles.timeDone : ""}`}>
              {mm}:{ss}
            </p>
            <div className={styles.controls}>
              <button type="button" className={styles.button} onClick={() => addSeconds(15)}>
                +15s
              </button>
              <button type="button" className={styles.button} onClick={() => addSeconds(-15)}>
                -15s
              </button>
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
                {done ? "Continue" : "Skip"}
              </button>
            </div>
          </>
        ) : (
          <p className={styles.label}>Set complete</p>
        )}

        <div className={styles.effortSection}>
          <p className={styles.effortLabel}>Effort</p>
          <div className={styles.effortGrid}>
            {EFFORT_LEVELS.map((level) => {
              const selected = effort === level;
              return (
                <button
                  key={level}
                  type="button"
                  className={`${styles.effortButton} ${selected ? styles.effortButtonSelected : ""}`}
                  style={{ "--effort-color": effortColor(level) }}
                  onClick={() => onSelectEffort?.(level)}
                  aria-pressed={selected}
                  aria-label={`Effort ${level} out of 10`}
                >
                  {level}
                </button>
              );
            })}
          </div>
          <div className={styles.effortHint}>
            <span>Easy</span>
            <span>Hard</span>
          </div>
        </div>

        {!showTimer && (
          <div className={styles.controls}>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
