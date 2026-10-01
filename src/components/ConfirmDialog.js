"use client";

import { useEffect, useRef } from "react";
import styles from "./ConfirmDialog.module.css";

// An "are you sure?" modal in the app's theme, in place of the browser's
// unstyled window.confirm. Mount it to ask; it calls `onConfirm` or
// `onCancel` (Cancel, ×, Escape or a backdrop click). `busy` disables both
// buttons while the confirmed action runs; `error` shows if it failed.
// `danger` makes the confirm button red, for destructive actions.
export default function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  busyLabel = "Working…",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    // Start on Cancel, so a stray Enter doesn't confirm something destructive.
    cancelRef.current?.focus();
  }, []);

  const handleCancel = (e) => {
    // The native Escape close: stay open while busy, otherwise just report it.
    e.preventDefault();
    if (!busy) onCancel();
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current && !busy) onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="confirm-dialog-title"
    >
      <div className={styles.inner}>
        <div className={styles.header}>
          <h2 id="confirm-dialog-title" className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Close" disabled={busy} onClick={onCancel}>
            ×
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancelButton} disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.confirmButton} ${danger ? styles.danger : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
