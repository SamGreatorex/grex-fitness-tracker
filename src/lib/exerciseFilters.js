// Filtering for exercise lists (admin library, trainer's exercise picker).
// Pure — no React — so both screens share exactly the same behaviour.
import { isCardio } from "./exerciseTypes";

// Every filter is a multi-select list: an empty list means "any". Ticking
// several values in one filter matches ANY of them; different filters must
// ALL match (e.g. Home + (Kettlebell or Dumbbell) + Glutes).
export const EMPTY_FILTERS = {
  search: "",
  type: [], // "strength" | "cardio"
  equipment: [], // equipment names
  location: [], // "Gym" | "Home"
  muscles: [], // body areas
  primaryOnly: false, // match muscles on primary tags only
};

const FILTER_KEYS = ["type", "equipment", "location", "muscles"];

export function activeFilterCount(f) {
  return FILTER_KEYS.filter((k) => f[k].length > 0).length;
}

function tagsFor(exercise, primaryOnly) {
  return primaryOnly
    ? exercise.primaryTags ?? []
    : [...(exercise.primaryTags ?? []), ...(exercise.secondaryTags ?? []), ...(exercise.stabilizerTags ?? [])];
}

// Search matches the name or any body-area tag. Muscles match an exercise
// that works ANY of the selected areas (primary tags only if primaryOnly).
export function filterExercises(exercises, f) {
  const term = f.search.trim().toLowerCase();
  return exercises.filter((e) => {
    if (term && !e.name.toLowerCase().includes(term) && !tagsFor(e, false).some((t) => t.toLowerCase().includes(term))) {
      return false;
    }
    if (f.type.length && !f.type.includes(isCardio(e) ? "cardio" : "strength")) return false;
    if (f.equipment.length && !f.equipment.includes(e.equipment)) return false;
    if (f.location.length && !(e.location ?? []).some((l) => f.location.includes(l))) return false;
    if (f.muscles.length && !tagsFor(e, f.primaryOnly).some((t) => f.muscles.includes(t))) return false;
    return true;
  });
}

// Equipment values actually present, for the Equipment filter.
export function equipmentIn(exercises) {
  return [...new Set(exercises.map((e) => e.equipment).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
