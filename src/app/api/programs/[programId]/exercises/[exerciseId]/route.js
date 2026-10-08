import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../../lib/users";
import { canAccessProgram, canChangeExercisesMidWorkout } from "../../../../../../lib/programs";
import { withLogging } from "../../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Persists a switched exercise back into the programme itself, so the swap
// is used every future time this day comes up (next week's workout for this
// day shows it) — not just for one session. `exerciseId` is only unique
// within a day (it's just that day's array index), so `dayId` must be given
// too to find the right slot.
//
// Only that one slot is written, and only if it still holds the exercise
// being switched from — so the switch can't be lost to, or undo, another
// change to the programme made around the same time.
export const PATCH = withLogging("PATCH /api/programs/[programId]/exercises/[exerciseId]", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId, exerciseId } = await params;
  const body = await request.json();
  const { dayId } = body;
  const name = body.name?.trim();

  if (!dayId || !name) {
    return NextResponse.json({ error: "dayId and name are required" }, { status: 400 });
  }

  // Strongly consistent, so the slot positions below are the current ones.
  const { Item: program } = await ddb.send(new GetCommand({ TableName: TABLES.programs, Key: { programId }, ConsistentRead: true }));
  if (!(await canAccessProgram(user, program))) return NextResponse.json({ error: "Program not found" }, { status: 404 });
  // Only on a programme the caller created and is running (never a
  // template, or a programme someone else built).
  if (!(await canChangeExercisesMidWorkout(user, program))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dayIndex = program.days.findIndex((d) => d.dayId === dayId);
  if (dayIndex === -1) return NextResponse.json({ error: "Day not found" }, { status: 404 });
  const exIndex = program.days[dayIndex].exercises.findIndex((e) => e.exerciseId === exerciseId);
  if (exIndex === -1) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  const oldName = program.days[dayIndex].exercises[exIndex].name;

  const slot = `#days[${dayIndex}].#exercises[${exIndex}]`;
  let updated;
  try {
    ({ Attributes: updated } = await ddb.send(
      new UpdateCommand({
        TableName: TABLES.programs,
        Key: { programId },
        // The old exercise's video link doesn't apply to the new one — its
        // media (if any) comes from the exercise library, matched by name.
        UpdateExpression: `SET ${slot}.#name = :name, ${slot}.#videoLink = :null, #updatedAt = :now`,
        ConditionExpression: `#days[${dayIndex}].#dayId = :dayId AND ${slot}.#exerciseId = :exerciseId AND ${slot}.#name = :oldName`,
        ExpressionAttributeNames: {
          "#days": "days",
          "#exercises": "exercises",
          "#name": "name",
          "#videoLink": "videoLink",
          "#dayId": "dayId",
          "#exerciseId": "exerciseId",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":name": name,
          ":null": null,
          ":now": new Date().toISOString(),
          ":dayId": dayId,
          ":exerciseId": exerciseId,
          ":oldName": oldName,
        },
        ReturnValues: "ALL_NEW",
      })
    ));
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "The programme was just changed — reload the page and switch again." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ program: updated, exercise: updated.days[dayIndex].exercises[exIndex] });
});
