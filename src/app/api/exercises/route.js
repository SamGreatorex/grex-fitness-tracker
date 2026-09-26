import { NextResponse } from "next/server";
import { ScanCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { slugify } from "../../../lib/slugify";
import { getUserId } from "../../../lib/verifyToken";
import { deleteMediaObject, publicMediaUrl } from "../../../lib/s3";
import { withLogging } from "../../../lib/apiHandler";
import { requireRole } from "../../../lib/users";
import { ROLES } from "../../../lib/profile";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

export const GET = withLogging("GET /api/exercises", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.exercises }));
  const exercises = (result.Items || []).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ exercises });
});

export const POST = withLogging("POST /api/exercises", async (request) => {
  // Managing the exercise library is admin-only (reading it is not — see GET).
  const { denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const body = await request.json();
  const { name, primaryTags = [], secondaryTags = [], stabilizerTags = [], mediaType, mediaKey, defaultWeight, defaultReps } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const toNumberOrNull = (value) => (value !== "" && value != null ? Number(value) : null);

  const exerciseId = slugify(name);
  const cleanList = (list) =>
    Array.isArray(list) ? list.map((t) => String(t).trim()).filter(Boolean) : [];
  // Each body area belongs to at most one tier — primary wins over secondary, which wins over stabilizer.
  const cleanPrimaryTags = cleanList(primaryTags);
  const cleanSecondaryTags = cleanList(secondaryTags).filter((t) => !cleanPrimaryTags.includes(t));
  const cleanStabilizerTags = cleanList(stabilizerTags).filter(
    (t) => !cleanPrimaryTags.includes(t) && !cleanSecondaryTags.includes(t)
  );

  const existing = await ddb.send(
    new GetCommand({ TableName: TABLES.exercises, Key: { exerciseId } })
  );

  // Replacing an exercise's media orphans the old S3 object — clean it up.
  if (existing.Item?.mediaKey && mediaKey && existing.Item.mediaKey !== mediaKey) {
    await deleteMediaObject(existing.Item.mediaKey);
  }

  const finalMediaKey = mediaKey ?? existing.Item?.mediaKey ?? null;

  const exercise = {
    exerciseId,
    name,
    primaryTags: cleanPrimaryTags,
    secondaryTags: cleanSecondaryTags,
    stabilizerTags: cleanStabilizerTags,
    mediaType: mediaType ?? existing.Item?.mediaType ?? null,
    mediaKey: finalMediaKey,
    mediaUrl: finalMediaKey ? publicMediaUrl(finalMediaKey) : null,
    // Only used to prefill weight/reps the very first time this exercise is
    // logged in a programme — once there's real history, that always wins.
    defaultWeight: toNumberOrNull(defaultWeight),
    defaultReps: toNumberOrNull(defaultReps),
    createdAt: existing.Item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.exercises, Item: exercise }));

  return NextResponse.json({ exercise }, { status: 201 });
});
