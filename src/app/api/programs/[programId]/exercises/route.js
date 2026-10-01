import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../lib/users";
import { LIMITS, canAccessProgram, canEditProgram, getProgram } from "../../../../../lib/programs";
import { EXERCISE_TYPES } from "../../../../../lib/exerciseTypes";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// What a newly added exercise starts with. Whoever's running the workout
// adjusts the sets they actually do; the PT (or the owner, for a programme
// they built) can fine-tune the targets in the builder later.
const NEW_STRENGTH = { targetSets: 3, targetReps: 10, targetWeight: null, restSeconds: 60 };
const NEW_CARDIO_SECONDS = 10 * 60;

// Adds an exercise to the end of one day mid-workout: { dayId, name, type }.
// Like switching, it's saved into the programme itself, so it's there every
// future time this day comes up. Appended atomically, so adding several in
// quick succession can't lose any.
export const POST = withLogging("POST /api/programs/[programId]/exercises", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { dayId, name, type } = await request.json();
  if (!dayId || !name?.trim()) {
    return NextResponse.json({ error: "dayId and name are required" }, { status: 400 });
  }

  const program = await getProgram(programId);
  if (!(await canAccessProgram(user, program))) return NextResponse.json({ error: "Program not found" }, { status: 404 });
  // Templates are only changed from the builder. Owners can only change
  // programmes they built themselves, not ones their PT built.
  if (program.isTemplate || !(await canEditProgram(user, program))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dayIndex = program.days.findIndex((d) => d.dayId === dayId);
  if (dayIndex === -1) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  const base = {
    // Random rather than the next index: only needs to be unique within the
    // day, and two quick adds can't then collide.
    exerciseId: randomUUID().slice(0, 8),
    name: name.trim(),
    // Media comes from the exercise library, matched by name at runtime.
    videoLink: null,
    order: program.days[dayIndex].exercises.length,
  };
  const exercise =
    type === EXERCISE_TYPES.CARDIO
      ? { ...base, type: EXERCISE_TYPES.CARDIO, settings: null, targetSeconds: NEW_CARDIO_SECONDS }
      : { ...base, ...NEW_STRENGTH };

  const day = `#days[${dayIndex}]`;
  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLES.programs,
        Key: { programId },
        UpdateExpression: `SET ${day}.#exercises = list_append(${day}.#exercises, :new), #updatedAt = :now`,
        // The day must still be at that position (the builder may have
        // reordered days since we read it) and have room left.
        ConditionExpression: `${day}.#dayId = :dayId AND size(${day}.#exercises) < :max`,
        ExpressionAttributeNames: { "#days": "days", "#exercises": "exercises", "#dayId": "dayId", "#updatedAt": "updatedAt" },
        ExpressionAttributeValues: {
          ":new": [exercise],
          ":now": new Date().toISOString(),
          ":dayId": dayId,
          ":max": LIMITS.exercisesPerDay,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return NextResponse.json({ program: result.Attributes, exercise }, { status: 201 });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        { error: `Couldn't add it — a day can have at most ${LIMITS.exercisesPerDay} exercises, or the programme was just changed. Reload and try again.` },
        { status: 409 }
      );
    }
    throw err;
  }
});
