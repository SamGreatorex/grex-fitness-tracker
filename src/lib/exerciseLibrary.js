import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";

// The exercise library is the same for everyone and rarely changes, so each
// server instance keeps it for a few minutes instead of scanning the table
// on every GET /api/exercises. Admin edits clear it on the instance that
// made them; other instances catch up within TTL_MS (the admin page asks
// for a fresh copy, so it always shows its own changes).
const TTL_MS = 5 * 60_000;

let cached = null; // { at, promise } — the promise, so concurrent requests share one scan

async function scanLibrary() {
  const exercises = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLES.exercises, ExclusiveStartKey }));
    exercises.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return exercises.sort((a, b) => a.name.localeCompare(b.name));
}

// Every library exercise, sorted by name. Shared between requests — don't
// mutate the result.
export function getExerciseLibrary({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const promise = scanLibrary();
  cached = { at: Date.now(), promise };
  // A failed scan isn't kept, so the next request tries again.
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

// Call after any change to the exercises table.
export function invalidateExerciseLibrary() {
  cached = null;
}
