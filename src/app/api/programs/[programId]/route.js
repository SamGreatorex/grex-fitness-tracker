import { NextResponse } from "next/server";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getUserId } from "../../../../lib/verifyToken";

export async function GET(request, { params }) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const result = await ddb.send(
    new GetCommand({ TableName: TABLES.programs, Key: { programId } })
  );

  if (!result.Item) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  return NextResponse.json({ program: result.Item });
}

export async function PATCH(request, { params }) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const result = await ddb.send(
      new UpdateCommand({
        TableName: TABLES.programs,
        Key: { programId },
        UpdateExpression: "SET #name = :name",
        ConditionExpression: "attribute_exists(programId)",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name.trim() },
        ReturnValues: "ALL_NEW",
      })
    );
    return NextResponse.json({ program: result.Attributes });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }
    throw err;
  }
}
