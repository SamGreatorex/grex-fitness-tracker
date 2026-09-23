import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Hardcoded rather than read from AWS_REGION — see src/lib/dynamo.js for why
// that env var can't be relied on inside Amplify Hosting's SSR compute.
const REGION = "eu-west-2";
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
