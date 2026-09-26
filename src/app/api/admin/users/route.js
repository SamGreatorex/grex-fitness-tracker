import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { requireRole } from "../../../../lib/users";
import { ROLES } from "../../../../lib/profile";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Every user, for the admin Users page. A full scan is fine at this app's
// scale; revisit (paginate on the client) if the user count grows large.
export const GET = withLogging("GET /api/admin/users", async (request) => {
  const { denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const users = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(new ScanCommand({ TableName: TABLES.users, ExclusiveStartKey }));
    users.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  users.sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
  return NextResponse.json({ users });
});
