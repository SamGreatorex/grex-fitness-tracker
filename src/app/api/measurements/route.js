import { NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getUserId } from "../../../lib/verifyToken";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// The caller's body weight/measurement entries, oldest first.
export const GET = withLogging("GET /api/measurements", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.measurements,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ExclusiveStartKey,
      })
    );
    entries.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return NextResponse.json({ entries });
});
