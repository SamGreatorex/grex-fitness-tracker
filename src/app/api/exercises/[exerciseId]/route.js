import { NextResponse } from "next/server";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { deleteMediaObject } from "../../../../lib/s3";
import { withLogging } from "../../../../lib/apiHandler";
import { requireRole } from "../../../../lib/users";
import { ROLES } from "../../../../lib/profile";
import { slugify } from "../../../../lib/slugify";
import { isCardio } from "../../../../lib/exerciseTypes";
import { exerciseUsage, listAllPrograms } from "../../../../lib/programs";
import { exerciseNoteKey } from "../../../../lib/exerciseNotes";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

async function getExercise(exerciseId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLES.exercises, Key: { exerciseId } }));
  return Item ?? null;
}

// Swaps every use of `slug` in this programme for `replacement`, keeping
// each slot's sets/reps/rest (or time) as they were. Only saved if nobody
// changed the programme since it was read.
async function switchInProgram(program, slug, replacement) {
  const days = program.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((e) =>
      // Media comes from the library by name, so the old link doesn't apply.
      slugify(e.name) === slug ? { ...e, name: replacement.name, videoLink: null } : e
    ),
  }));

  // Personal notes are keyed by day + exercise name, so move each one over
  // to the replacement (unless that day already has a note for it).
  let exerciseNotes = program.exerciseNotes;
  if (exerciseNotes) {
    exerciseNotes = { ...exerciseNotes };
    for (const day of program.days) {
      // `slug` is already slugified; slugifying it again leaves it as is.
      const from = exerciseNoteKey(day.dayId, slug);
      const to = exerciseNoteKey(day.dayId, replacement.name);
      if (exerciseNotes[from] && !exerciseNotes[to]) exerciseNotes[to] = exerciseNotes[from];
      delete exerciseNotes[from];
    }
  }

  await ddb.send(
    new PutCommand({
      TableName: TABLES.programs,
      Item: { ...program, days, ...(exerciseNotes && { exerciseNotes }), updatedAt: new Date().toISOString() },
      // Seeded programmes may never have been updated.
      ConditionExpression: program.updatedAt ? "#updatedAt = :prev" : "attribute_not_exists(#updatedAt)",
      ExpressionAttributeNames: { "#updatedAt": "updatedAt" },
      ...(program.updatedAt && { ExpressionAttributeValues: { ":prev": program.updatedAt } }),
    })
  );
}

// Deletes a library exercise. If any programme or template uses it, a
// replacement must be given (?replaceWith=<exerciseId>, same type — cardio
// for cardio, strength for strength): it's switched in everywhere first, so
// no programme is left pointing at an exercise that no longer exists.
// Without one, responds 409 with `usage` listing where it's used.
export const DELETE = withLogging("DELETE /api/exercises/[exerciseId]", async (request, { params }) => {
  // Managing the exercise library is admin-only (reading it is not — see GET).
  const { denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const { exerciseId } = await params;
  const replaceWith = new URL(request.url).searchParams.get("replaceWith");

  const existing = await getExercise(exerciseId);
  if (!existing) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  const slug = slugify(existing.name);
  const programs = await listAllPrograms();
  const usage = exerciseUsage(programs, slug);

  if (usage.length > 0) {
    if (!replaceWith) {
      return NextResponse.json(
        { error: `"${existing.name}" is used in programmes — pick an exercise to switch it to before deleting.`, usage },
        { status: 409 }
      );
    }
    if (replaceWith === exerciseId) {
      return NextResponse.json({ error: "Pick a different exercise to switch to." }, { status: 400 });
    }
    const replacement = await getExercise(replaceWith);
    if (!replacement) return NextResponse.json({ error: "Replacement exercise not found" }, { status: 400 });
    if (isCardio(replacement) !== isCardio(existing)) {
      return NextResponse.json(
        { error: `Pick a ${isCardio(existing) ? "cardio" : "strength"} exercise to switch to — the programmes' targets are set up for that.` },
        { status: 400 }
      );
    }

    const affectedIds = new Set(usage.map((u) => u.programId));
    for (const program of programs.filter((p) => affectedIds.has(p.programId))) {
      try {
        await switchInProgram(program, slug, replacement);
      } catch (err) {
        if (err.name === "ConditionalCheckFailedException") {
          // Safe to retry: programmes already switched simply won't match again.
          return NextResponse.json(
            { error: `"${program.name}" was changed while switching — nothing has been deleted. Try again.` },
            { status: 409 }
          );
        }
        throw err;
      }
    }
  }

  if (existing.mediaKey) {
    await deleteMediaObject(existing.mediaKey);
  }

  await ddb.send(new DeleteCommand({ TableName: TABLES.exercises, Key: { exerciseId } }));

  return NextResponse.json({ ok: true, switchedProgrammes: new Set(usage.map((u) => u.programId)).size });
});
