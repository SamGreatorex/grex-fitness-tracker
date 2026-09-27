#!/usr/bin/env node
// Loads data/exercise-library.json into the Exercises table.
//
//   - New exercises are created (name, tags, equipment, where) and pointed at their image's S3 key, e.g.
//     exercises/kettlebell-swing.png. Upload the images to exactly those
//     keys in the exercise-media bucket (the app shows a placeholder until
//     the file exists).
//   - Exercises that already exist only get `equipment` and `where` added.
//     Their name, tags, defaults and media are left exactly as they are, so
//     edits made in the admin exercise library are never overwritten —
//     except that empty tag lists / missing media are filled in.
//   - Sets, reps and starting weight aren't part of an exercise — trainers
//     set those per exercise when building each programme.
//
// Safe to re-run.
//
//   node --env-file=.env.development.local scripts/import-exercise-library.js --dry-run
//   node --env-file=.env.development.local scripts/import-exercise-library.js

const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-2";
const TABLE = process.env.DYNAMODB_TABLE_EXERCISES;
const BUCKET = process.env.S3_EXERCISE_MEDIA_BUCKET;

// Same URL shape as src/lib/s3.js publicMediaUrl().
function publicMediaUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

function mediaFields(ex) {
  if (!ex.mediaKey) return { mediaType: null, mediaKey: null, mediaUrl: null };
  return { mediaType: ex.mediaType || "image", mediaKey: ex.mediaKey, mediaUrl: publicMediaUrl(ex.mediaKey) };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "data", "exercise-library.json");

  if (!TABLE) {
    console.error("DYNAMODB_TABLE_EXERCISES is not set — pass --env-file=<your env file>.");
    process.exit(1);
  }

  const library = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!BUCKET && library.some((ex) => ex.mediaKey)) {
    console.error("S3_EXERCISE_MEDIA_BUCKET is not set — needed to build image URLs.");
    process.exit(1);
  }
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
  console.log(`${dryRun ? "[dry run] " : ""}Importing ${library.length} exercises into ${TABLE}\n`);

  let created = 0;
  let updated = 0;
  for (const ex of library) {
    const { Item: current } = await client.send(new GetCommand({ TableName: TABLE, Key: { exerciseId: ex.exerciseId } }));
    const now = new Date().toISOString();

    if (!current) {
      created++;
      console.log(`+ ${ex.exerciseId} (${ex.equipment})${ex.mediaKey ? ` → ${ex.mediaKey}` : ""}`);
      if (dryRun) continue;
      await client.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            exerciseId: ex.exerciseId,
            name: ex.name,
            primaryTags: ex.primaryTags,
            secondaryTags: ex.secondaryTags,
            stabilizerTags: ex.stabilizerTags,
            equipment: ex.equipment,
            where: ex.where,
            ...mediaFields(ex),
            createdAt: now,
            updatedAt: now,
          },
          // Don't clobber a row created between the Get and this Put.
          ConditionExpression: "attribute_not_exists(exerciseId)",
        })
      );
      continue;
    }

    // Existing: add equipment/where; only fill gaps elsewhere.
    const set = { equipment: ex.equipment, where: ex.where, updatedAt: now };
    for (const key of ["primaryTags", "secondaryTags", "stabilizerTags"]) {
      if (!current[key]?.length && ex[key].length) set[key] = ex[key];
    }
    if (!current.mediaKey && ex.mediaKey) Object.assign(set, mediaFields(ex));
    updated++;
    console.log(`~ ${ex.exerciseId}: ${Object.keys(set).filter((k) => k !== "updatedAt").join(", ")}`);
    if (dryRun) continue;
    await client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { exerciseId: ex.exerciseId },
        UpdateExpression: `SET ${Object.keys(set).map((k) => `#${k} = :${k}`).join(", ")}`,
        ExpressionAttributeNames: Object.fromEntries(Object.keys(set).map((k) => [`#${k}`, k])),
        ExpressionAttributeValues: Object.fromEntries(Object.entries(set).map(([k, v]) => [`:${k}`, v])),
      })
    );
  }

  console.log(`\n${dryRun ? "Would create" : "Created"} ${created}, ${dryRun ? "would update" : "updated"} ${updated}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
