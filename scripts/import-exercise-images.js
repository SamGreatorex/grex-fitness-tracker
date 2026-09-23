#!/usr/bin/env node
// Uploads a folder (or zip) of exercise images to S3 and links each one to
// the matching Exercises table item. Filenames must be the exerciseId
// (i.e. slugify(name)) plus an image extension, e.g. "dumbbell-goblet-squat.png".
// Replacing an exercise's existing media orphans the old S3 object, so the
// old one is deleted. Files with no matching exerciseId are skipped.
//
//   node --env-file=.env.local scripts/import-exercise-images.js ~/Downloads/exercise-images.zip
//   node --env-file=.env.local scripts/import-exercise-images.js ~/Downloads/exercise-images.zip --dry-run

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const REGION = process.env.AWS_REGION || "eu-west-2";
const TABLE = process.env.DYNAMODB_TABLE_EXERCISES || "grex-fitness-tracker-exercises";
const BUCKET = process.env.S3_EXERCISE_MEDIA_BUCKET;

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function publicMediaUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

function resolvePath(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const inputArg = args.find((a) => !a.startsWith("--"));

  if (!inputArg) {
    console.error("Usage: node scripts/import-exercise-images.js <path-to-zip-or-folder> [--dry-run]");
    process.exit(1);
  }
  if (!dryRun && !BUCKET) {
    console.error("S3_EXERCISE_MEDIA_BUCKET is not set.");
    process.exit(1);
  }

  const inputPath = resolvePath(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Not found: ${inputPath}`);
    process.exit(1);
  }

  let dir = inputPath;
  if (inputPath.toLowerCase().endsWith(".zip")) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "exercise-images-"));
    execSync(`unzip -o -q "${inputPath}" -d "${dir}"`);
  }

  const files = fs.readdirSync(dir).filter((f) => CONTENT_TYPES[path.extname(f).toLowerCase()]);
  if (files.length === 0) {
    console.error(`No image files found in ${dir}`);
    process.exit(1);
  }

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  const s3 = new S3Client({ region: REGION });

  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const exerciseId = path.basename(file, ext);
    const contentType = CONTENT_TYPES[ext];

    const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { exerciseId } }));
    if (!existing.Item) {
      skipped++;
      console.log(`Skipped ${file} — no exercise "${exerciseId}" in ${TABLE}`);
      continue;
    }

    if (dryRun) {
      uploaded++;
      console.log(`[dry-run] Would upload ${file} -> ${exerciseId} ("${existing.Item.name}")`);
      continue;
    }

    const key = `exercises/${exerciseId}-${Date.now()}${ext}`;
    const body = fs.readFileSync(path.join(dir, file));
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));

    if (existing.Item.mediaKey && existing.Item.mediaKey !== key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: existing.Item.mediaKey }));
      } catch {
        // Best-effort cleanup — an orphaned S3 object isn't worth failing the import over.
      }
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { exerciseId },
        UpdateExpression: "SET mediaType = :mediaType, mediaKey = :mediaKey, mediaUrl = :mediaUrl, updatedAt = :updatedAt",
        ExpressionAttributeValues: {
          ":mediaType": "image",
          ":mediaKey": key,
          ":mediaUrl": publicMediaUrl(key),
          ":updatedAt": new Date().toISOString(),
        },
      })
    );

    uploaded++;
    console.log(`Uploaded ${file} -> ${exerciseId} ("${existing.Item.name}")`);
  }

  console.log(`\nDone. ${dryRun ? "Would upload" : "Uploaded"} ${uploaded}, skipped ${skipped} (out of ${files.length} files).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
