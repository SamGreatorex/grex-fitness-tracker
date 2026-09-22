import { NextResponse } from "next/server";
import { ScanCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { slugify } from "../../../lib/slugify";
import { getUserId } from "../../../lib/verifyToken";
import { deleteMediaObject, publicMediaUrl } from "../../../lib/s3";

export async function GET(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await ddb.send(new ScanCommand({ TableName: TABLES.exercises }));
  const exercises = (result.Items || []).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ exercises });
}

export async function POST(request) {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, tags = [], mediaType, mediaKey } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const exerciseId = slugify(name);
  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : [];

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
    tags: cleanTags,
    mediaType: mediaType ?? existing.Item?.mediaType ?? null,
    mediaKey: finalMediaKey,
    mediaUrl: finalMediaKey ? publicMediaUrl(finalMediaKey) : null,
    createdAt: existing.Item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.exercises, Item: exercise }));

  return NextResponse.json({ exercise }, { status: 201 });
}
