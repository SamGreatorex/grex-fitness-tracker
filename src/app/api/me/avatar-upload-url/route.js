import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET } from "../../../../lib/s3";
import { getUserId } from "../../../../lib/verifyToken";
import { AVATAR_TYPES } from "../../../../lib/profile";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Presigned PUT for a new profile picture. The client uploads straight to
// S3, then saves the returned key via PATCH /api/me.
export const POST = withLogging("POST /api/me/avatar-upload-url", async (request) => {
  const userId = await getUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contentType } = await request.json();
  if (!AVATAR_TYPES.includes(contentType)) {
    return NextResponse.json({ error: `Unsupported file type: ${contentType}` }, { status: 400 });
  }

  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `avatars/${userId}/${Date.now()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );

  return NextResponse.json({ uploadUrl, key });
});
