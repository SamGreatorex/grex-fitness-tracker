import { NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../../lib/users";
import { canAccessProgram, getProgram } from "../../../../../../lib/programs";
import { withLogging } from "../../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Persists a switched exercise back into the programme itself, so the swap
// is used every future time this day comes up — not just for one session.
// `exerciseId` is only unique within a day (it's just that day's array
// index), so `dayId` must be given too to find the right slot.
export const PATCH = withLogging("PATCH /api/programs/[programId]/exercises/[exerciseId]", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId, exerciseId } = await params;
  const body = await request.json();
  const { dayId, name } = body;

  if (!dayId || !name?.trim()) {
    return NextResponse.json({ error: "dayId and name are required" }, { status: 400 });
  }

  const program = await getProgram(programId);
  if (!(await canAccessProgram(user, program))) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const day = program.days.find((d) => d.dayId === dayId);
  if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  const exercise = day.exercises.find((e) => e.exerciseId === exerciseId);
  if (!exercise) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  exercise.name = name.trim();
  // The old exercise's video link doesn't apply to the new one — its media
  // (if any) comes from the exercise library, matched by name at runtime.
  exercise.videoLink = null;

  await ddb.send(new PutCommand({ TableName: TABLES.programs, Item: program }));

  return NextResponse.json({ program, exercise });
});
