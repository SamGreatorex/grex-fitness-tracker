import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getUserId } from "../../../../lib/verifyToken";

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
