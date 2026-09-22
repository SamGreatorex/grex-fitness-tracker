"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RestTimer.module.css";

// Rest countdown, shown between sets. Uses an absolute end timestamp rather
// than decrementing a counter each tick, so it stays accurate even if the
// tab is backgrounded/throttled.
export default function RestTimer({ seconds, onDone, onClose }) {
  const [endAt, setEndAt] = useState(() => Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const msLeft = endAt - Date.now();
      const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setRemaining(secsLeft);
      if (secsLeft === 0 && !firedRef.current) {
        firedRef.current = true;
        onDone?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAt, onDone]);

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
      </div>
    </div>
  );
}
