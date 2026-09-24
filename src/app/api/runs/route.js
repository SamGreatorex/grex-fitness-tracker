import { NextResponse } from "next/server";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getUserId } from "../../../lib/verifyToken";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export const GET = withLogging("GET /api/runs", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("programId");

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.runs,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    })
  );

  let runs = result.Items || [];
  if (programId) runs = runs.filter((r) => r.programId === programId);
  runs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  return NextResponse.json({ runs });
});

export const POST = withLogging("POST /api/runs", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { programId, programName, durationWeeks = 4 } = body;
  if (!programId || !programName) {
    return NextResponse.json({ error: "programId and programName are required" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const run = {
    userId,
    runId: `${programId}#${startedAt}`,
    programId,
    programName,
    durationWeeks,
    status: "active",
    currentWeek: 1,
    startedAt,
    completedAt: null,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.runs, Item: run }));

  return NextResponse.json({ run }, { status: 201 });
});
