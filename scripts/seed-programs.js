#!/usr/bin/env node
// Reads data/fitness-plan.json and writes the 5 program templates into the
// Programs DynamoDB table. Run once after `./aws/deploy.sh`:
//   node scripts/seed-programs.js

const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-2";
const TABLE = process.env.DYNAMODB_TABLE_PROGRAMS || "grex-fitness-tracker-programs";

// "Day 2 - BEGINNER PIN LOADED (1 year or less)" -> { label: "Day 2", subtitle: "BEGINNER PIN LOADED (1 year or less)" }
function splitDayName(rawName) {
  const [label, ...rest] = rawName.split(" - ");
  const subtitle = rest.join(" - ").trim();
  return { label: label.trim(), subtitle: subtitle || null };
}

function transformProgram(program) {
  const week1Workouts = program.workouts
    .filter((w) => w.week_number === 1)
    .sort((a, b) => a.order - b.order);

  const days = week1Workouts.map((workout, dayIndex) => {
    const { label, subtitle } = splitDayName(workout.name);
    const exercises = [...workout.exercises]
      .sort((a, b) => a.order - b.order)
      .map((exercise, exerciseIndex) => {
        const firstSet = exercise.sets[0] || {};
        return {
          exerciseId: String(exerciseIndex),
          name: exercise.name,
          videoLink: exercise.link || null,
          order: exerciseIndex,
          targetSets: exercise.sets.length,
          targetReps: firstSet.reps || null,
          restSeconds: parseInt(firstSet.rest, 10) || 60,
        };
      });

    return {
      dayId: String(workout.id),
      label,
      subtitle,
      order: dayIndex,
      exercises,
    };
  });

  return {
    programId: String(program.id),
    name: program.name,
    goal: program.goal,
    durationWeeks: 4,
    order: null,
    days,
  };
}

async function main() {
  const jsonPath = path.join(__dirname, "..", "data", "fitness-plan.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`Missing ${jsonPath}. Copy fitness-plan.json into data/ first.`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const programs = raw.programs.map((p, i) => {
    const item = transformProgram(p);
    item.order = i;
    return item;
  });

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  for (const item of programs) {
    await client.send(new PutCommand({ TableName: TABLE, Item: item }));
    console.log(`Seeded program ${item.programId} — ${item.name} (${item.days.length} days)`);
  }

  console.log(`\nDone. Wrote ${programs.length} programs to ${TABLE}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
