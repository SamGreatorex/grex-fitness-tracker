import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const REGION = process.env.AWS_REGION || "eu-west-2";
export const BUCKET = process.env.S3_EXERCISE_MEDIA_BUCKET;

export const s3 = new S3Client({ region: REGION });

export function publicMediaUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function deleteMediaObject(key) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // Best-effort cleanup — an orphaned S3 object isn't worth failing the request over.
  }
}
