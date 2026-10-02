// Shared by the client and the API routes — no server-only imports here.
import { slugify } from "./slugify";

// A personal note on one exercise in one programme day (e.g. "seat on
// notch 4"). Stored on the programme as exerciseNotes[key] = { text,
// updatedAt, updatedBy }, keyed by day and exercise *name* — not the slot's
// exerciseId, which the builder renumbers on every save — so a note stays
// with its exercise however the day is reordered.
export const EXERCISE_NOTE_MAX_LENGTH = 1000;

export function exerciseNoteKey(dayId, exerciseName) {
  return `${dayId}#${slugify(exerciseName)}`;
}
