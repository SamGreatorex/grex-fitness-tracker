import { NextResponse } from "next/server";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { deleteMediaObject } from "../../../../lib/s3";
import { withLogging } from "../../../../lib/apiHandler";
import { requireRole } from "../../../../lib/users";
import { ROLES } from "../../../../lib/profile";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export const DELETE = withLogging("DELETE /api/exercises/[exerciseId]", async (request, { params }) => {
  // Managing the exercise library is admin-only (reading it is not — see GET).
  const { denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const { exerciseId } = await params;

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLES.exercises, Key: { exerciseId } })
  );
  if (existing.Item?.mediaKey) {
    await deleteMediaObject(existing.Item.mediaKey);
  }

  await ddb.send(new DeleteCommand({ TableName: TABLES.exercises, Key: { exerciseId } }));

  return NextResponse.json({ ok: true });
});
