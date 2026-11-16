import { isCardio } from "./exerciseTypes";

// Recommendations shown on an exercise during a workout, based on what was
// logged for it last time (`lastSets`: that session's sets, as saved).
// Each rule looks at the history and returns a recommendation, or null.
// Add new rules to RULES; they're shown in this order.
//
// A recommendation: { id, title, reason }.

// Effort below this (1–4: Extremely Easy … Somewhat Easy) means the weight
// was too light.
export const EASY_EFFORT_BELOW = 6;

const RULES = [
  // 1. Any set last time rated under 6 → increase the weight. Only the sets
  //    themselves count, not their drop sets (which are lighter by design).
  function increaseWeight(exercise, lastSets) {
    const easySets = (lastSets ?? [])
      .map((set, i) => ({ number: i + 1, effort: set.effort }))
      .filter((s) => s.effort != null && s.effort < EASY_EFFORT_BELOW);
    if (easySets.length === 0) return null;
    const rated = easySets.map((s) => `set ${s.number} at ${s.effort}/10`);
    const list = rated.length === 1 ? rated[0] : `${rated.slice(0, -1).join(", ")} and ${rated[rated.length - 1]}`;
    return {
      id: "increase-weight",
      title: "Increase the weight",
      reason: `Last time you rated ${list} — under ${EASY_EFFORT_BELOW} means it felt easy.`,
    };
  },
];

// Every recommendation for a strength exercise; none for cardio or an
// exercise with no history.
export function recommendationsFor(exercise, lastSets) {
  if (isCardio(exercise) || !lastSets?.length) return [];
  return RULES.map((rule) => rule(exercise, lastSets)).filter(Boolean);
}
