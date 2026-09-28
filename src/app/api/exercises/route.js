import { NextResponse } from "next/server";
import { ScanCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { slugify } from "../../../lib/slugify";
import { getUserId } from "../../../lib/verifyToken";
import { deleteMediaObject, publicMediaUrl } from "../../../lib/s3";
import { withLogging } from "../../../lib/apiHandler";
import { EQUIPMENT_MAX_LENGTH, EXERCISE_LOCATIONS, EXERCISE_TYPES, isCardio } from "../../../lib/exerciseTypes";
import { TEXT_LIMITS, numberSteps } from "../../../lib/exerciseText";
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
  const { name, type, primaryTags = [], secondaryTags = [], stabilizerTags = [], mediaType, mediaKey } = body;
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Description/instructions are optional in the request: when omitted
  // (e.g. an older client) the stored values are kept.
  let description;
  if ("description" in body) {
    description = String(body.description ?? "").trim();
    if (description.length > TEXT_LIMITS.description) {
      return NextResponse.json({ error: `Description must be at most ${TEXT_LIMITS.description} characters` }, { status: 400 });
    }
    description = description || null;
  }
  // Equipment/location are optional in the request too — omitted means keep.
  let equipment;
  if ("equipment" in body) {
    equipment = String(body.equipment ?? "").trim();
    if (equipment.length > EQUIPMENT_MAX_LENGTH) {
      return NextResponse.json({ error: `Equipment must be at most ${EQUIPMENT_MAX_LENGTH} characters` }, { status: 400 });
    }
    equipment = equipment || null;
  }
  let location;
  if ("location" in body) {
    if (!Array.isArray(body.location) || body.location.some((l) => !EXERCISE_LOCATIONS.includes(l))) {
      return NextResponse.json({ error: `location must be a list of: ${EXERCISE_LOCATIONS.join(", ")}` }, { status: 400 });
    }
    location = EXERCISE_LOCATIONS.filter((l) => body.location.includes(l));
  }

  let instructions;
  if ("instructions" in body) {
    if (!Array.isArray(body.instructions)) {
      return NextResponse.json({ error: "instructions must be a list of steps" }, { status: 400 });
    }
    instructions = numberSteps(body.instructions.map((s) => String(s ?? "")));
    if (instructions.length > TEXT_LIMITS.steps) {
      return NextResponse.json({ error: `At most ${TEXT_LIMITS.steps} instruction steps` }, { status: 400 });
    }
    if (instructions.some((s) => s.length > TEXT_LIMITS.stepLength + 4)) {
      return NextResponse.json({ error: `Each step must be at most ${TEXT_LIMITS.stepLength} characters` }, { status: 400 });
    }
  }


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
    // Strength (sets × reps × weight) or cardio (one setting + total time).
    type: isCardio(type) ? EXERCISE_TYPES.CARDIO : EXERCISE_TYPES.STRENGTH,
    primaryTags: cleanPrimaryTags,
    secondaryTags: cleanSecondaryTags,
    stabilizerTags: cleanStabilizerTags,
    mediaType: mediaType ?? existing.Item?.mediaType ?? null,
    mediaKey: finalMediaKey,
    mediaUrl: finalMediaKey ? publicMediaUrl(finalMediaKey) : null,
    // Edited in the admin dialog; each is kept as-is if the request leaves it out.
    description: description !== undefined ? description : existing.Item?.description,
    instructions: instructions !== undefined ? instructions : existing.Item?.instructions,
    equipment: equipment !== undefined ? equipment : existing.Item?.equipment,
    location: location !== undefined ? location : existing.Item?.location,
    createdAt: existing.Item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLES.exercises, Item: exercise }));

  return NextResponse.json({ exercise }, { status: 201 });
});
