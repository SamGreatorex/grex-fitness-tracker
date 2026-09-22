// "Dumbbell Shoulder Press" -> "dumbbell-shoulder-press". Used as the
// Exercises table primary key and to match program exercises (by name) to
// their library entry, and to the public/exercise-images/ naming convention.
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
