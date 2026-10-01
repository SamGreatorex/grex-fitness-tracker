"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import AppHeader from "../../../components/AppHeader";
import MultiSelectDropdown from "../../../components/MultiSelectDropdown";
import ExerciseFilters from "../../../components/ExerciseFilters";
import { EMPTY_FILTERS, filterExercises } from "../../../lib/exerciseFilters";
import InstructionsEditor, { newStep } from "../../../components/InstructionsEditor";
import ConfirmDialog from "../../../components/ConfirmDialog";
import ReplaceExerciseDialog from "./ReplaceExerciseDialog";
import UsageItem from "./UsageItem";
import { TEXT_LIMITS, stripStepNumber } from "../../../lib/exerciseText";
import { slugify } from "../../../lib/slugify";
import {
  BODY_AREAS,
  EQUIPMENT_MAX_LENGTH,
  EQUIPMENT_SUGGESTIONS,
  EXERCISE_LOCATIONS,
  EXERCISE_TYPES,
  isCardio,
} from "../../../lib/exerciseTypes";
import styles from "./page.module.css";

const MAX_FILE_BYTES = 100 * 1024 * 1024;

const TAG_TIERS = [
  { key: "primaryTags", label: "Primary", tone: "primary", hint: "The main muscle(s) this exercise targets." },
  { key: "secondaryTags", label: "Secondary", tone: "secondary", hint: "Muscles that assist the primary movers." },
  { key: "stabilizerTags", label: "Stabilizer", tone: "stabilizer", hint: "Muscles that stabilize the movement without driving it." },
];

export default function AdminExercisesPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const dialogRef = useRef(null);

  const [exercises, setExercises] = useState(null);
  const [name, setName] = useState("");
  const [type, setType] = useState(EXERCISE_TYPES.STRENGTH);
  const [equipment, setEquipment] = useState("");
  const [location, setLocation] = useState([]);
  const [description, setDescription] = useState("");
  // [{ key, text }] — bare step text; the API numbers them on save.
  const [steps, setSteps] = useState([]);
  const [primaryTags, setPrimaryTags] = useState([]);
  const [secondaryTags, setSecondaryTags] = useState([]);
  const [stabilizerTags, setStabilizerTags] = useState([]);
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [usageByExerciseId, setUsageByExerciseId] = useState({});
  const [expandedUsageId, setExpandedUsageId] = useState(null);
  // { exercise, usage } while picking what to switch a used exercise to.
  const [replacing, setReplacing] = useState(null);
  // The (unused) exercise awaiting "are you sure?" before it's deleted.
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // userId → display name, for showing whose programme each use is in.
  const [userNames, setUserNames] = useState({});
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [{ exercises }, { programs }, { users }] = await Promise.all([
        api.get("/api/exercises"),
        api.get("/api/programs", { scope: "all" }),
        // Only for showing whose programme each use is in — never block the page on it.
        api.get("/api/admin/users").catch(() => ({ users: [] })),
      ]);
      setExercises(exercises);
      const names = {};
      for (const u of users) names[u.userId] = u.name || u.email;
      setUserNames(names);

      const usage = {};
      for (const program of programs) {
        for (const day of program.days) {
          for (const exercise of day.exercises) {
            const slug = slugify(exercise.name);
            (usage[slug] ??= []).push({
              programId: program.programId,
              programName: program.name,
              isTemplate: !!program.isTemplate,
              ownerUserId: program.ownerUserId ?? null,
              dayLabel: day.label,
            });
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

  // Suggestions: the standard list plus anything already used in the library.
  const equipmentOptions = useMemo(
    () => [...new Set([...EQUIPMENT_SUGGESTIONS, ...(exercises ?? []).map((e) => e.equipment).filter(Boolean)])].sort(),
    [exercises]
  );

  const filteredExercises = useMemo(
    () => (exercises ? filterExercises(exercises, filters) : exercises),
    [exercises, filters]
  );

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setType(EXERCISE_TYPES.STRENGTH);
    setEquipment("");
    setLocation([]);
    setDescription("");
    setSteps([]);
    setPrimaryTags([]);
    setSecondaryTags([]);
    setStabilizerTags([]);
    setFile(null);
    setError("");
  };

  const TAG_SETTERS = {
    primaryTags: setPrimaryTags,
    secondaryTags: setSecondaryTags,
    stabilizerTags: setStabilizerTags,
  };

  const tagsByTier = { primaryTags, secondaryTags, stabilizerTags };

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
    setType(isCardio(exercise) ? EXERCISE_TYPES.CARDIO : EXERCISE_TYPES.STRENGTH);
    setEquipment(exercise.equipment ?? "");
    setLocation(exercise.location ?? []);
    setDescription(exercise.description ?? "");
    setSteps((exercise.instructions ?? []).map((step) => newStep(stripStepNumber(step))));
    setPrimaryTags(exercise.primaryTags || []);
    setSecondaryTags(exercise.secondaryTags || []);
    setStabilizerTags(exercise.stabilizerTags || []);
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
        type,
        equipment,
        location,
        description,
        instructions: steps.map((s) => s.text),
        primaryTags,
        secondaryTags,
        stabilizerTags,
        mediaType,
        mediaKey,
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

  const afterDelete = async (exercise) => {
    if (editingId === exercise.exerciseId) dialogRef.current?.close();
    await load();
  };

  // An exercise programmes still use must be switched for another in all of
  // them first — that happens in ReplaceExerciseDialog. Otherwise, just
  // confirm (ConfirmDialog) and delete.
  const handleDelete = (exercise) => {
    const usage = usageByExerciseId[exercise.exerciseId] || [];
    if (usage.length > 0) {
      setReplacing({ exercise, usage });
      return;
    }
    setDeleteError("");
    setConfirmingDelete(exercise);
  };

  const confirmDelete = async () => {
    const exercise = confirmingDelete;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api.delete(`/api/exercises/${exercise.exerciseId}`);
      setConfirmingDelete(null);
      await afterDelete(exercise);
    } catch (err) {
      // Someone added it to a programme since this page loaded.
      if (err.status === 409 && err.data?.usage) {
        setConfirmingDelete(null);
        setReplacing({ exercise, usage: err.data.usage });
        return;
      }
      setDeleteError(err.message || "Could not delete exercise.");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/admin" backLabel="Admin" />
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
          <div className={styles.filterBar}>
            <ExerciseFilters
              value={filters}
              onChange={setFilters}
              exercises={exercises}
              shown={filteredExercises.length}
              total={exercises.length}
            />
          </div>
        )}

        {!exercises ? (
          <p className={styles.empty}>Loading…</p>
        ) : exercises.length === 0 ? (
          <p className={styles.empty}>No exercises yet.</p>
        ) : filteredExercises.length === 0 ? (
          <p className={styles.empty}>No exercises match these filters.</p>
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
                      <p className={styles.rowName}>
                        {exercise.name}
                        {isCardio(exercise) && <span className={styles.cardioBadge}>Cardio</span>}
                      </p>
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
                        <UsageItem key={i} usage={u} userNames={userNames} />
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

            <div className={styles.field}>
              <span className={styles.label} id="type-label">Type</span>
              <div className={styles.typeToggle} role="radiogroup" aria-labelledby="type-label">
                {[
                  [EXERCISE_TYPES.STRENGTH, "Strength", "Sets × reps × weight"],
                  [EXERCISE_TYPES.CARDIO, "Cardio", "One setting + total time"],
                ].map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={type === value}
                    className={`${styles.typeOption} ${type === value ? styles.typeOptionActive : ""}`}
                    onClick={() => setType(value)}
                  >
                    <span className={styles.typeOptionLabel}>{label}</span>
                    <span className={styles.typeOptionHint}>{hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.fieldPair}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="equipment">Equipment</label>
                <input
                  id="equipment"
                  className={styles.input}
                  list="equipment-options"
                  maxLength={EQUIPMENT_MAX_LENGTH}
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  placeholder="e.g. Dumbbell"
                />
                <datalist id="equipment-options">
                  {equipmentOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>

              <div className={styles.field}>
                <span className={styles.label} id="location-label">Location</span>
                <div className={styles.locationToggle} role="group" aria-labelledby="location-label">
                  {EXERCISE_LOCATIONS.map((place) => {
                    const on = location.includes(place);
                    return (
                      <button
                        key={place}
                        type="button"
                        aria-pressed={on}
                        className={`${styles.locationOption} ${on ? styles.locationOptionActive : ""}`}
                        onClick={() =>
                          setLocation((prev) =>
                            // Keep the Gym/Home order consistent whichever is tapped first.
                            on ? prev.filter((p) => p !== place) : EXERCISE_LOCATIONS.filter((p) => p === place || prev.includes(p))
                          )
                        }
                      >
                        {on ? "✓ " : ""}
                        {place}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="description">Description</label>
              <textarea
                id="description"
                className={`${styles.input} ${styles.textarea}`}
                rows={3}
                maxLength={TEXT_LIMITS.description}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short summary of the exercise and what it works."
              />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Instructions</span>
              <span className={styles.hint}>One step per box, in order. Steps are numbered automatically.</span>
              <InstructionsEditor steps={steps} onChange={setSteps} />
            </div>

            <div className={styles.field}>
              <span className={styles.label}>Body areas</span>
              <span className={styles.hint}>
                Each area can only be in one group — picking it in one moves it out of the others.
              </span>
              <div className={styles.tierDropdowns}>
                {TAG_TIERS.map(({ key, label, tone, hint }) => (
                  <MultiSelectDropdown
                    key={key}
                    label={label}
                    hint={hint}
                    tone={tone}
                    options={BODY_AREAS}
                    selected={tagsByTier[key]}
                    onToggle={(area) => toggleTag(key, area)}
                    noteFor={(area) => {
                      const other = TAG_TIERS.find((t) => t.key !== key && tagsByTier[t.key].includes(area));
                      return other ? `in ${other.label}` : null;
                    }}
                    placeholder="None"
                  />
                ))}
              </div>
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

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete exercise?"
          confirmLabel="Delete exercise"
          busyLabel="Deleting…"
          danger
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        >
          <p>
            Are you sure you want to delete <strong>{confirmingDelete.name}</strong>? It isn&apos;t used in any
            programme.
          </p>
          <p>Its uploaded image or video is removed too. This can&apos;t be undone.</p>
        </ConfirmDialog>
      )}

      {replacing && (
        <ReplaceExerciseDialog
          exercise={replacing.exercise}
          usage={replacing.usage}
          library={exercises ?? []}
          userNames={userNames}
          onCancel={() => setReplacing(null)}
          onDeleted={async () => {
            const { exercise } = replacing;
            setReplacing(null);
            await afterDelete(exercise);
          }}
        />
      )}
    </>
  );
}
