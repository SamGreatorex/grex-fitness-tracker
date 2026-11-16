"use client";

import { useRef, useState } from "react";
import styles from "./ExerciseCard.module.css";
import { slugify } from "../lib/slugify";
import { effortColor, effortLabel } from "../lib/effort";
import RestPicker from "./RestPicker";
import SwitchExerciseDialog from "./SwitchExerciseDialog";
import ExerciseNote from "./ExerciseNote";
import { formatCardio, isCardio } from "../lib/exerciseTypes";
import { stripStepNumber } from "../lib/exerciseText";
import { LIFT_UNITS, setWeightIn } from "../lib/units";
import { recommendationsFor } from "../lib/recommendations";

// Vimeo links can be turned into a real thumbnail image via vumbnail.com
// (no API key needed). Other sources (e.g. jamessmithacademy course pages)
// don't have a fetchable thumbnail.
function getVimeoThumbnail(videoLink) {
  if (!videoLink) return null;
  const match = videoLink.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? `https://vumbnail.com/${match[1]}.jpg` : null;
}

// Fallback chain for the thumbnail image: the admin-uploaded library photo
// (if any), then a locally-provided exercise photo, then a Vimeo thumbnail
// (if the exercise has one).
function buildImageCandidates(exercise, libraryEntry) {
  const candidates = [];
  if (libraryEntry?.mediaUrl && libraryEntry.mediaType !== "video") {
    candidates.push(libraryEntry.mediaUrl);
  }
  candidates.push(`/exercise-images/${slugify(exercise.name)}.webp`);
  const vimeoThumb = getVimeoThumbnail(exercise.videoLink);
  if (vimeoThumb) candidates.push(vimeoThumb);
  return candidates;
}

// Calling .select() synchronously on focus makes iOS/Android pop the native
// text-selection callout (copy/paste bubble) right on top of it, which reads
// as a stray context menu. Deferring it with setTimeout avoided that, but
// opened a race: on a fast tap-then-type, the deferred select() could land
// *between* keystrokes and eat part of what was just typed. onMouseUp fires
// at tap-release — after focus, but before any typing can happen — so it
// sidesteps the callout without that race.
function selectAllOnMouseUp(e) {
  e.currentTarget.select();
}

// An upward arrow in a circle: "go up" — the recommendation icon.
function TipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8M8.5 11.5 12 8l3.5 3.5" />
    </svg>
  );
}

function ThumbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M21 16l-5-4-4.5 4-2.5-2-6 5" />
    </svg>
  );
}

// `sets` is the local editable state for this exercise:
// [{ weight, reps, completed, drops }], where drops are the drop sets added
// after that set, [{ weight, reps, completed, effort }] — each logged and
// rated on its own. `lastSets` (optional) are the sets logged
// last time this exercise was done, used only to show a "last time" hint.
// For a cardio exercise, `sets` is a single [{ settings, minutes, completed,
// effort }] and `lastSets` is the last logged { settings, durationSeconds,
// effort } instead.
// `libraryEntry` (optional) is the matching admin-managed Exercises record
// (tags + uploaded media), matched by slugify(exercise.name).
export default function ExerciseCard({
  exercise,
  sets,
  lastSets,
  libraryEntry,
  libraryEntries,
  onSetField,
  onLogSet,
  onEditEffort,
  // Drop sets: (setIndex) / (setIndex, dropIndex[, field, value]).
  onAddDrop,
  onDropField,
  onLogDrop,
  onRemoveDrop,
  onApplyRestToAll,
  onSwitchExercise,
  // Off for untimed (trainer-led) workouts — there's no rest countdown.
  showRest = true,
  // The unit this exercise's weights are typed in ("kg" | "lb"), and a
  // callback to switch it — e.g. for a machine labelled in pounds. Weights
  // are saved in kg either way.
  weightUnit = LIFT_UNITS.KG,
  onWeightUnitChange,
  // The personal note on this exercise for this programme day, and a
  // callback to save it (empty text clears it).
  note,
  onSaveNote,
}) {
  const lightboxRef = useRef(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  // Tips from last time's sets (e.g. "Increase the weight"), behind an icon.
  const recommendations = recommendationsFor(exercise, lastSets);
  const [tipsOpen, setTipsOpen] = useState(false);

  const cardio = isCardio(exercise);
  const allDone = sets.every((s) => s.completed);
  const primaryTags = libraryEntry?.primaryTags || [];
  const secondaryTags = libraryEntry?.secondaryTags || [];
  const stabilizerTags = libraryEntry?.stabilizerTags || [];
  const hasTags = primaryTags.length > 0 || secondaryTags.length > 0 || stabilizerTags.length > 0;
  const isVideo = libraryEntry?.mediaType === "video" && libraryEntry.mediaUrl;
  const candidates = isVideo ? [] : buildImageCandidates(exercise, libraryEntry);
  const hasImage = candidateIndex < candidates.length;
  const currentSrc = hasImage ? candidates[candidateIndex] : null;
  // How-to text from the exercise library, shown under the picture when it's
  // opened (or on its own if there's no picture yet).
  const description = libraryEntry?.description?.trim() || null;
  const steps = (libraryEntry?.instructions ?? []).map(stripStepNumber).filter(Boolean);
  const hasDetails = !!description || steps.length > 0;
  const canOpen = hasImage || hasDetails;

  const openLightbox = () => lightboxRef.current?.showModal();
  const closeLightbox = () => lightboxRef.current?.close();
  const handleLightboxBackdropClick = (e) => {
    if (e.target === lightboxRef.current) closeLightbox();
  };

  let thumb;
  if (isVideo) {
    thumb = (
      <video
        className={styles.thumbVideo}
        src={libraryEntry.mediaUrl}
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  } else if (hasImage) {
    thumb = (
      <button
        type="button"
        className={styles.thumbLink}
        onClick={openLightbox}
        aria-label={`View ${exercise.name} example image`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.thumb}
          src={currentSrc}
          alt=""
          loading="lazy"
          onError={() => setCandidateIndex((i) => i + 1)}
        />
      </button>
    );
  } else if (hasDetails) {
    // No picture, but there's a description/instructions to show.
    thumb = (
      <button type="button" className={styles.thumbLink} onClick={openLightbox} aria-label={`How to do ${exercise.name}`}>
        <span className={styles.thumbFallback}>
          <ThumbIcon />
        </span>
      </button>
    );
  } else if (exercise.videoLink) {
    thumb = (
      <a className={styles.thumbLink} href={exercise.videoLink} target="_blank" rel="noreferrer" aria-label={`${exercise.name} example`}>
        <span className={styles.thumbFallback}>
          <ThumbIcon />
        </span>
      </a>
    );
  } else {
    thumb = (
      <div className={styles.thumbLink} aria-hidden="true">
        <span className={styles.thumbFallback}>
          <ThumbIcon />
        </span>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${allDone ? styles.cardDone : ""}`}>
      <div className={styles.headerRow}>
        {thumb}
        <div className={styles.headerText}>
          <div className={styles.nameRow}>
            <p className={styles.name}>{exercise.name}</p>
            {recommendations.length > 0 && (
              <button
                type="button"
                className={`${styles.tipButton} ${tipsOpen ? styles.tipButtonOpen : ""}`}
                aria-expanded={tipsOpen}
                aria-controls={`tips-${exercise.exerciseId}`}
                aria-label={`${recommendations.length === 1 ? "Recommendation" : `${recommendations.length} recommendations`} for ${exercise.name}`}
                title={recommendations.map((r) => r.title).join(" · ")}
                onClick={() => setTipsOpen((open) => !open)}
              >
                <TipIcon />
              </button>
            )}
          </div>
          <p className={styles.meta}>
            {cardio
              ? formatCardio({ settings: exercise.settings, seconds: exercise.targetSeconds })
              : `${exercise.targetSets} sets × ${exercise.targetReps} reps${showRest ? ` · ${exercise.restSeconds}s rest` : ""}`}
          </p>
          {hasTags && (
            <div className={styles.tags}>
              {primaryTags.map((tag) => (
                <span key={`p-${tag}`} className={`${styles.tag} ${styles.tagPrimary}`}>{tag}</span>
              ))}
              {secondaryTags.map((tag) => (
                <span key={`s-${tag}`} className={`${styles.tag} ${styles.tagSecondary}`}>{tag}</span>
              ))}
              {stabilizerTags.map((tag) => (
                <span key={`st-${tag}`} className={`${styles.tag} ${styles.tagStabilizer}`}>{tag}</span>
              ))}
            </div>
          )}
          {onSwitchExercise && (
            <SwitchExerciseDialog
              currentName={exercise.name}
              currentLibraryEntry={libraryEntry}
              library={libraryEntries}
              onSelect={onSwitchExercise}
            />
          )}
        </div>
      </div>

      {tipsOpen && recommendations.length > 0 && (
        <ul id={`tips-${exercise.exerciseId}`} className={styles.tips}>
          {recommendations.map((r) => (
            <li key={r.id} className={styles.tip}>
              <span className={styles.tipTitle}>{r.title}</span>
              <span className={styles.tipReason}>{r.reason}</span>
            </li>
          ))}
        </ul>
      )}

      <ExerciseNote note={note} onSave={onSaveNote} />

      {cardio ? (
        <CardioRow row={sets[0]} last={lastSets} onSetField={onSetField} onLog={() => onLogSet(0)} onEditEffort={() => onEditEffort(0)} />
      ) : (
        <>
          <div className={`${styles.setsHeader} ${showRest ? "" : styles.noRest}`}>
            <span>Set</span>
            <span className={styles.weightHeader}>
              <span className={styles.weightLabel}>Weight{onWeightUnitChange ? "" : ` (${weightUnit})`}</span>
              {onWeightUnitChange && (
                <span className={styles.unitToggle} role="group" aria-label={`Weight unit for ${exercise.name}`}>
                  {[LIFT_UNITS.KG, LIFT_UNITS.LB].map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      aria-pressed={weightUnit === unit}
                      className={`${styles.unitOption} ${weightUnit === unit ? styles.unitOptionActive : ""}`}
                      onClick={() => onWeightUnitChange(unit)}
                      title={unit === LIFT_UNITS.LB ? "Enter in pounds — saved as kg" : "Enter in kilograms"}
                    >
                      {unit}
                    </button>
                  ))}
                </span>
              )}
            </span>
            <span>Reps</span>
            {showRest && <span>Rest</span>}
            <span />
          </div>

          {sets.map((set, i) => {
            const last = lastSets?.[i];
            const effort = set.effort ?? last?.effort ?? null;
            const effortIsCurrent = set.effort != null;
            const badgeClassName = `${styles.setNumber} ${effort != null ? styles.setNumberTinted : ""} ${effortIsCurrent ? styles.setNumberCurrent : ""} ${set.completed ? styles.setNumberButton : ""}`;
            const badgeStyle = effort != null ? { "--effort-color": effortColor(effort) } : undefined;
            const parts = [set, ...(set.drops ?? [])];
            return (
              <div key={i}>
                <div className={`${styles.setRow} ${showRest ? "" : styles.noRest}`}>
                  {set.completed ? (
                    <button
                      type="button"
                      className={badgeClassName}
                      style={badgeStyle}
                      title={`${effort != null ? `Effort: ${effort}/10 · ${effortLabel(effort)}` : `Set ${i + 1}`} — tap to change`}
                      onClick={() => onEditEffort(i)}
                    >
                      {effort != null ? effort : i + 1}
                    </button>
                  ) : (
                    <span
                      className={badgeClassName}
                      style={badgeStyle}
                      title={effort != null ? `Last time: ${effort}/10 · ${effortLabel(effort)}` : `Set ${i + 1}`}
                    >
                      {effort != null ? effort : i + 1}
                    </span>
                  )}
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder={last ? `${setWeightIn(last, weightUnit)}` : "0"}
                    value={set.weight}
                    aria-label={`Set ${i + 1} weight in ${weightUnit}`}
                    onChange={(e) => onSetField(i, "weight", e.target.value)}
                    onMouseUp={selectAllOnMouseUp}
                  />
                  <input
                    className={styles.input}
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min="0"
                    placeholder={last ? `${last.reps}` : exercise.targetReps || ""}
                    value={set.reps}
                    onChange={(e) => onSetField(i, "reps", e.target.value)}
                    onMouseUp={selectAllOnMouseUp}
                  />
                  {showRest && (
                    <RestPicker
                      seconds={set.restSeconds ?? exercise.restSeconds}
                      onApplyToSet={(secs) => onSetField(i, "restSeconds", secs)}
                      onApplyToAll={(secs) => onApplyRestToAll(secs)}
                    />
                  )}
                  <button
                    type="button"
                    className={`${styles.logButton} ${set.completed ? styles.logButtonDone : ""}`}
                    onClick={() => onLogSet(i)}
                  >
                    {set.completed ? "Logged" : "Log"}
                  </button>
                </div>
                {(set.drops ?? []).map((drop, j) => (
                  <DropRow
                    key={j}
                    drop={drop}
                    before={parts[j]}
                    label={`Set ${i + 1} drop ${j + 1}`}
                    weightUnit={weightUnit}
                    showRest={showRest}
                    onField={(field, value) => onDropField(i, j, field, value)}
                    onLog={() => onLogDrop(i, j)}
                    onEditEffort={() => onEditEffort(i, j)}
                    onRemove={() => onRemoveDrop(i, j)}
                  />
                ))}
                {/* A drop set follows a set, so it's offered once the set's logged. */}
                {set.completed && onAddDrop && (
                  <button type="button" className={styles.addDrop} onClick={() => onAddDrop(i)}>
                    + Drop set
                  </button>
                )}
              </div>
            );
          })}
        </>
      )}

      {canOpen && (
        <dialog ref={lightboxRef} className={styles.lightbox} onClick={handleLightboxBackdropClick} aria-label={exercise.name}>
          <div className={styles.lightboxInner}>
            <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={closeLightbox}>
              ×
            </button>
            {hasImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.lightboxImage} src={currentSrc} alt={exercise.name} />
            )}
            <div className={styles.details}>
              <p className={styles.detailsName}>{exercise.name}</p>
              {description && <p className={styles.detailsDescription}>{description}</p>}
              {steps.length > 0 && (
                <>
                  <p className={styles.detailsHeading}>How to do it</p>
                  <ol className={styles.detailsSteps}>
                    {steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            {exercise.videoLink && (
              <a className={styles.lightboxLink} href={exercise.videoLink} target="_blank" rel="noreferrer">
                Open original source ↗
              </a>
            )}
          </div>
        </dialog>
      )}
    </div>
  );
}

// One drop set under its set: weight · reps · remove · log. Its badge shows
// its own effort once rated (tap to change), "↓" until then. Blank boxes
// show `before` — the set, or the drop before it — which logging falls
// back to.
function DropRow({ drop, before, label, weightUnit, showRest, onField, onLog, onEditEffort, onRemove }) {
  const effort = drop.effort;
  const badgeStyle = effort != null ? { "--effort-color": effortColor(effort) } : undefined;
  const badgeClassName = `${styles.setNumber} ${styles.dropBadge} ${effort != null ? `${styles.setNumberTinted} ${styles.setNumberCurrent}` : ""} ${drop.completed ? styles.setNumberButton : ""}`;
  const badge = effort != null ? effort : "↓";

  return (
    <div className={`${styles.setRow} ${styles.dropRow} ${showRest ? "" : styles.dropRowNoRest}`}>
      {drop.completed ? (
        <button
          type="button"
          className={badgeClassName}
          style={badgeStyle}
          title={`${effort != null ? `Drop set effort: ${effort}/10 · ${effortLabel(effort)}` : "Drop set"} — tap to change`}
          onClick={onEditEffort}
        >
          {badge}
        </button>
      ) : (
        <span className={badgeClassName} style={badgeStyle} title="Drop set">
          {badge}
        </span>
      )}
      <input
        className={styles.input}
        type="number"
        inputMode="decimal"
        step="0.1"
        min="0"
        placeholder={before.weight !== "" ? `${before.weight}` : "0"}
        value={drop.weight}
        aria-label={`${label} weight in ${weightUnit}`}
        onChange={(e) => onField("weight", e.target.value)}
        onMouseUp={selectAllOnMouseUp}
      />
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        step="1"
        min="0"
        placeholder={before.reps !== "" ? `${before.reps}` : ""}
        value={drop.reps}
        aria-label={`${label} reps`}
        onChange={(e) => onField("reps", e.target.value)}
        onMouseUp={selectAllOnMouseUp}
      />
      <button type="button" className={styles.removeDrop} onClick={onRemove} aria-label={`Remove ${label}`} title="Remove drop set">
        ×
      </button>
      <button type="button" className={`${styles.logButton} ${drop.completed ? styles.logButtonDone : ""}`} onClick={onLog}>
        {drop.completed ? "Logged" : "Log"}
      </button>
    </div>
  );
}

// Cardio: one setting + total time, logged once. The badge shows the
// effort rating (tap to change once logged), like a strength set's.
function CardioRow({ row, last, onSetField, onLog, onEditEffort }) {
  const effort = row.effort ?? last?.effort ?? null;
  const badgeStyle = effort != null ? { "--effort-color": effortColor(effort) } : undefined;
  const badgeClassName = `${styles.setNumber} ${effort != null ? styles.setNumberTinted : ""} ${row.effort != null ? styles.setNumberCurrent : ""} ${row.completed ? styles.setNumberButton : ""}`;

  return (
    <>
      <div className={`${styles.setsHeader} ${styles.cardioGrid}`}>
        <span />
        <span>Settings</span>
        <span>Time (min)</span>
        <span />
      </div>
      <div className={`${styles.setRow} ${styles.cardioGrid}`}>
        {row.completed ? (
          <button type="button" className={badgeClassName} style={badgeStyle} title={`${effort != null ? `Effort: ${effort}/10 · ${effortLabel(effort)}` : "Effort"} — tap to change`} onClick={onEditEffort}>
            {effort != null ? effort : "✓"}
          </button>
        ) : (
          <span className={badgeClassName} style={badgeStyle} title={effort != null ? `Last time: ${effort}/10 · ${effortLabel(effort)}` : "Cardio"}>
            {effort != null ? effort : "•"}
          </span>
        )}
        <input
          className={`${styles.input} ${styles.cardioSettings}`}
          type="text"
          maxLength={60}
          placeholder={last?.settings || "e.g. 8 mph"}
          value={row.settings}
          onChange={(e) => onSetField(0, "settings", e.target.value)}
          aria-label="Settings"
        />
        <input
          className={styles.input}
          type="number"
          inputMode="decimal"
          min="0"
          step="0.5"
          value={row.minutes}
          onChange={(e) => onSetField(0, "minutes", e.target.value)}
          onMouseUp={selectAllOnMouseUp}
          aria-label="Time in minutes"
        />
        <button type="button" className={`${styles.logButton} ${row.completed ? styles.logButtonDone : ""}`} onClick={onLog}>
          {row.completed ? "Logged" : "Log"}
        </button>
      </div>
      {last && (
        <p className={styles.cardioLast}>Last time: {formatCardio({ settings: last.settings, seconds: last.durationSeconds })}</p>
      )}
    </>
  );
}
