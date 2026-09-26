#!/usr/bin/env node
// One-off migration for programmes created before programmes had owners.
// Gives every programme with no ownerUserId to the user with this email,
// so they show up for that user again. Nothing else about the programmes
// changes (same programId), so existing runs and logged sessions stay
// attached. Safe to re-run — already-owned programmes are left alone.
//
// The user must have signed in at least once (so they have a users-table row).
//
//   node --env-file=.env.development.local scripts/assign-programs-to-user.js you@example.com
//   node --env-file=.env.development.local scripts/assign-programs-to-user.js you@example.com --dry-run

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "eu-west-2";
const PROGRAMS_TABLE = process.env.DYNAMODB_TABLE_PROGRAMS;
const USERS_TABLE = process.env.DYNAMODB_TABLE_USERS;
const RUNS_TABLE = process.env.DYNAMODB_TABLE_RUNS;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await client.send(new ScanCommand({ ...params, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  const email = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!email || email.startsWith("--")) {
    console.error("Usage: node scripts/assign-programs-to-user.js <email> [--dry-run]");
    process.exit(1);
  }
  for (const [name, value] of Object.entries({ PROGRAMS_TABLE, USERS_TABLE, RUNS_TABLE })) {
    if (!value) {
      console.error(`Missing env var for ${name} — pass --env-file=<your env file>.`);
      process.exit(1);
    }
  }

  const users = await scanAll({
    TableName: USERS_TABLE,
    FilterExpression: "email = :email",
    ExpressionAttributeValues: { ":email": email },
  });
  if (users.length === 0) {
    console.error(`No user with email ${email} in ${USERS_TABLE}. Sign in to the app once first.`);
    process.exit(1);
  }
  const owner = users[0];

  const unowned = (await scanAll({ TableName: PROGRAMS_TABLE })).filter((p) => !p.ownerUserId);
  if (unowned.length === 0) {
    console.log("No unowned programmes — nothing to do.");
    return;
  }

  // Warn about anyone else who has run these programmes: after this they
  // won't see them any more (their history is kept, just not the programme).
  const unownedIds = new Set(unowned.map((p) => p.programId));
  const runs = await scanAll({ TableName: RUNS_TABLE });
  const otherUsers = new Set(
    runs.filter((r) => unownedIds.has(r.programId) && r.userId !== owner.userId).map((r) => r.userId)
  );

  for (const program of unowned) {
    console.log(`${dryRun ? "[dry run] would assign" : "Assigning"} ${program.programId} — ${program.name} → ${email}`);
    if (dryRun) continue;
    await client.send(
      new UpdateCommand({
        TableName: PROGRAMS_TABLE,
        Key: { programId: program.programId },
        UpdateExpression: "SET ownerUserId = :owner",
        ConditionExpression: "attribute_not_exists(ownerUserId)",
        ExpressionAttributeValues: { ":owner": owner.userId },
      })
    );
  }

  if (otherUsers.size > 0) {
    console.warn(
      `\nNote: ${otherUsers.size} other user(s) have runs on these programmes and will no longer see them:\n  ` +
        [...otherUsers].join("\n  ") +
        "\nA PT can build them their own programmes in trainer mode."
    );
  }

  console.log(`\nDone. ${dryRun ? "Would assign" : "Assigned"} ${unowned.length} programme(s) to ${email}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
