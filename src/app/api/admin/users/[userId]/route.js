import { NextResponse } from "next/server";
import { GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { requireRole } from "../../../../../lib/users";
import { ROLES } from "../../../../../lib/profile";
import { PROGRAM_MANAGER_ROLES } from "../../../../../lib/programs";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Clients of someone who's no longer a PT go back to the unassigned pool,
// so other PTs can pick them up.
async function releaseClientsOf(ptUserId) {
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.users,
        FilterExpression: "ptUserId = :pt",
        ExpressionAttributeValues: { ":pt": ptUserId },
        ProjectionExpression: "userId",
        ExclusiveStartKey,
      })
    );
    for (const { userId } of page.Items ?? []) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.users,
          Key: { userId },
          UpdateExpression: "REMOVE ptUserId, ptAssignedAt",
          ConditionExpression: "ptUserId = :pt",
          ExpressionAttributeValues: { ":pt": ptUserId },
        })
      ).catch((err) => {
        if (err.name !== "ConditionalCheckFailedException") throw err;
      });
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

// Admin edits to another user: { role } and/or { ptUserId } (a PT/admin's
// userId, or null to unassign). Admins can't change their own role, so the
// last admin can never accidentally lock everyone out of admin mode.
export const PATCH = withLogging("PATCH /api/admin/users/[userId]", async (request, { params }) => {
  const { user: admin, denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const { userId } = await params;
  const body = await request.json();

  const { Item: target } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId } }));
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const set = { updatedAt: new Date().toISOString() };
  const remove = [];

  if ("role" in body) {
    if (!Object.values(ROLES).includes(body.role)) {
      return NextResponse.json({ error: `role must be one of ${Object.values(ROLES).join(", ")}` }, { status: 400 });
    }
    if (userId === admin.userId && body.role !== target.role) {
      return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
    }
    set.role = body.role;
  }

  if ("ptUserId" in body) {
    if (body.ptUserId === null || body.ptUserId === "") {
      remove.push("ptUserId", "ptAssignedAt");
    } else {
      if (body.ptUserId === userId) return NextResponse.json({ error: "A user can't be their own PT." }, { status: 400 });
      const { Item: pt } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId: body.ptUserId } }));
      if (!pt || !PROGRAM_MANAGER_ROLES.includes(pt.role)) {
        return NextResponse.json({ error: "Assigned PT must be a PT or admin." }, { status: 400 });
      }
      if (body.ptUserId !== target.ptUserId) {
        set.ptUserId = body.ptUserId;
        set.ptAssignedAt = new Date().toISOString();
      }
    }
  }

  const names = {};
  const values = {};
  const setParts = Object.entries(set).map(([k, v]) => {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    return `#${k} = :${k}`;
  });
  const removeParts = remove.map((k) => {
    names[`#${k}`] = k;
    return `#${k}`;
  });

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { userId },
      UpdateExpression: `SET ${setParts.join(", ")}` + (removeParts.length ? ` REMOVE ${removeParts.join(", ")}` : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );

  const demoted = PROGRAM_MANAGER_ROLES.includes(target.role) && set.role && !PROGRAM_MANAGER_ROLES.includes(set.role);
  if (demoted) await releaseClientsOf(userId);

  return NextResponse.json({ user: result.Attributes, releasedClients: demoted });
});
