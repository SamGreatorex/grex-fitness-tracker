import { NextResponse } from "next/server";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getUserId } from "../../../lib/verifyToken";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    })
  );

  let sessions = result.Items || [];
  if (runId) sessions = sessions.filter((s) => s.runId === runId);
  sessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  return NextResponse.json({ sessions });
}

export async function POST(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    runId,
    programId,
    dayId,
    dayName,
    week,
    startedAt,
    durationSeconds,
    exercises,
    dayOrder,
    totalDaysInProgram,
    durationWeeks = 4,
  } = body;

  if (!runId || !programId || !dayId || !week || !exercises) {
    return NextResponse.json({ error: "Missing required session fields" }, { status: 400 });
  }

  const completedAt = new Date().toISOString();
  const totalWeightLifted = exercises.reduce((sum, ex) => {
    return sum + ex.sets.reduce((s, set) => s + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
  }, 0);

  const session = {
    userId,
    sessionId: `${runId}#w${week}#${dayId}#${completedAt}`,
    programDayKey: `${userId}#${programId}#${dayId}`,
    runId,
    programId,
    dayId,
    dayName,
    week,
    startedAt,
    completedAt,
    durationSeconds,
    totalWeightLifted,
    exercises,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.sessions, Item: session }));

  // Advance the run: only bump the week once the last day of the program (by order) is done.
  const isLastDayOfWeek = typeof dayOrder === "number" && dayOrder === totalDaysInProgram - 1;
  if (isLastDayOfWeek) {
    const nextWeek = week + 1;
    const finished = nextWeek > durationWeeks;

    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.runs,
        Key: { userId, runId },
        UpdateExpression: finished
          ? "SET currentWeek = :nextWeek, #status = :completed, completedAt = :completedAt"
          : "SET currentWeek = :nextWeek",
        ExpressionAttributeNames: finished ? { "#status": "status" } : undefined,
        ExpressionAttributeValues: finished
          ? { ":nextWeek": nextWeek, ":completed": "completed", ":completedAt": completedAt }
          : { ":nextWeek": nextWeek },
      })
    );
  }

  return NextResponse.json({ session }, { status: 201 });
}
