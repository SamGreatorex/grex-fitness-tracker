// Shared by the client and the API routes — no server-only imports here.

// Tape measurements a user can log, in the order the form shows them.
// Stored in cm under entry.measurements[key]. To add one, add it here and
// give it a line in BodyDiagram's MEASURE_LINES.
export const MEASUREMENTS = [
  { key: "neck", label: "Neck", hint: "Around the middle of your neck, just below the Adam's apple." },
  { key: "shoulders", label: "Shoulders", hint: "Around the widest point of your shoulders, arms relaxed." },
  { key: "chest", label: "Chest", hint: "Around the fullest part of your chest, under the armpits." },
  { key: "waist", label: "Waist", hint: "Around your natural waist, level with your belly button." },
  { key: "hips", label: "Hips", hint: "Around the widest part of your hips and glutes." },
  { key: "rightArm", label: "Right arm", hint: "Around the widest part of your right upper arm, relaxed." },
  { key: "leftArm", label: "Left arm", hint: "Around the widest part of your left upper arm, relaxed." },
  { key: "rightLeg", label: "Right leg", hint: "Around the widest part of your right thigh, just below the glute." },
  { key: "leftLeg", label: "Left leg", hint: "Around the widest part of your left thigh, just below the glute." },
  { key: "rightCalf", label: "Right calf", hint: "Around the widest part of your right calf." },
  { key: "leftCalf", label: "Left calf", hint: "Around the widest part of your left calf." },
];

export const MEASUREMENT_KEYS = MEASUREMENTS.map((m) => m.key);
export const MEASUREMENT_LABELS = Object.fromEntries(MEASUREMENTS.map((m) => [m.key, m.label]));

export const MEASUREMENT_LIMITS_CM = { min: 5, max: 300 };
export const WEIGHT_LIMITS_KG = { min: 20, max: 400 };

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Today as YYYY-MM-DD in the user's own timezone (not UTC).
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
