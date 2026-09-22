import { NextResponse } from "next/server";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getUserId } from "../../../lib/verifyToken";

export async function GET(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.programs }));
  const programs = (result.Items || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return NextResponse.json({ programs });
}
