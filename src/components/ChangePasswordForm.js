"use client";

import { useState } from "react";
import { updatePassword } from "aws-amplify/auth";
import { meetsPasswordRules, passwordErrorMessage } from "../lib/password";
import PasswordRequirements from "./PasswordRequirements";
import styles from "./ProfileForm.module.css";

// Change password for the signed-in user (needs their current password).
export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const mismatch = confirm !== "" && next !== confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (!meetsPasswordRules(next)) return setError("Your new password doesn't meet the requirements.");
    if (next !== confirm) return setError("New passwords don't match.");
    if (next === current) return setError("Your new password must be different from your current one.");

    setSaving(true);
    try {
      await updatePassword({ oldPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
    } catch (err) {
      setError(passwordErrorMessage(err, "Could not change your password."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Current password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>New password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <PasswordRequirements password={next} />
      <label className={styles.field}>
        <span className={styles.label}>Confirm new password</span>
        <input
          className={styles.input}
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />
        {mismatch && <span className={styles.hint}>Passwords don&apos;t match yet.</span>}
      </label>

      {error && <div className={styles.error}>{error}</div>}
      {saved && !error && <div className={styles.success}>Password changed.</div>}

      <button type="submit" disabled={saving} className={styles.button}>
        {saving ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
