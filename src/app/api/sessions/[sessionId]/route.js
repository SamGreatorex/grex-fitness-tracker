import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getUserId } from "../../../../lib/verifyToken";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.sessions, Key: { userId, sessionId } })
  );

  if (!result.Item) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ session: result.Item });
}
