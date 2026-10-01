import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getRequestUser } from "../../../../lib/users";
import { resolveSubjectUserId } from "../../../../lib/programs";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export const GET = withLogging("GET /api/sessions/[sessionId]", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?userId=X — one of a client's sessions, for their PT or an admin.
  const userId = await resolveSubjectUserId(user, new URL(request.url).searchParams.get("userId"));
  if (!userId) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const { sessionId } = await params;
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.sessions, Key: { userId, sessionId } })
  );

  if (!result.Item) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ session: result.Item });
});
