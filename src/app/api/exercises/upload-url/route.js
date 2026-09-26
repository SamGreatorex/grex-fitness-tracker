import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, BUCKET, publicMediaUrl } from "../../../../lib/s3";
import { slugify } from "../../../../lib/slugify";
import { withLogging } from "../../../../lib/apiHandler";
import { requireRole } from "../../../../lib/users";
import { ROLES } from "../../../../lib/profile";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export const POST = withLogging("POST /api/exercises/upload-url", async (request) => {
  // Managing the exercise library is admin-only (reading it is not — see GET).
  const { denied } = await requireRole(request, [ROLES.ADMIN]);
  if (denied) return denied;

  const { name, contentType } = await request.json();
  if (!name || !contentType) {
    return NextResponse.json({ error: "name and contentType are required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: `Unsupported file type: ${contentType}` }, { status: 400 });
  }

  const mediaType = contentType.startsWith("video/") ? "video" : "image";
  const ext = contentType.split("/")[1].replace("quicktime", "mov");
  const key = `exercises/${slugify(name)}-${Date.now()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 }
  );

  return NextResponse.json({ uploadUrl, key, mediaType, publicUrl: publicMediaUrl(key) });
});
