import { NextResponse } from "next/server";
import { GetCommand, QueryCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { getUserId } from "../../../../../lib/verifyToken";

// scope "day" isn't handled here — restarting a single day just means
// navigating back into it, which needs no server change (a new session is
// simply added alongside the old one).
//
// scope "week" clears that week's logged sessions so its days go back to
// "Start" — the run stays active, on the same week.
//
// scope "program" ends the current run entirely (status -> "abandoned", so
// it's no longer picked up as the active run) without touching its logged
// sessions — the program page falls back to the pre-start screen ("Start
// program"/"Start again"), and a future run starts clean from week 1.
export async function POST(request, { params }) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const body = await request.json();
  const { scope, week } = body;
  if (scope !== "week" && scope !== "program") {
    return NextResponse.json({ error: "scope must be 'week' or 'program'" }, { status: 400 });
  }

  const runResult = await ddb.send(new GetCommand({ TableName: TABLES.runs, Key: { userId, runId } }));
  if (!runResult.Item) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (scope === "program") {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.runs,
        Key: { userId, runId },
        UpdateExpression: "SET #status = :abandoned",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":abandoned": "abandoned" },
      })
    );
    return NextResponse.json({ ok: true });
  }

  const targetWeek = week ?? runResult.Item.currentWeek;

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
}
