"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import AppHeader from "../../../components/AppHeader";
import styles from "./page.module.css";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

export default function AdminExercisesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();

  const [exercises, setExercises] = useState(null);
  const [name, setName] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const { exercises } = await api.get("/api/exercises");
      setExercises(exercises);
    } catch (err) {
      setError(err.message || "Could not load exercises.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
    })();
  }, [user, load]);

  const editingExercise = editingId ? exercises?.find((e) => e.exerciseId === editingId) : null;

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setTagsInput("");
    setFile(null);
  };

  const startEdit = (exercise) => {
    setEditingId(exercise.exerciseId);
    setName(exercise.name);
    setTagsInput((exercise.tags || []).join(", "));
    setFile(null);
    setError("");
  };

  const handleFileChange = (e) => {
    const picked = e.target.files?.[0] || null;
    if (picked && picked.size > MAX_FILE_BYTES) {
      setError("File is too large (max 100MB).");
      e.target.value = "";
      setFile(null);
      return;
    }
    setError("");
    setFile(picked);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let mediaType;
      let mediaKey;

      if (file) {
        const { uploadUrl, key, mediaType: resolvedType } = await api.post("/api/exercises/upload-url", {
          name: name.trim(),
          contentType: file.type,
        });
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) throw new Error("Upload to S3 failed.");
        mediaType = resolvedType;
        mediaKey = key;
      }

      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await api.post("/api/exercises", { name: name.trim(), tags, mediaType, mediaKey });
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Could not save exercise.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exercise) => {
    if (!window.confirm(`Delete "${exercise.name}"? This also removes its uploaded media.`)) return;
    try {
      await api.delete(`/api/exercises/${exercise.exerciseId}`);
      if (editingId === exercise.exerciseId) resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Could not delete exercise.");
    }
  };

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Exercise library</h1>
        <p className={styles.subtitle}>
          Create exercises with a name, body-area tags, and an example image or video. Program
          exercises with a matching name automatically pick these up.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          {editingExercise && (
            <div className={styles.editingBanner}>
              <span>Editing &ldquo;{editingExercise.name}&rdquo;</span>
              <button type="button" className={styles.cancelEdit} onClick={resetForm}>
                Cancel
              </button>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">Name</label>
            <input
              id="name"
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!editingId}
              placeholder="e.g. Dumbbell Shoulder Press"
              required
            />
            {editingId && <span className={styles.hint}>Name can&apos;t be changed once created — delete and recreate instead.</span>}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="tags">Body areas</label>
            <input
              id="tags"
              className={styles.input}
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Shoulders, Chest"
            />
            <span className={styles.hint}>Comma-separated.</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="media">Image or video</label>
            <input
              id="media"
              className={styles.fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
            />
            {editingExercise?.mediaUrl && !file && (
              <div className={styles.currentMedia}>
                {editingExercise.mediaType === "video" ? (
                  <video className={styles.currentMediaThumb} src={editingExercise.mediaUrl} muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.currentMediaThumb} src={editingExercise.mediaUrl} alt="" />
                )}
                <span>Current media — pick a new file to replace it.</span>
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submitButton} disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save changes" : "Create exercise"}
          </button>
        </form>

        <h2 className={styles.listTitle}>All exercises {exercises ? `(${exercises.length})` : ""}</h2>

        {!exercises ? (
          <p className={styles.empty}>Loading…</p>
        ) : exercises.length === 0 ? (
          <p className={styles.empty}>No exercises yet.</p>
        ) : (
          <div className={styles.list}>
            {exercises.map((exercise) => (
              <div key={exercise.exerciseId} className={styles.row}>
                {exercise.mediaType === "video" && exercise.mediaUrl ? (
                  <video className={styles.rowThumb} src={exercise.mediaUrl} muted />
                ) : exercise.mediaUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.rowThumb} src={exercise.mediaUrl} alt="" />
                ) : (
                  <div className={styles.rowThumbPlaceholder} />
                )}
                <div className={styles.rowInfo}>
                  <p className={styles.rowName}>{exercise.name}</p>
                  {exercise.tags?.length > 0 && (
                    <div className={styles.rowTags}>
                      {exercise.tags.map((tag) => (
                        <span key={tag} className={styles.rowTag}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className={styles.rowActions}>
                  <button type="button" className={styles.rowButton} onClick={() => startEdit(exercise)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${styles.rowButton} ${styles.rowButtonDanger}`}
                    onClick={() => handleDelete(exercise)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
