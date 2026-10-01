import { randomUUID } from "crypto";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";
import { ROLES } from "./profile";
import { CARDIO_LIMITS, EXERCISE_TYPES, isCardio } from "./exerciseTypes";
import { PROGRAM_LEADS, isTrainerLed } from "./programLead";
import { slugify } from "./slugify";

// Programmes belong to exactly one user (ownerUserId). A PT can create and
// edit programmes only for their own clients (users whose ptUserId is the
// PT's userId); admins can for anyone. Everyone else only ever sees their
// own, and runs their own user-led ones — but can't change any programme
// their PT built (no renaming, editing, or adding/switching exercises).
// Trainer-led ones are run by the owner's PT (or an admin) and are
// view-only for the owner. Any user may also build programmes for
// themselves (always user-led); they can change and delete those, and
// their PT can too.
//
// Templates (isTemplate: true) have no owner: they're a library shared by
// every PT and admin, copied into a client's programme to start from. Only
// their creator (or an admin) may edit or delete one, and nobody runs them.
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
  if (program.isTemplate) return isProgramManager(user);
  return program.ownerUserId === user.userId || canManageUser(user, program.ownerUserId);
}

export function canEditTemplate(user, template) {
  return isProgramManager(user) && (user.role === ROLES.ADMIN || template.createdBy === user.userId);
}

// A programme the owner built for themselves (rather than their PT or an
// admin building it for them).
export function isSelfBuilt(program) {
  return !!program && !program.isTemplate && program.createdBy === program.ownerUserId;
}

// Whether `user` may edit, rename or delete this programme: a template's
// creator (or an admin), a client programme's PT (or an admin), or the
// owner of a programme they built themselves.
export async function canEditProgram(user, program) {
  if (program.isTemplate) return canEditTemplate(user, program);
  if (isSelfBuilt(program) && program.ownerUserId === user.userId) return true;
  return canManageUser(user, program.ownerUserId);
}

// Whether `user` may start, log workouts for, and restart runs of this
// programme: the owner for user-led ones; the owner's PT (or an admin) for
// trainer-led ones.
export async function canRunProgram(user, program) {
  if (!user || !program || program.isTemplate) return false;
  if (isTrainerLed(program)) return canManageUser(user, program.ownerUserId);
  return program.ownerUserId === user.userId;
}

// Runs and sessions are always stored under the programme owner's userId,
// whoever logged them. By default a request acts on the caller's own; a
// trainer passes `requestedUserId` to act on one of their clients'. Returns
// that userId, or null if the caller may not see that user's data.
export async function resolveSubjectUserId(user, requestedUserId) {
  if (!requestedUserId || requestedUserId === user.userId) return user.userId;
  return (await canManageUser(user, requestedUserId)) ? requestedUserId : null;
}

// Loads one of `requestedUserId`'s runs (default: the caller's) for a
// complete/restart action, checking the caller may drive its programme.
// Returns { userId, run }, or null if it's missing or not theirs to drive.
export async function getRunnableRun(user, requestedUserId, runId) {
  const userId = await resolveSubjectUserId(user, requestedUserId);
  if (!userId) return null;
  const { Item: run } = await ddb.send(new GetCommand({ TableName: TABLES.runs, Key: { userId, runId } }));
  if (!run) return null;
  const program = await getProgram(run.programId);
  // Programme since deleted: only its owner can still tidy up the run.
  if (!program) return userId === user.userId ? { userId, run } : null;
  return (await canRunProgram(user, program)) ? { userId, run } : null;
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

// Every template. They have no ownerUserId, so they aren't in OwnerIndex —
// scan for them instead (the programmes table is small).
export async function listTemplates() {
  const templates = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.programs,
        FilterExpression: "isTemplate = :t",
        ExpressionAttributeValues: { ":t": true },
        ExclusiveStartKey,
      })
    );
    templates.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

// Every programme and template (the programmes table is small).
export async function listAllPrograms() {
  const programs = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLES.programs, ExclusiveStartKey }));
    programs.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return sortPrograms(programs);
}

// Where a library exercise is used: one entry per programme day that has it
// (programme exercises are matched to the library by name, via its slug).
export function exerciseUsage(programs, exerciseSlug) {
  const usage = [];
  for (const program of programs) {
    for (const day of program.days ?? []) {
      if (day.exercises.some((e) => slugify(e.name) === exerciseSlug)) {
        usage.push({
          programId: program.programId,
          programName: program.name,
          isTemplate: !!program.isTemplate,
          ownerUserId: program.ownerUserId ?? null,
          dayLabel: day.label,
        });
      }
    }
  }
  return usage;
}

// Seeded programmes carry an explicit `order`; PT-built ones sort after
// them, oldest first.
export function sortPrograms(programs) {
  return programs.sort(
    (a, b) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
}

export const LIMITS = { days: 7, exercisesPerDay: 30, sets: 20, restSeconds: 600, weeks: 52, weightKg: 500 };

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

  const ledBy = body?.ledBy === PROGRAM_LEADS.TRAINER ? PROGRAM_LEADS.TRAINER : PROGRAM_LEADS.USER;

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

      // Cardio: one setting (free text, optional) + one total time. No sets,
      // reps, rest or weight.
      if (isCardio(rawExercise)) {
        const settings = String(rawExercise.settings ?? "").trim();
        if (settings.length > CARDIO_LIMITS.settingsLength) {
          return { error: `${dayName} · ${exName}: settings must be at most ${CARDIO_LIMITS.settingsLength} characters` };
        }
        const targetSeconds = intInRange(rawExercise.targetSeconds, 1, CARDIO_LIMITS.maxSeconds);
        if (!targetSeconds) return { error: `${dayName} · ${exName}: enter a time (up to 6 hours)` };
        exercises.push({
          exerciseId: String(exerciseIndex),
          name: exName,
          type: EXERCISE_TYPES.CARDIO,
          videoLink: null,
          order: exerciseIndex,
          settings: settings || null,
          targetSeconds,
        });
        continue;
      }

      const targetSets = intInRange(rawExercise.targetSets, 1, LIMITS.sets);
      if (!targetSets) return { error: `${dayName} · ${exName}: sets must be 1–${LIMITS.sets}` };

      const restSeconds = intInRange(rawExercise.restSeconds, 0, LIMITS.restSeconds);
      if (restSeconds === null) return { error: `${dayName} · ${exName}: rest must be 0–${LIMITS.restSeconds}s` };

      // Free text so ranges like "8-12" or "AMRAP" work; plain numbers stay numbers.
      const repsText = String(rawExercise.targetReps ?? "").trim().slice(0, 20);
      const targetReps = repsText === "" ? null : /^\d+$/.test(repsText) ? Number(repsText) : repsText;

      // Optional starting weight (kg) the trainer sets — prefills the first
      // time the client logs this exercise; after that their history wins.
      let targetWeight = null;
      if (rawExercise.targetWeight !== undefined && rawExercise.targetWeight !== null && rawExercise.targetWeight !== "") {
        targetWeight = Number(rawExercise.targetWeight);
        if (!Number.isFinite(targetWeight) || targetWeight < 0 || targetWeight > LIMITS.weightKg) {
          return { error: `${dayName} · ${exName}: start weight must be 0–${LIMITS.weightKg} kg` };
        }
        targetWeight = Math.round(targetWeight * 100) / 100;
      }

      exercises.push({
        // Only unique within a day — same convention as seeded programmes.
        exerciseId: String(exerciseIndex),
        name: exName,
        // Media comes from the exercise library, matched by name at runtime.
        videoLink: null,
        order: exerciseIndex,
        targetSets,
        targetReps,
        targetWeight,
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

  return { program: { name, goal, ledBy, durationWeeks, days } };
}
