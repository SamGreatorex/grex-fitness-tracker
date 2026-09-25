#!/usr/bin/env node
// One-off: copies every exercise-library item (DynamoDB) and its S3 media
// object from the prod exercise library into the dev one, so dev starts
// with a real dataset instead of an empty table. Only touches the
// exercises table/bucket — programs/runs/sessions (real workout history)
// are deliberately left alone.
//
// Read-only against prod; only ever writes to the *-dev-* resources. Safe
// to re-run — each item/object is overwritten by its own key, not appended.
//
// Usage: node scripts/copy-prod-exercises-to-dev.js

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, CopyObjectCommand } = require("@aws-sdk/client-s3");

const REGION = "eu-west-2";
const PROD_TABLE = "grex-fitness-tracker-exercises";
const DEV_TABLE = "grex-fitness-tracker-dev-exercises";
const PROD_BUCKET = "grex-fitness-tracker-exercise-media-560506968350";
const DEV_BUCKET = "grex-fitness-tracker-dev-exercise-media-560506968350";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// Stored mediaUrl is a full URL baked with the bucket name at write time
// (see src/lib/s3.js publicMediaUrl) — it has to be repointed at the dev
// bucket, or dev would keep linking back to prod's copy of the image.
function toDevMediaUrl(prodMediaUrl) {
  if (!prodMediaUrl) return prodMediaUrl;
  return prodMediaUrl.replace(PROD_BUCKET, DEV_BUCKET);
}

async function main() {
  const { Items: items = [] } = await ddb.send(new ScanCommand({ TableName: PROD_TABLE }));
  console.log(`Found ${items.length} exercises in ${PROD_TABLE}.\n`);

  for (const item of items) {
    if (item.mediaKey) {
      await s3.send(
        new CopyObjectCommand({
          Bucket: DEV_BUCKET,
          Key: item.mediaKey,
          CopySource: `${PROD_BUCKET}/${item.mediaKey}`,
        })
      );
      console.log(`  media copied: ${item.mediaKey}`);
    }

    await ddb.send(
      new PutCommand({ TableName: DEV_TABLE, Item: { ...item, mediaUrl: toDevMediaUrl(item.mediaUrl) } })
    );
    console.log(`Seeded exercise ${item.exerciseId} — ${item.name}`);
  }

  console.log(`\nDone. Copied ${items.length} exercises (and their media) into ${DEV_TABLE} / ${DEV_BUCKET}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
