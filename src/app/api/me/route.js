import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { publicMediaUrl, deleteMediaObject } from "../../../lib/s3";
import { getRequestUser } from "../../../lib/users";
import { PROFILE_FIELDS } from "../../../lib/profile";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// The signed-in user's own profile (created on first call).
export const GET = withLogging("GET /api/me", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ user });
});

// Updates the user's own profile fields and/or avatar. `role`, `email` and
// `userId` are deliberately not accepted — roles are only changed in the DB.
export const PATCH = withLogging("PATCH /api/me", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const set = {};
  const remove = [];

  for (const [key, def] of Object.entries(PROFILE_FIELDS)) {
    if (!(key in body)) continue;
    const raw = body[key];

    if (raw === null || raw === "") {
      if (def.required) return NextResponse.json({ error: `${key} is required` }, { status: 400 });
      remove.push(key);
      continue;
    }

    if (def.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < def.min || n > def.max) {
        return NextResponse.json({ error: `${key} must be between ${def.min} and ${def.max}` }, { status: 400 });
      }
      set[key] = n;
    } else if (def.type === "enum") {
      if (!def.values.includes(raw)) {
        return NextResponse.json({ error: `${key} must be one of ${def.values.join(", ")}` }, { status: 400 });
      }
      set[key] = raw;
    } else {
      const s = String(raw).trim();
      if (!s && def.required) return NextResponse.json({ error: `${key} is required` }, { status: 400 });
      if (s.length > def.maxLength) {
        return NextResponse.json({ error: `${key} must be at most ${def.maxLength} characters` }, { status: 400 });
      }
      set[key] = s;
    }
  }

  let oldAvatarKey = null;
  if ("avatarKey" in body) {
    const key = body.avatarKey;
    if (key === null) {
      remove.push("avatarKey", "avatarUrl");
    } else if (typeof key !== "string" || !key.startsWith(`avatars/${user.userId}/`)) {
      // Only keys minted by /api/me/avatar-upload-url for this user.
      return NextResponse.json({ error: "Invalid avatarKey" }, { status: 400 });
    } else {
      set.avatarKey = key;
      set.avatarUrl = publicMediaUrl(key);
    }
    if (user.avatarKey && user.avatarKey !== key) oldAvatarKey = user.avatarKey;
  }

  set.updatedAt = new Date().toISOString();

  const names = {};
  const values = {};
  const setParts = Object.entries(set).map(([k, v]) => {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    return `#${k} = :${k}`;
  });
  const removeParts = remove.map((k) => {
    names[`#${k}`] = k;
    return `#${k}`;
  });

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.users,
      Key: { userId: user.userId },
      UpdateExpression:
        `SET ${setParts.join(", ")}` + (removeParts.length ? ` REMOVE ${removeParts.join(", ")}` : ""),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );

  if (oldAvatarKey) await deleteMediaObject(oldAvatarKey);

  return NextResponse.json({ user: result.Attributes });
});
