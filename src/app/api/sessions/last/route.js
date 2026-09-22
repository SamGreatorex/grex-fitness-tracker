import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getUserId } from "../../../../lib/verifyToken";

export async function GET(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const programId = searchParams.get("programId");
  const dayId = searchParams.get("dayId");
  if (!programId || !dayId) {
    return NextResponse.json({ error: "programId and dayId are required" }, { status: 400 });
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      IndexName: "LastSessionByDayIndex",
      KeyConditionExpression: "programDayKey = :key",
      ExpressionAttributeValues: { ":key": `${userId}#${programId}#${dayId}` },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  const session = (result.Items || [])[0] || null;
  return NextResponse.json({ session });
}
