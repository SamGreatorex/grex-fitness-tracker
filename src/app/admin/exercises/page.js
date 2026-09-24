"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import AppHeader from "../../../components/AppHeader";
import { slugify } from "../../../lib/slugify";
import styles from "./page.module.css";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

const BODY_AREAS = [
  "Shoulders",
  "Chest",
  "Back",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Full Body",
];

const TAG_TIERS = [
  { key: "primaryTags", label: "Primary", hint: "The main muscle(s) this exercise targets." },
  { key: "secondaryTags", label: "Secondary", hint: "Muscles that assist the primary movers." },
  { key: "stabilizerTags", label: "Stabilizer", hint: "Muscles that stabilize the movement without driving it." },
];

export default function AdminExercisesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const dialogRef = useRef(null);

  const [exercises, setExercises] = useState(null);
  const [name, setName] = useState("");
  const [primaryTags, setPrimaryTags] = useState([]);
  const [secondaryTags, setSecondaryTags] = useState([]);
  const [stabilizerTags, setStabilizerTags] = useState([]);
  const [defaultWeight, setDefaultWeight] = useState("");
  const [defaultReps, setDefaultReps] = useState("");
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [usageByExerciseId, setUsageByExerciseId] = useState({});
  const [expandedUsageId, setExpandedUsageId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ exercises }, { programs }] = await Promise.all([
        api.get("/api/exercises"),
        api.get("/api/programs"),
      ]);
      setExercises(exercises);

      const usage = {};
      for (const program of programs) {
        for (const day of program.days) {
          for (const exercise of day.exercises) {
            const slug = slugify(exercise.name);
            (usage[slug] ??= []).push({ programName: program.name, dayLabel: day.label });
          }
        }
      }
      setUsageByExerciseId(usage);
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

  const filteredExercises = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !exercises) return exercises;
    return exercises.filter((exercise) => {
      const tags = [
        ...(exercise.primaryTags || []),
        ...(exercise.secondaryTags || []),
        ...(exercise.stabilizerTags || []),
      ];
      return (
        exercise.name.toLowerCase().includes(term) ||
        tags.some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [exercises, search]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPrimaryTags([]);
    setSecondaryTags([]);
    setStabilizerTags([]);
    setDefaultWeight("");
    setDefaultReps("");
    setFile(null);
    setError("");
  };

  const TAG_SETTERS = {
    primaryTags: setPrimaryTags,
    secondaryTags: setSecondaryTags,
    stabilizerTags: setStabilizerTags,
  };

  // A body area can only belong to one tier at a time — selecting it here
  // silently removes it from the other two.
  const toggleTag = (tierKey, tag) => {
    TAG_SETTERS[tierKey]((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    for (const [otherKey, setOther] of Object.entries(TAG_SETTERS)) {
      if (otherKey !== tierKey) setOther((prev) => prev.filter((t) => t !== tag));
    }
  };

  // The dialog's own close event covers every way it can close — the X
  // button, backdrop click, and the browser's native Esc handling.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => resetForm();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  // Live preview of a newly-picked file, before it's uploaded.
  const filePreviewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const openCreateDialog = () => {
    resetForm();
    dialogRef.current?.showModal();
  };

  const openEditDialog = (exercise) => {
    setEditingId(exercise.exerciseId);
    setName(exercise.name);
    setPrimaryTags(exercise.primaryTags || []);
    setSecondaryTags(exercise.secondaryTags || []);
    setStabilizerTags(exercise.stabilizerTags || []);
    setDefaultWeight(exercise.defaultWeight != null ? String(exercise.defaultWeight) : "");
    setDefaultReps(exercise.defaultReps != null ? String(exercise.defaultReps) : "");
    setFile(null);
    setError("");
    dialogRef.current?.showModal();
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) dialogRef.current.close();
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

      await api.post("/api/exercises", {
        name: name.trim(),
        primaryTags,
        secondaryTags,
        stabilizerTags,
        mediaType,
        mediaKey,
        defaultWeight,
        defaultReps,
      });
      await load();
      dialogRef.current?.close();
    } catch (err) {
      setError(err.message || "Could not save exercise.");
    } finally {
      setSaving(false);
    }
  };

  const toggleUsage = (exerciseId) => {
    setExpandedUsageId((prev) => (prev === exerciseId ? null : exerciseId));
  };

  const handleDelete = async (exercise) => {
    if (!window.confirm(`Delete "${exercise.name}"? This also removes its uploaded media.`)) return;
    try {
      await api.delete(`/api/exercises/${exercise.exerciseId}`);
      if (editingId === exercise.exerciseId) dialogRef.current?.close();
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
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Exercise library</h1>
            <p className={styles.subtitle}>
              Name, body-area tags, and an example image or video. Program exercises with a
              matching name automatically pick these up.
            </p>
          </div>
          <button type="button" className={styles.newButton} onClick={openCreateDialog}>
            + New exercise
          </button>
        </div>

        {exercises && exercises.length > 0 && (
          <input
            type="search"
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or tag…"
            aria-label="Search exercises by name or tag"
          />
        )}

        <h2 className={styles.listTitle}>
          {search.trim() && exercises
            ? `${filteredExercises.length} of ${exercises.length} exercises`
            : `All exercises ${exercises ? `(${exercises.length})` : ""}`}
        </h2>

        {!exercises ? (
          <p className={styles.empty}>Loading…</p>
        ) : exercises.length === 0 ? (
          <p className={styles.empty}>No exercises yet.</p>
        ) : filteredExercises.length === 0 ? (
          <p className={styles.empty}>No exercises match &ldquo;{search.trim()}&rdquo;.</p>
        ) : (
          <div className={styles.list}>
            {filteredExercises.map((exercise) => {
              const usage = usageByExerciseId[exercise.exerciseId] || [];
              const usageExpanded = expandedUsageId === exercise.exerciseId;
              return (
                <div key={exercise.exerciseId} className={styles.row}>
                  <div className={styles.rowHeader}>
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
                      {(exercise.defaultWeight != null || exercise.defaultReps != null) && (
                        <p className={styles.rowMeta}>
                          Default: {exercise.defaultWeight ?? "—"}kg × {exercise.defaultReps ?? "—"} reps
                        </p>
                      )}
                    </div>
                  </div>

                  <div className={styles.rowTags}>
                    {exercise.primaryTags?.map((tag) => (
                      <span key={`p-${tag}`} className={`${styles.rowTag} ${styles.rowTagPrimary}`}>{tag}</span>
                    ))}
                    {exercise.secondaryTags?.map((tag) => (
                      <span key={`s-${tag}`} className={`${styles.rowTag} ${styles.rowTagSecondary}`}>{tag}</span>
                    ))}
                    {exercise.stabilizerTags?.map((tag) => (
                      <span key={`st-${tag}`} className={`${styles.rowTag} ${styles.rowTagStabilizer}`}>{tag}</span>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.usageToggle}
                    onClick={() => toggleUsage(exercise.exerciseId)}
                    aria-expanded={usageExpanded}
                  >
                    {usage.length > 0
                      ? `Used in ${usage.length} programme day${usage.length === 1 ? "" : "s"}`
                      : "Not used in any programme"}
                    {usage.length > 0 && <span className={styles.usageChevron}>{usageExpanded ? "▲" : "▼"}</span>}
                  </button>

                  {usageExpanded && usage.length > 0 && (
                    <ul className={styles.usageList}>
                      {usage.map((u, i) => (
                        <li key={i} className={styles.usageItem}>{u.programName} · {u.dayLabel}</li>
                      ))}
                    </ul>
                  )}

                  <div className={styles.rowActions}>
                    <button type="button" className={styles.rowButton} onClick={() => openEditDialog(exercise)}>
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
              );
            })}
          </div>
        )}
      </main>

      <dialog ref={dialogRef} className={styles.dialog} onClick={handleBackdropClick}>
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2 className={styles.dialogTitle}>{editingExercise ? "Edit exercise" : "New exercise"}</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
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

            {TAG_TIERS.map(({ key, label, hint }) => {
              const selected = { primaryTags, secondaryTags, stabilizerTags }[key];
              return (
                <div key={key} className={styles.field}>
                  <span className={styles.label}>{label} body areas</span>
                  <span className={styles.hint}>{hint}</span>
                  <div className={styles.tagPicker}>
                    {BODY_AREAS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`${styles.tagOption} ${selected.includes(tag) ? styles.tagOptionSelected : ""}`}
                        onClick={() => toggleTag(key, tag)}
                        aria-pressed={selected.includes(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="defaultWeight">Default weight (kg)</label>
                <input
                  id="defaultWeight"
                  className={styles.input}
                  type="number"
                  min="0"
                  step="0.5"
                  value={defaultWeight}
                  onChange={(e) => setDefaultWeight(e.target.value)}
                  placeholder="First-time only"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="defaultReps">Default reps</label>
                <input
                  id="defaultReps"
                  className={styles.input}
                  type="number"
                  min="0"
                  value={defaultReps}
                  onChange={(e) => setDefaultReps(e.target.value)}
                  placeholder="First-time only"
                />
              </div>
            </div>
            <span className={styles.hint}>
              Used to prefill weight/reps the first time this exercise is logged in any
              programme — once it&apos;s actually been logged, that value is used instead.
            </span>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="media">Image or video</label>
              <input
                id="media"
                className={styles.fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={handleFileChange}
              />
              {(filePreviewUrl || editingExercise?.mediaUrl) && (
                <div className={styles.mediaPreview}>
                  {(file ? file.type.startsWith("video/") : editingExercise?.mediaType === "video") ? (
                    <video
                      className={styles.mediaPreviewMedia}
                      src={filePreviewUrl || editingExercise.mediaUrl}
                      controls
                      muted
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className={styles.mediaPreviewMedia}
                      src={filePreviewUrl || editingExercise.mediaUrl}
                      alt=""
                    />
                  )}
                  <span className={styles.mediaPreviewCaption}>
                    {file ? "New file — not saved yet" : "Current media"}
                  </span>
                </div>
              )}
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.submitButton} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create exercise"}
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
