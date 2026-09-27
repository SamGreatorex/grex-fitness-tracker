// Shared by the client and the API routes — no server-only imports here.
//
// Strength exercises are sets × reps × weight. Cardio exercises have no
// weight or sets: just one free-text setting (e.g. "8 mph", "level 6,
// incline 2") and one total time. Anything without a `type` is strength,
// so existing exercises, programmes and sessions need no migration.

export const EXERCISE_TYPES = { STRENGTH: "strength", CARDIO: "cardio" };

export function isCardio(exerciseOrType) {
  const type = typeof exerciseOrType === "string" ? exerciseOrType : exerciseOrType?.type;
  return type === EXERCISE_TYPES.CARDIO;
}

export const CARDIO_LIMITS = { settingsLength: 60, maxSeconds: 6 * 60 * 60 };

// 300 → "5 min", 90 → "1 min 30 s", 45 → "45 s".
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

// "5 min · 8 mph" (settings omitted when blank).
export function formatCardio({ settings, seconds }) {
  return [formatDuration(seconds), settings?.trim()].filter(Boolean).join(" · ");
}

// Minutes as typed (may be decimal, e.g. "2.5") → whole seconds, or null.
export function minutesToSeconds(minutes) {
  if (minutes === "" || minutes == null) return null;
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
}

export function secondsToMinutes(seconds) {
  if (seconds == null) return "";
  return Math.round((Number(seconds) / 60) * 100) / 100;
}
