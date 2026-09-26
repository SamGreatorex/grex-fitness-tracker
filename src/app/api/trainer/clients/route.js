import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { requireRole } from "../../../../lib/users";
import { PROGRAM_MANAGER_ROLES } from "../../../../lib/programs";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Only what a trainer needs — personal details like address stay admin-only.
const CLIENT_FIELDS = ["userId", "email", "name", "avatarUrl", "heightCm", "weightKg", "ptUserId"];

// For the signed-in PT (or admin acting as one):
//   clients   — users assigned to them (ptUserId = their userId)
//   available — users with no PT yet, who they can take on
// Users assigned to any other PT are never returned.
export const GET = withLogging("GET /api/trainer/clients", async (request) => {
  const { user: trainer, denied } = await requireRole(request, PROGRAM_MANAGER_ROLES);
  if (denied) return denied;

  const names = Object.fromEntries(CLIENT_FIELDS.map((f) => [`#${f}`, f]));
  const clients = [];
  const available = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.users,
        ProjectionExpression: Object.keys(names).join(", "),
        ExpressionAttributeNames: names,
        ExclusiveStartKey,
      })
    );
    for (const u of page.Items ?? []) {
      if (u.userId === trainer.userId) continue;
      if (u.ptUserId === trainer.userId) clients.push(u);
      else if (!u.ptUserId) available.push(u);
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const byName = (a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "");
  return NextResponse.json({ clients: clients.sort(byName), available: available.sort(byName) });
});
