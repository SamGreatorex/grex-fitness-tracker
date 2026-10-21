import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
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
      if (u.userId === trainer.userId && trainer.role !== ROLES.ADMIN) continue;
      if (u.ptUserId === trainer.userId) clients.push(pick(u));
      // A personal trainer comes with the Pro plan — only Pro users can be taken on.
      else if (!u.ptUserId && accessFor(u).canUseTrainer) available.push(pick(u));
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  const byName = (a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || "");
  return NextResponse.json({ clients: clients.sort(byName), available: available.sort(byName) });
});
