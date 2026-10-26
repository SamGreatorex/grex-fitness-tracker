import { NextResponse } from "next/server";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../lib/users";
import { getRunnableRun } from "../../../../../lib/programs";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// scope "day" isn't handled here — restarting a single day just means
// navigating back into it, which needs no server change (a new session is
// simply added alongside the old one).
//
// scope "week" clears that week's logged sessions so its days go back to
// "Start" — the run stays active, on the same week.
//
// scope "program" deletes the current run from the database, without
// touching its logged sessions (reports still use them) — the program page
// falls back to the pre-start screen, and a future run starts clean from
// week 1.
export const POST = withLogging("POST /api/runs/[runId]/restart", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const body = await request.json();
  // `userId`: a trainer acting on their client's run of a trainer-led programme.
  const { scope, week, userId: requestedUserId } = body;
  if (scope !== "week" && scope !== "program") {
    return NextResponse.json({ error: "scope must be 'week' or 'program'" }, { status: 400 });
  }

  const found = await getRunnableRun(user, requestedUserId, runId);
  if (!found) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const { userId, run } = found;

  if (scope === "program") {
    await ddb.send(new DeleteCommand({ TableName: TABLES.runs, Key: { userId, runId } }));
    return NextResponse.json({ ok: true });
  }

  const targetWeek = week ?? run.currentWeek;

  const sessionsResult = await ddb.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
    })
  );

  const toDelete = (sessionsResult.Items || []).filter(
    (s) => s.runId === runId && s.week === targetWeek
  );

  await Promise.all(
    toDelete.map((s) =>
      ddb.send(new DeleteCommand({ TableName: TABLES.sessions, Key: { userId, sessionId: s.sessionId } }))
    )
  );

  return NextResponse.json({ ok: true, deletedSessions: toDelete.length });
});
