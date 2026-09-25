"use client";

import { useRef, useState } from "react";
import styles from "./ExerciseCard.module.css";
import { slugify } from "../lib/slugify";
import { effortColor } from "../lib/effort";
import RestPicker from "./RestPicker";
import SwitchExerciseDialog from "./SwitchExerciseDialog";

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
// [{ weight, reps, completed }]. `lastSets` (optional) are the sets logged
// last time this exercise was done, used only to show a "last time" hint.
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
  onApplyRestToAll,
  onSwitchExercise,
}) {
  const lightboxRef = useRef(null);
  const [candidateIndex, setCandidateIndex] = useState(0);

  const allDone = sets.every((s) => s.completed);
  const primaryTags = libraryEntry?.primaryTags || [];
  const secondaryTags = libraryEntry?.secondaryTags || [];
  const stabilizerTags = libraryEntry?.stabilizerTags || [];
  const hasTags = primaryTags.length > 0 || secondaryTags.length > 0 || stabilizerTags.length > 0;
  const isVideo = libraryEntry?.mediaType === "video" && libraryEntry.mediaUrl;
  const candidates = isVideo ? [] : buildImageCandidates(exercise, libraryEntry);
  const hasImage = candidateIndex < candidates.length;
  const currentSrc = hasImage ? candidates[candidateIndex] : null;

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
          <p className={styles.name}>{exercise.name}</p>
          <p className={styles.meta}>
            {exercise.targetSets} sets × {exercise.targetReps} reps · {exercise.restSeconds}s rest
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

      <div className={styles.setsHeader}>
        <span>Set</span>
        <span>Weight (kg)</span>
        <span>Reps</span>
        <span>Rest</span>
        <span />
      </div>

      {sets.map((set, i) => {
        const last = lastSets?.[i];
        const effort = set.effort ?? last?.effort ?? null;
        const effortIsCurrent = set.effort != null;
        const badgeClassName = `${styles.setNumber} ${effort != null ? styles.setNumberTinted : ""} ${effortIsCurrent ? styles.setNumberCurrent : ""} ${set.completed ? styles.setNumberButton : ""}`;
        const badgeStyle = effort != null ? { "--effort-color": effortColor(effort) } : undefined;
        return (
          <div key={i} className={styles.setRow}>
            {set.completed ? (
              <button
                type="button"
                className={badgeClassName}
                style={badgeStyle}
                title={`${effort != null ? `Effort: ${effort}/10` : `Set ${i + 1}`} — tap to change`}
                onClick={() => onEditEffort(i)}
              >
                {effort != null ? effort : i + 1}
              </button>
            ) : (
              <span
                className={badgeClassName}
                style={badgeStyle}
                title={effort != null ? `Last time: ${effort}/10` : `Set ${i + 1}`}
              >
                {effort != null ? effort : i + 1}
              </span>
            )}
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder={last ? `${last.weight}` : "0"}
              value={set.weight}
              onChange={(e) => onSetField(i, "weight", e.target.value)}
              onMouseUp={selectAllOnMouseUp}
            />
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder={last ? `${last.reps}` : exercise.targetReps || ""}
              value={set.reps}
              onChange={(e) => onSetField(i, "reps", e.target.value)}
              onMouseUp={selectAllOnMouseUp}
            />
            <RestPicker
              seconds={set.restSeconds ?? exercise.restSeconds}
              onApplyToSet={(secs) => onSetField(i, "restSeconds", secs)}
              onApplyToAll={(secs) => onApplyRestToAll(secs)}
            />
            <button
              type="button"
              className={`${styles.logButton} ${set.completed ? styles.logButtonDone : ""}`}
              onClick={() => onLogSet(i)}
            >
              {set.completed ? "Logged" : "Log"}
            </button>
          </div>
        );
      })}

      {hasImage && (
        <dialog ref={lightboxRef} className={styles.lightbox} onClick={handleLightboxBackdropClick}>
          <div className={styles.lightboxInner}>
            <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={closeLightbox}>
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.lightboxImage} src={currentSrc} alt={exercise.name} />
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
