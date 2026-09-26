import { NextResponse } from "next/server";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";
import { getUserClaims } from "./verifyToken";
import { ROLES } from "./profile";

// Returns the caller's row from the users table, creating it (as a basic
// user, seeded with the name/email they signed up with) on first call.
// Returns null if the request isn't authenticated.
export async function getRequestUser(request) {
  const claims = await getUserClaims(request);
  if (!claims) return null;
  return getOrCreateUser(claims);
}

// For routes that should only be reachable by certain roles, e.g.
//   const { user, denied } = await requireRole(request, [ROLES.ADMIN]);
//   if (denied) return denied;
export async function requireRole(request, roles) {
  const user = await getRequestUser(request);
  if (!user) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!roles.includes(user.role)) return { denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

async function getOrCreateUser(claims) {
  const userId = claims.sub;
  const existing = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId } }));
  if (existing.Item) return existing.Item;

  const now = new Date().toISOString();
  const item = {
    userId,
    email: claims.email,
    name: claims.name || undefined,
    role: ROLES.BASIC,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLES.users,
        Item: item,
        ConditionExpression: "attribute_not_exists(userId)",
      })
    );
    return item;
  } catch (err) {
    // Two first requests raced (e.g. header + page both loading) — the
    // other one already created the row, so just read it back.
    if (err.name !== "ConditionalCheckFailedException") throw err;
    const created = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId } }));
    return created.Item;
  }
}
