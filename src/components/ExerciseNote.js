"use client";

import { useState } from "react";
import { EXERCISE_NOTE_MAX_LENGTH } from "../lib/exerciseNotes";
import styles from "./ExerciseNote.module.css";

// The personal note on an exercise for this programme day (e.g. "seat on
// notch 4"). Shows the note if there is one, with Edit; otherwise a small
// "Add a note" link. `onSave(text)` persists it (empty text clears it) and
// should throw on failure. Without `onSave` it's read-only.
export default function ExerciseNote({ note, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startEditing = () => {
    setDraft(note?.text ?? "");
    setError("");
    setEditing(true);
  };

  const save = async (text) => {
    setSaving(true);
    setError("");
    try {
      await onSave(text.trim());
      setEditing(false);
    } catch (err) {
      setError(err.message || "Could not save your note.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className={styles.editor}>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={EXERCISE_NOTE_MAX_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Seat on notch 4, use the blue handle"
          aria-label="Note for this exercise"
          autoFocus
          disabled={saving}
        />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          {note && (
            <button type="button" className={styles.remove} disabled={saving} onClick={() => save("")}>
              Delete note
            </button>
          )}
          <button type="button" className={styles.cancel} disabled={saving} onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="button" className={styles.save} disabled={saving} onClick={() => save(draft)}>
            {saving ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    );
  }

  if (!note) {
    return onSave ? (
      <button type="button" className={styles.add} onClick={startEditing}>
        + Add a note
      </button>
    ) : null;
  }

  return (
    <div className={styles.note}>
      <span className={styles.icon} aria-hidden="true">
        ✎
      </span>
      <p className={styles.text}>{note.text}</p>
      {onSave && (
        <button type="button" className={styles.edit} onClick={startEditing} aria-label="Edit note">
          Edit
        </button>
      )}
    </div>
  );
}
