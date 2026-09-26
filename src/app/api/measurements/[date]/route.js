import { NextResponse } from "next/server";
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getUserId } from "../../../../lib/verifyToken";
import {
  DATE_PATTERN,
  MEASUREMENT_KEYS,
  MEASUREMENT_LABELS,
  MEASUREMENT_LIMITS_CM,
  WEIGHT_LIMITS_KG,
} from "../../../../lib/measurements";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

const round1 = (n) => Math.round(n * 10) / 10;

function parseOptional(value, { min, max }, label) {
  if (value === null || value === undefined || value === "") return { value: undefined };
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return { error: `${label} must be between ${min} and ${max}` };
  return { value: round1(n) };
}

// Keeps the profile's weightKg in step with the most recent weigh-in, so
// the profile always shows current weight.
async function syncProfileWeight(userId) {
  let latest;
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.measurements,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ScanIndexForward: false,
        ExclusiveStartKey,
      })
    );
    latest = page.Items?.find((e) => e.weightKg != null);
    ExclusiveStartKey = latest ? undefined : page.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  if (!latest) return null;
  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { userId },
      UpdateExpression: "SET weightKg = :w, updatedAt = :now",
      ConditionExpression: "attribute_exists(userId)",
      ExpressionAttributeValues: { ":w": latest.weightKg, ":now": new Date().toISOString() },
      ReturnValues: "ALL_NEW",
    })
  ).catch((err) => {
    if (err.name === "ConditionalCheckFailedException") return null;
    throw err;
  });
  return result?.Attributes ?? null;
}

// Creates or replaces the entry for this date: { weightKg, measurements:
// { waist: 80, ... } } — all metric, any subset, at least one value.
export const PUT = withLogging("PUT /api/measurements/[date]", async (request, { params }) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await params;
  if (!DATE_PATTERN.test(date)) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

  const body = await request.json();

  const weight = parseOptional(body.weightKg, WEIGHT_LIMITS_KG, "Weight (kg)");
  if (weight.error) return NextResponse.json({ error: weight.error }, { status: 400 });

  const measurements = {};
  for (const key of MEASUREMENT_KEYS) {
    const m = parseOptional(body.measurements?.[key], MEASUREMENT_LIMITS_CM, `${MEASUREMENT_LABELS[key]} (cm)`);
    if (m.error) return NextResponse.json({ error: m.error }, { status: 400 });
    if (m.value !== undefined) measurements[key] = m.value;
  }

  if (weight.value === undefined && Object.keys(measurements).length === 0) {
    return NextResponse.json({ error: "Enter your weight or at least one measurement" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const entry = {
    userId,
    date,
    weightKg: weight.value,
    measurements,
    createdAt: body.createdAt || now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.measurements, Item: entry }));

  const profile = await syncProfileWeight(userId);
  return NextResponse.json({ entry, profile });
});

export const DELETE = withLogging("DELETE /api/measurements/[date]", async (request, { params }) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await params;
  await ddb.send(new DeleteCommand({ TableName: TABLES.measurements, Key: { userId, date } }));

  const profile = await syncProfileWeight(userId);
  return NextResponse.json({ ok: true, profile });
});
