import { randomUUID } from "crypto";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";
import { ROLES } from "./profile";

// Programmes belong to exactly one user (ownerUserId). A PT can create and
// edit programmes only for their own clients (users whose ptUserId is the
// PT's userId); admins can for anyone. Everyone else only ever sees, runs
// and tweaks their own.
export const PROGRAM_MANAGER_ROLES = [ROLES.PT, ROLES.ADMIN];

export function isProgramManager(user) {
  return !!user && PROGRAM_MANAGER_ROLES.includes(user.role);
}

// Whether `manager` may see and manage `targetUserId`'s programmes.
export async function canManageUser(manager, targetUserId) {
  if (!isProgramManager(manager) || !targetUserId) return false;
  if (manager.role === ROLES.ADMIN) return true;
  if (targetUserId === manager.userId) return false;
  const { Item: target } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId: targetUserId } }));
  return target?.ptUserId === manager.userId;
}

export async function canAccessProgram(user, program) {
  if (!user || !program) return false;
  return program.ownerUserId === user.userId || canManageUser(user, program.ownerUserId);
}

export async function getProgram(programId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLES.programs, Key: { programId } }));
  return Item ?? null;
}

export async function listProgramsForOwner(ownerUserId) {
  const programs = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.programs,
        IndexName: "OwnerIndex",
        KeyConditionExpression: "ownerUserId = :owner",
        ExpressionAttributeValues: { ":owner": ownerUserId },
        ExclusiveStartKey,
      })
    );
    programs.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return sortPrograms(programs);
}

// Seeded programmes carry an explicit `order`; PT-built ones sort after
// them, oldest first.
export function sortPrograms(programs) {
  return programs.sort(
    (a, b) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}

const LIMITS = { days: 7, exercisesPerDay: 30, sets: 20, restSeconds: 600, weeks: 52 };

function intInRange(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Validates a programme from the builder and normalises it into the stored
// shape the workout pages already understand. `existing` (when editing)
// lets days keep their dayIds, so logged sessions stay attached to them.
// Returns { program } or { error }.
export function normaliseProgramInput(body, existing = null) {
  const name = String(body?.name ?? "").trim();
  if (!name) return { error: "Programme name is required" };
  if (name.length > 100) return { error: "Programme name must be at most 100 characters" };

  const goal = String(body?.goal ?? "").trim().slice(0, 200) || null;

  const durationWeeks = intInRange(body?.durationWeeks, 1, LIMITS.weeks);
  if (!durationWeeks) return { error: `Duration must be 1–${LIMITS.weeks} weeks` };

  const rawDays = Array.isArray(body?.days) ? body.days : [];
  if (rawDays.length === 0) return { error: "Add at least one day" };
  if (rawDays.length > LIMITS.days) return { error: `A programme can have at most ${LIMITS.days} days` };

  const existingDayIds = new Set((existing?.days ?? []).map((d) => d.dayId));
  const days = [];

  for (const [dayIndex, rawDay] of rawDays.entries()) {
    const dayName = `Day ${dayIndex + 1}`;
    const rawExercises = Array.isArray(rawDay?.exercises) ? rawDay.exercises : [];
    if (rawExercises.length === 0) return { error: `${dayName} needs at least one exercise` };
    if (rawExercises.length > LIMITS.exercisesPerDay) {
      return { error: `${dayName} can have at most ${LIMITS.exercisesPerDay} exercises` };
    }

    const exercises = [];
    for (const [exerciseIndex, rawExercise] of rawExercises.entries()) {
      const exName = String(rawExercise?.name ?? "").trim();
      if (!exName) return { error: `${dayName}: every exercise needs a name` };

      const targetSets = intInRange(rawExercise.targetSets, 1, LIMITS.sets);
      if (!targetSets) return { error: `${dayName} · ${exName}: sets must be 1–${LIMITS.sets}` };

      const restSeconds = intInRange(rawExercise.restSeconds, 0, LIMITS.restSeconds);
      if (restSeconds === null) return { error: `${dayName} · ${exName}: rest must be 0–${LIMITS.restSeconds}s` };

      // Free text so ranges like "8-12" or "AMRAP" work; plain numbers stay numbers.
      const repsText = String(rawExercise.targetReps ?? "").trim().slice(0, 20);
      const targetReps = repsText === "" ? null : /^\d+$/.test(repsText) ? Number(repsText) : repsText;

      exercises.push({
        // Only unique within a day — same convention as seeded programmes.
        exerciseId: String(exerciseIndex),
        name: exName,
        // Media comes from the exercise library, matched by name at runtime.
        videoLink: null,
        order: exerciseIndex,
        targetSets,
        targetReps,
        restSeconds,
      });
    }

    const keepId = rawDay.dayId && existingDayIds.has(String(rawDay.dayId));
    days.push({
      dayId: keepId ? String(rawDay.dayId) : randomUUID().slice(0, 8),
      label: String(rawDay.label ?? "").trim().slice(0, 40) || dayName,
      subtitle: String(rawDay.subtitle ?? "").trim().slice(0, 100) || null,
      order: dayIndex,
      exercises,
    });
  }

  return { program: { name, goal, durationWeeks, days } };
}
