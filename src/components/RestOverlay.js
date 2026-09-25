"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./RestOverlay.module.css";
import { playAlarm } from "../lib/alarm";

const AUTO_DISMISS_DELAY_MS = 1300;

// A floating, non-blocking countdown shown after logging a set — unlike a
// modal dialog, the rest of the app (browsing other exercises, programmes)
// stays fully usable while it counts down, since rest is dead time you'd
// otherwise just be sitting through a blocking dialog for. Uses an
// absolute end timestamp rather than decrementing a counter each tick, so
// it stays accurate even if the tab is backgrounded/throttled.
export default function RestOverlay({ seconds, onClose }) {
  const [endAt, setEndAt] = useState(() => Date.now() + seconds * 1000);
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);
  const audioCtxRef = useRef(null);

  // Created on mount (a direct result of the "Log" button click that
  // triggered this overlay) so the browser treats it as tied to a user
  // gesture and doesn't block autoplay when the alarm fires later.
  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtxRef.current = new AudioContextClass();
    return () => audioCtxRef.current?.close();
  }, []);

  useEffect(() => {
    const tick = () => {
      const msLeft = endAt - Date.now();
      const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setRemaining(secsLeft);
      if (secsLeft === 0 && !firedRef.current) {
        firedRef.current = true;
        playAlarm(audioCtxRef.current);
        setTimeout(() => onClose?.(), AUTO_DISMISS_DELAY_MS);
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endAt, onClose]);

  const addSeconds = (delta) => {
    firedRef.current = false;
    setEndAt((prev) => Math.max(Date.now(), prev) + delta * 1000);
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const done = remaining === 0;

  return (
    <div className={`${styles.overlay} ${done ? styles.overlayDone : ""}`}>
      <span className={styles.label}>{done ? "Rest done" : "Rest"}</span>
      <span className={styles.time}>{mm}:{ss}</span>
      {!done && (
        <div className={styles.controls}>
          <button type="button" className={styles.button} onClick={() => addSeconds(-15)}>
            -15s
          </button>
          <button type="button" className={styles.button} onClick={() => addSeconds(15)}>
            +15s
          </button>
        </div>
      )}
      <button type="button" className={styles.close} aria-label="Dismiss rest timer" onClick={() => onClose?.()}>
        ×
      </button>
    </div>
  );
}
