// Primary movers matter far more than stabilizers when judging whether two
// exercises train "the same area" — a shared primary tag should outweigh
// several shared stabilizer tags.
const TIER_WEIGHTS = { primaryTags: 3, secondaryTags: 2, stabilizerTags: 1 };

function tagWeights(exercise) {
  const weights = {};
  for (const [tierKey, weight] of Object.entries(TIER_WEIGHTS)) {
    for (const tag of exercise?.[tierKey] || []) {
      weights[tag] = Math.max(weights[tag] || 0, weight);
    }
  }
  return weights;
}

// Higher score = more overlap in the body areas each exercise targets,
// weighted toward tags both exercises rate highly (primary vs primary
// scores far above stabilizer vs stabilizer).
export function tagSimilarity(a, b) {
  const weightsA = tagWeights(a);
  const weightsB = tagWeights(b);
  let score = 0;
  for (const [tag, weightA] of Object.entries(weightsA)) {
    if (weightsB[tag] != null) score += weightA * weightsB[tag];
  }
  return score;
}

// Ranks the library (excluding `current` itself) by closeness to `current`,
// best match first. Ties fall back to alphabetical order for stability.
export function rankAlternatives(current, library) {
  return library
    .filter((exercise) => exercise.exerciseId !== current?.exerciseId)
    .map((exercise) => ({ exercise, score: tagSimilarity(current, exercise) }))
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
}
