#!/usr/bin/env node
// Reads data/fitness-plan.json and creates a bare Exercises table entry
// (name only, no tags or media yet) for every unique exercise referenced
// across the 5 programs, so they all show up in /admin/exercises ready to
// be tagged and given an image/video. Safe to re-run — existing entries
// (including any tags/media already set via the admin UI) are left alone.
//   node --env-file=.env.local scripts/seed-exercises.js

const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-2";
const TABLE = process.env.DYNAMODB_TABLE_EXERCISES || "grex-fitness-tracker-exercises";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const jsonPath = path.join(__dirname, "..", "data", "fitness-plan.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`Missing ${jsonPath}. Copy fitness-plan.json into data/ first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const names = new Map();
  for (const program of raw.programs) {
    for (const workout of program.workouts) {
      for (const exercise of workout.exercises) {
        names.set(slugify(exercise.name), exercise.name);
      }
    }
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  let created = 0;
  let skipped = 0;
  for (const [exerciseId, name] of names) {
    const existing = await client.send(new GetCommand({ TableName: TABLE, Key: { exerciseId } }));
    if (existing.Item) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    await client.send(
      new PutCommand({
        TableName: TABLE,
        Item: { exerciseId, name, tags: [], mediaType: null, mediaKey: null, mediaUrl: null, createdAt: now, updatedAt: now },
      })
    );
    created++;
    console.log(`Created ${exerciseId} — ${name}`);
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped} already-existing (out of ${names.size} unique exercises).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
