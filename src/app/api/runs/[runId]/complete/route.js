import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../lib/users";
import { getRunnableRun } from "../../../../../lib/programs";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Manual "Complete week" / "Complete program" actions — an explicit way to
// move on even if not every day this week (or every week) was logged.
// scope "week" advances currentWeek by one (marking the run completed too
// if that was the last week), mirroring the automatic advance that happens
// when the last day of a week is finished. scope "program" marks the run
// completed outright, regardless of which week it's on.
export const POST = withLogging("POST /api/runs/[runId]/complete", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  // `userId`: a trainer acting on their client's run of a trainer-led programme.
  const { scope, userId: requestedUserId } = await request.json();
  if (scope !== "week" && scope !== "program") {
    return NextResponse.json({ error: "scope must be 'week' or 'program'" }, { status: 400 });
  }

  const found = await getRunnableRun(user, requestedUserId, runId);
  if (!found) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  const { userId, run } = found;

  const completedAt = new Date().toISOString();

  if (scope === "program") {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.runs,
        Key: { userId, runId },
        UpdateExpression: "SET #status = :completed, completedAt = :completedAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":completed": "completed", ":completedAt": completedAt },
      })
    );
    return NextResponse.json({ ok: true, status: "completed" });
  }

  const nextWeek = run.currentWeek + 1;
  const finished = nextWeek > run.durationWeeks;

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

  return NextResponse.json({ ok: true, currentWeek: nextWeek, finished });
});
