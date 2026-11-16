import { isCardio } from "./exerciseTypes";
import { EFFORT_SAME } from "./exerciseProgress";

// Recommendations shown on an exercise during a workout, based on what was
// logged for it the last two times it was done: `lastSets` (last time) and
// `previousSets` (the time before — usually last week's), each that
// session's sets as saved. Only the sets themselves count, never their drop
// sets (which are lighter and harder by design).
//
// Each rule looks at that history and returns a recommendation or null.
// Rules that agree (same id) become one tip listing every reason. Add new
// rules to RULES; tips are shown in the order their first rule appears.
//
// A recommendation: { id, title, reasons: [string] }.

// Effort below this (1–5: Extremely Easy … Somewhat Hard) means a weighted
// exercise was too light.
export const EASY_EFFORT_BELOW = 6;

// For an exercise done without weight: effort below this (1–4: Extremely
// Easy … Somewhat Easy) means it was too easy.
export const EASY_BODYWEIGHT_EFFORT_BELOW = 5;

const INCREASE_WEIGHT = { id: "increase-weight", title: "Increase the weight" };
const INCREASE_REPS = { id: "increase-reps", title: "Increase the reps, or add some weight if you can" };

// Logged with no weight (0 or left blank) on every set: a bodyweight
// exercise, where the next step is more reps rather than more weight.
const isUnweighted = (sets) => sets.every((s) => !(Number(s.weight) > 0));

// "set 1 at 3/10 and set 3 at 4/10" for the sets rated under `below`.
function easySetsList(sets, below) {
  const rated = sets
    .map((set, i) => ({ number: i + 1, effort: set.effort }))
    .filter((s) => s.effort != null && s.effort < below)
    .map((s) => `set ${s.number} at ${s.effort}/10`);
  if (rated.length === 0) return null;
  return rated.length === 1 ? rated[0] : `${rated.slice(0, -1).join(", ")} and ${rated[rated.length - 1]}`;
}

function averageEffort(sets) {
  const efforts = (sets ?? []).map((s) => s.effort).filter((e) => e != null);
  return efforts.length ? efforts.reduce((a, b) => a + b, 0) / efforts.length : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

const RULES = [
  // Any set last time rated under 6 → increase the weight.
  function easyLastTime(lastSets) {
    if (isUnweighted(lastSets)) return null;
    const list = easySetsList(lastSets, EASY_EFFORT_BELOW);
    return list && { ...INCREASE_WEIGHT, reason: `Last time you rated ${list} — under ${EASY_EFFORT_BELOW} means it felt easy.` };
  },

  // Effort went down since the time before (last week) → it's getting
  // easier: increase the weight (or, done without weight, the reps).
  function gettingEasier(lastSets, previousSets) {
    const last = averageEffort(lastSets);
    const before = averageEffort(previousSets);
    if (last == null || before == null || before - last < EFFORT_SAME) return null;
    const reason = `It felt easier last time than the time before (average effort ${round1(before)} → ${round1(last)}).`;
    return { ...(isUnweighted(lastSets) ? INCREASE_REPS : INCREASE_WEIGHT), reason };
  },

  // Done without weight, and any set last time rated under 5 → more reps,
  // or add some weight if possible.
  function easyWithoutWeight(lastSets) {
    if (!isUnweighted(lastSets)) return null;
    const list = easySetsList(lastSets, EASY_BODYWEIGHT_EFFORT_BELOW);
    return (
      list && {
        ...INCREASE_REPS,
        reason: `Last time you did it without weight and rated ${list} — under ${EASY_BODYWEIGHT_EFFORT_BELOW} means it felt easy.`,
      }
    );
  },
];

// Every recommendation for a strength exercise; none for cardio or an
// exercise with no history.
export function recommendationsFor(exercise, lastSets, previousSets = null) {
  if (isCardio(exercise) || !lastSets?.length) return [];
  const byId = new Map();
  for (const rule of RULES) {
    const tip = rule(lastSets, previousSets);
    if (!tip) continue;
    if (!byId.has(tip.id)) byId.set(tip.id, { id: tip.id, title: tip.title, reasons: [] });
    byId.get(tip.id).reasons.push(tip.reason);
  }
  return [...byId.values()];
}
