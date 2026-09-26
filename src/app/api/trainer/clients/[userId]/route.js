import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { requireRole } from "../../../../../lib/users";
import { PROGRAM_MANAGER_ROLES } from "../../../../../lib/programs";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

const CONFLICT = "This user already has a PT or doesn't exist.";

// Take on an unassigned user as a client. Conditional, so if two PTs click
// at the same moment only one gets them.
export const POST = withLogging("POST /api/trainer/clients/[userId]", async (request, { params }) => {
  const { user: trainer, denied } = await requireRole(request, PROGRAM_MANAGER_ROLES);
  if (denied) return denied;

  const { userId } = await params;
  if (userId === trainer.userId) {
    return NextResponse.json({ error: "You can't be your own client." }, { status: 400 });
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: { userId },
        UpdateExpression: "SET ptUserId = :pt, ptAssignedAt = :now",
        ConditionExpression: "attribute_exists(userId) AND attribute_not_exists(ptUserId)",
        ExpressionAttributeValues: { ":pt": trainer.userId, ":now": new Date().toISOString() },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: CONFLICT }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
});

// Release one of your own clients back to the unassigned pool. Their
// programmes stay theirs.
export const DELETE = withLogging("DELETE /api/trainer/clients/[userId]", async (request, { params }) => {
  const { user: trainer, denied } = await requireRole(request, PROGRAM_MANAGER_ROLES);
  if (denied) return denied;

  const { userId } = await params;
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.users,
        Key: { userId },
        UpdateExpression: "REMOVE ptUserId, ptAssignedAt",
        ConditionExpression: "ptUserId = :pt",
        ExpressionAttributeValues: { ":pt": trainer.userId },
      })
    );
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
    throw err;
  }
  return NextResponse.json({ ok: true });
});
