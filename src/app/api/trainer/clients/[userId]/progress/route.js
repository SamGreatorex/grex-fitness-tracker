import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../../lib/dynamo";
import { requireRole } from "../../../../../../lib/users";
import { PROGRAM_MANAGER_ROLES, canManageUser, listProgramsForOwner } from "../../../../../../lib/programs";
import { withLogging } from "../../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

async function queryAllForUser(table, userId) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ExclusiveStartKey,
      })
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Everything a trainer needs to follow one client: their programmes, runs
// (where they are in each), logged workouts, and body measurements. Only
// for the client's own PT (or an admin) — anyone else gets "not found".
export const GET = withLogging("GET /api/trainer/clients/[userId]/progress", async (request, { params }) => {
  const { user: trainer, denied } = await requireRole(request, PROGRAM_MANAGER_ROLES);
  if (denied) return denied;

  const { userId } = await params;
  if (!(await canManageUser(trainer, userId))) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [programs, runs, sessions, measurements] = await Promise.all([
    listProgramsForOwner(userId),
    queryAllForUser(TABLES.runs, userId),
    queryAllForUser(TABLES.sessions, userId),
    queryAllForUser(TABLES.measurements, userId),
  ]);

  runs.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  sessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  measurements.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ programs, runs, sessions, measurements });
});
