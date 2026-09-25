"use client";

import { useEffect } from "react";

// Keeps the screen from auto-locking for as long as the calling component
// stays mounted — resting between sets is exactly when there's no
// touch/scroll activity for the phone's own screen-lock timeout to key
// off, so without this the screen (and the visible countdown) can go dark
// mid-rest. Silently does nothing where unsupported (e.g. older Safari).
// Wake locks are released automatically once the tab is backgrounded, so
// this re-acquires on visibility change rather than assuming one request
// lasts until the component unmounts.
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        lock = next;
      } catch {
        // Not fatal — e.g. Low Power Mode can refuse this on iOS.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lock?.release().catch(() => {});
    };
  }, []);
}
