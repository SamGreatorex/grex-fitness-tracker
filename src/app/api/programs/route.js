import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getUserId } from "../../../lib/verifyToken";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export const GET = withLogging("GET /api/programs", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.programs }));
  const programs = (result.Items || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return NextResponse.json({ programs });
});
