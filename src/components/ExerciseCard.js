import styles from "./ExerciseCard.module.css";
import { slugify } from "../lib/slugify";

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
// (if the exercise has one), then a generic placeholder icon.
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

function makeImgErrorHandler(candidates) {
  let index = 0;
  return (e) => {
    index += 1;
    if (index < candidates.length) {
      e.currentTarget.src = candidates[index];
    } else {
      e.currentTarget.style.display = "none";
      e.currentTarget.nextElementSibling.style.display = "flex";
    }
  };
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
export default function ExerciseCard({ exercise, sets, lastSets, libraryEntry, onSetField, onLogSet }) {
  const allDone = sets.every((s) => s.completed);
  const tags = libraryEntry?.tags || [];
  const isVideo = libraryEntry?.mediaType === "video" && libraryEntry.mediaUrl;

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
  } else {
    const candidates = buildImageCandidates(exercise, libraryEntry);
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.thumb}
        src={candidates[0]}
        alt=""
        loading="lazy"
        onError={makeImgErrorHandler(candidates)}
      />
    );
    const fallback = (
      <span className={styles.thumbFallback} style={{ display: "none" }}>
        <ThumbIcon />
      </span>
    );
    const href = exercise.videoLink || libraryEntry?.mediaUrl || null;
    thumb = href ? (
      <a className={styles.thumbLink} href={href} target="_blank" rel="noreferrer" aria-label={`${exercise.name} example`}>
        {image}
        {fallback}
      </a>
    ) : (
      <div className={styles.thumbLink} aria-hidden="true">
        {image}
        {fallback}
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
          {tags.length > 0 && (
            <div className={styles.tags}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={styles.setsHeader}>
        <span>Set</span>
        <span>Weight (kg)</span>
        <span>Reps</span>
        <span />
      </div>

      {sets.map((set, i) => {
        const last = lastSets?.[i];
        return (
          <div key={i} className={styles.setRow}>
            <span className={styles.setNumber}>{i + 1}</span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              step="0.5"
              min="0"
              placeholder={last ? `${last.weight}` : "0"}
              value={set.weight}
              onChange={(e) => onSetField(i, "weight", e.target.value)}
            />
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min="0"
              placeholder={last ? `${last.reps}` : exercise.targetReps || ""}
              value={set.reps}
              onChange={(e) => onSetField(i, "reps", e.target.value)}
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
    </div>
  );
}
