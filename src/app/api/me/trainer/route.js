import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getRequestUser } from "../../../../lib/users";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// The signed-in user's own PT (or { trainer: null } if they don't have one).
// Only their display name and picture — not their email or anything else —
// plus their userId and whether they can be messaged (for the chat link).
// Read fresh here rather than from the client's cached profile, so a PT
// assigned since sign-in shows up straight away.
export const GET = withLogging("GET /api/me/trainer", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.ptUserId) return NextResponse.json({ trainer: null });

  const { Item: pt } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId: user.ptUserId } }));
  if (!pt) return NextResponse.json({ trainer: null });

  const isSelf = pt.userId === user.userId;
  return NextResponse.json({
    trainer: {
      userId: pt.userId,
      name: pt.name?.trim() || null,
      avatarUrl: pt.avatarUrl ?? null,
      isSelf,
      // An admin who is their own trainer has nobody to message; and chat
      // needs its table configured.
      canMessage: !isSelf && !!TABLES.chat,
    },
  });
});
