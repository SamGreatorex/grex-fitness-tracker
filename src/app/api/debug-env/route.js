import { NextResponse } from "next/server";

// TEMPORARY — for diagnosing why server-only env vars aren't reaching the
// deployed compute runtime. No secrets here (table/bucket names only).
// Delete this route once the env var issue is resolved.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    DYNAMODB_TABLE_PROGRAMS: process.env.DYNAMODB_TABLE_PROGRAMS ?? null,
    DYNAMODB_TABLE_RUNS: process.env.DYNAMODB_TABLE_RUNS ?? null,
    DYNAMODB_TABLE_SESSIONS: process.env.DYNAMODB_TABLE_SESSIONS ?? null,
    DYNAMODB_TABLE_EXERCISES: process.env.DYNAMODB_TABLE_EXERCISES ?? null,
    S3_EXERCISE_MEDIA_BUCKET: process.env.S3_EXERCISE_MEDIA_BUCKET ?? null,
    AWS_REGION: process.env.AWS_REGION ?? null,
    NODE_ENV: process.env.NODE_ENV ?? null,
  });
}
