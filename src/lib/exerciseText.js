// Shared by the client and the API routes — no server-only imports here.
//
// Exercise instructions are stored as a list of steps, each prefixed with
// its number ("1. Stand with feet hip-width apart…"), matching the imported
// library data. Editors work on the bare text; numbering is (re)applied on
// save so it always matches the step order.

export const TEXT_LIMITS = { description: 1000, steps: 15, stepLength: 300 };

// "3. Brace your core" → "Brace your core" (also handles "3)" / "3 -").
export function stripStepNumber(step) {
  return String(step ?? "").replace(/^\s*\d+\s*[.)\-:]\s*/, "").trim();
}

// Bare step texts → stored steps: blanks dropped, numbered from 1.
export function numberSteps(steps) {
  return steps
    .map(stripStepNumber)
    .filter(Boolean)
    .map((text, i) => `${i + 1}. ${text}`);
}
