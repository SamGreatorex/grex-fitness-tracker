#!/usr/bin/env node
// Imports primaryTags/secondaryTags/stabilizerTags from a DynamoDB-export
// CSV (the AWS console's "Export to CSV" format, where list-of-string
// columns look like `[{"S":"Chest"},{"S":"Shoulders"}]`) into the live
// Exercises table. Only those three attributes (+ updatedAt) are touched —
// name/media are left exactly as they are in the table. Rows whose
// exerciseId no longer exists in the table are skipped, not created.
//
//   node --env-file=.env.local scripts/import-exercise-tags.js ~/Downloads/results.csv

const fs = require("fs");
const os = require("os");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-2";
const TABLE = process.env.DYNAMODB_TABLE_EXERCISES || "grex-fitness-tracker-exercises";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

// DynamoDB-JSON list-of-strings, e.g. `[{"S":"Chest"},{"S":"Shoulders"}]` -> ["Chest","Shoulders"]
function parseTagList(raw) {
  if (!raw || raw === "null") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => item.S).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const csvArg = args.find((a) => !a.startsWith("--"));
  if (!csvArg) {
    console.error("Usage: node scripts/import-exercise-tags.js <path-to-csv> [--dry-run]");
    process.exit(1);
  }
  const csvPath = csvArg.startsWith("~") ? path.join(os.homedir(), csvArg.slice(1)) : csvArg;
  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const col = (name) => header.indexOf(name);
  const idCol = col("exerciseId");
  const primaryCol = col("primaryTags");
  const secondaryCol = col("secondaryTags");
  const stabilizerCol = col("stabilizerTags");

  if (idCol === -1 || primaryCol === -1 || secondaryCol === -1 || stabilizerCol === -1) {
    console.error("CSV is missing one of: exerciseId, primaryTags, secondaryTags, stabilizerTags columns.");
    process.exit(1);
  }

  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  let updated = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const exerciseId = row[idCol];
    if (!exerciseId) continue;

    const primaryTags = parseTagList(row[primaryCol]);
    const secondaryTags = parseTagList(row[secondaryCol]);
    const stabilizerTags = parseTagList(row[stabilizerCol]);

    if (dryRun) {
      console.log(`[dry-run] ${exerciseId} — primary: [${primaryTags}], secondary: [${secondaryTags}], stabilizer: [${stabilizerTags}]`);
      updated++;
      continue;
    }

    try {
      await client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { exerciseId },
          ConditionExpression: "attribute_exists(exerciseId)",
          UpdateExpression:
            "SET primaryTags = :primary, secondaryTags = :secondary, stabilizerTags = :stabilizer, updatedAt = :updatedAt",
          ExpressionAttributeValues: {
            ":primary": primaryTags,
            ":secondary": secondaryTags,
            ":stabilizer": stabilizerTags,
            ":updatedAt": new Date().toISOString(),
          },
        })
      );
      updated++;
      console.log(`Updated ${exerciseId} — primary: [${primaryTags}], secondary: [${secondaryTags}], stabilizer: [${stabilizerTags}]`);
    } catch (err) {
      if (err.name === "ConditionalCheckFailedException") {
        skipped++;
        console.log(`Skipped ${exerciseId} — no such exercise in ${TABLE}`);
      } else {
        throw err;
      }
    }
  }

  console.log(`\nDone. Updated ${updated}, skipped ${skipped} (out of ${rows.length - 1} rows in the CSV).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
