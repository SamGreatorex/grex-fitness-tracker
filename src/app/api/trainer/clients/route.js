import { NextResponse } from "next/server";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { requireRole } from "../../../../lib/users";
import { PROGRAM_MANAGER_ROLES } from "../../../../lib/programs";
import { ROLES } from "../../../../lib/profile";
import { withLogging } from "../../../../lib/apiHandler";
import { accessFor } from "../../../../lib/billing";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Only what a trainer needs — personal details like address stay admin-only.
// (role and subscription are read to check the Pro plan, not returned.)
const CLIENT_FIELDS = ["userId", "email", "name", "avatarUrl", "heightCm", "weightKg", "ptUserId"];
const CHECK_FIELDS = ["role", "subscription"];

// For the signed-in PT (or admin acting as one):
//   clients   — users assigned to them (ptUserId = their userId)
//   available — users with no PT yet, who they can take on
// Users assigned to any other PT are never returned. Admins also see
// themselves, so they can be their own trainer; PTs never do.
export const GET = withLogging("GET /api/trainer/clients", async (request) => {
  const { user: trainer, denied } = await requireRole(request, PROGRAM_MANAGER_ROLES);
  if (denied) return denied;

  const names = Object.fromEntries([...CLIENT_FIELDS, ...CHECK_FIELDS].map((f) => [`#${f}`, f]));
  const pick = (u) => Object.fromEntries(CLIENT_FIELDS.filter((f) => u[f] !== undefined).map((f) => [f, u[f]]));
  const skip = (u) => u.userId === trainer.userId && trainer.role !== ROLES.ADMIN;

  // Their clients, straight from PtIndex.
  const clients = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.users,
        IndexName: "PtIndex",
        KeyConditionExpression: "#ptUserId = :me",
        ExpressionAttributeValues: { ":me": trainer.userId },
        ProjectionExpression: Object.keys(names).join(", "),
        ExpressionAttributeNames: names,
        ExclusiveStartKey,
      })
    );
    for (const u of page.Items ?? []) if (!skip(u)) clients.push(pick(u));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  // Unassigned users aren't in PtIndex (it's sparse), so these still need a scan.
  const available = [];
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.users,
        FilterExpression: "attribute_not_exists(#ptUserId)",
        ProjectionExpression: Object.keys(names).join(", "),
        ExpressionAttributeNames: names,
        ExclusiveStartKey,
      })
    );
    for (const u of page.Items ?? []) {
      // A personal trainer comes with the Pro plan — only Pro users can be taken on.
      if (!skip(u) && accessFor(u).canUseTrainer) available.push(pick(u));
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const byName = (a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "");
  return NextResponse.json({ clients: clients.sort(byName), available: available.sort(byName) });
});
