#!/usr/bin/env node
// Copies every user's programmes, programme runs and logged workouts from
// prod into dev:
//   grex-fitness-tracker-programs         → grex-fitness-tracker-dev-programs
//   grex-fitness-tracker-program-runs     → grex-fitness-tracker-dev-program-runs
//   grex-fitness-tracker-workout-sessions → grex-fitness-tracker-dev-workout-sessions
//
// The same person has a different userId in each environment (it's their
// Cognito sub, and dev has its own user pool), so users are matched by
// email between the prod and dev users tables and the dev userId is written
// instead. Anything whose user has no match in dev is NOT copied:
//   - programmes: by owner (templates, which have no owner, by who made them)
//   - runs and workouts: by the user they belong to
// Other people a copied item mentions (the PT who built a programme, who
// logged or edited a workout) get their dev userId too if they're in dev;
// if not, their prod userId is kept and reported.
//
// PROD IS ONLY EVER READ. Every AWS call goes through guardedSend(), which
// refuses anything but a read unless it targets a dev table.
//
// Usage (dry run by default — shows what it would do, changes nothing):
//   node scripts/copy-prod-workouts-to-dev.js                    # dry run
//   node scripts/copy-prod-workouts-to-dev.js --clear            # dry run, incl. clearing
//   node scripts/copy-prod-workouts-to-dev.js --apply            # copy (overwrites matching items)
//   node scripts/copy-prod-workouts-to-dev.js --clear --apply    # empty the 3 dev tables, then copy
// --clear empties the three dev tables completely first — everyone's data,
// including dev-only users'. The users tables are never changed.
// Uses your AWS credentials (AWS_PROFILE, e.g. sam-personal).

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = "eu-west-2";
const PROD_PREFIX = "grex-fitness-tracker-";
const DEV_PREFIX = "grex-fitness-tracker-dev-";
const PROD = {
  users: `${PROD_PREFIX}users`,
  programs: `${PROD_PREFIX}programs`,
  runs: `${PROD_PREFIX}program-runs`,
  sessions: `${PROD_PREFIX}workout-sessions`,
};
const DEV = {
  users: `${DEV_PREFIX}users`,
  programs: `${DEV_PREFIX}programs`,
  runs: `${DEV_PREFIX}program-runs`,
  sessions: `${DEV_PREFIX}workout-sessions`,
};
// Each table's primary key, for clearing.
const KEYS = {
  [DEV.programs]: ["programId"],
  [DEV.runs]: ["userId", "runId"],
  [DEV.sessions]: ["userId", "sessionId"],
};

// ---- Arguments ----
const KNOWN = new Set(["--apply", "--clear"]);
const args = process.argv.slice(2);
const unknown = args.filter((a) => !KNOWN.has(a));
if (unknown.length > 0) {
  console.error(`Unknown argument(s): ${unknown.join(" ")}\nUsage: node scripts/copy-prod-workouts-to-dev.js [--clear] [--apply]`);
  process.exit(1);
}
const APPLY = args.includes("--apply");
const CLEAR = args.includes("--clear");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ---- The prod-is-read-only guard ----
// Scans may go anywhere; anything else must only name dev tables. (The prod
// prefix is also the start of every dev name, so the check is "is it dev",
// never "is it prod".)
const READS = new Set(["ScanCommand"]);
const isDevTable = (name) => typeof name === "string" && name.startsWith(DEV_PREFIX);

async function guardedSend(command) {
  const kind = command.constructor.name;
  if (!READS.has(kind)) {
    const input = command.input;
    const tables = input.TableName ? [input.TableName] : Object.keys(input.RequestItems ?? {});
    if (tables.length === 0 || !tables.every(isDevTable)) {
      throw new Error(`Refusing ${kind} on ${tables.join(", ") || "(nothing)"} — only dev tables may be written to.`);
    }
    if (!APPLY) throw new Error(`Internal error: ${kind} attempted in a dry run.`);
  }
  return ddb.send(command);
}

// ---- Reading ----
async function scanAll(TableName, extra = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await guardedSend(new ScanCommand({ TableName, ExclusiveStartKey, ...extra }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// ---- Writing (dev only, via the guard) ----
async function batch(TableName, requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let pending = requests.slice(i, i + 25);
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt > 8) throw new Error(`Could not finish writing to ${TableName}`);
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const result = await guardedSend(new BatchWriteCommand({ RequestItems: { [TableName]: pending } }));
      pending = result.UnprocessedItems?.[TableName] ?? [];
    }
  }
}
const putItems = (TableName, items) => batch(TableName, items.map((Item) => ({ PutRequest: { Item } })));

async function clearTable(TableName) {
  const keyNames = KEYS[TableName];
  const names = Object.fromEntries(keyNames.map((k, i) => [`#k${i}`, k]));
  const items = await scanAll(TableName, {
    ProjectionExpression: Object.keys(names).join(", "),
    ExpressionAttributeNames: names,
  });
  if (APPLY) await batch(TableName, items.map((Key) => ({ DeleteRequest: { Key } })));
  return items.length;
}

// ---- Users, matched by email ----
const emailKey = (u) => u.email?.trim().toLowerCase();

async function buildIdMap() {
  const [prodUsers, devUsers] = await Promise.all([scanAll(PROD.users), scanAll(DEV.users)]);
  const devByEmail = new Map(devUsers.filter(emailKey).map((u) => [emailKey(u), u.userId]));
  const toDev = new Map();
  const emailOf = new Map();
  for (const u of prodUsers) {
    emailOf.set(u.userId, u.email ?? "(no email)");
    const devId = emailKey(u) && devByEmail.get(emailKey(u));
    if (devId) toDev.set(u.userId, devId);
  }
  return { toDev, emailOf, prodCount: prodUsers.length, devCount: devUsers.length };
}

async function main() {
  console.log(APPLY ? "APPLYING" : "DRY RUN (nothing will be changed — add --apply to do it)");
  console.log(`From: ${PROD_PREFIX}* (read only)\nTo:   ${DEV_PREFIX}*`);
  console.log(`Clear dev tables first: ${CLEAR ? "yes" : "no (add --clear)"}\n`);

  const { toDev, emailOf, prodCount, devCount } = await buildIdMap();
  console.log(`Users: ${prodCount} in prod, ${devCount} in dev, ${toDev.size} matched by email.`);

  // People mentioned in passing (not the item's owner) who aren't in dev.
  const unmatchedMentions = new Set();
  const mention = (id) => {
    if (id == null) return id;
    if (toDev.has(id)) return toDev.get(id);
    unmatchedMentions.add(id);
    return id;
  };
  // Items skipped because their user isn't in dev, per user.
  const skipped = new Map(); // prod userId → { programs, runs, sessions }
  const skip = (userId, kind) => {
    const key = userId ?? "(none)";
    if (!skipped.has(key)) skipped.set(key, { programs: 0, runs: 0, sessions: 0 });
    skipped.get(key)[kind]++;
  };

  // ---------- Read prod ----------
  const [prodPrograms, prodRuns, prodSessions] = await Promise.all([
    scanAll(PROD.programs),
    scanAll(PROD.runs),
    scanAll(PROD.sessions),
  ]);

  // ---------- Transform to dev IDs ----------
  const programs = [];
  for (const p of prodPrograms) {
    // A programme's user is its owner; a template's is whoever made it.
    const userId = p.isTemplate ? p.createdBy : p.ownerUserId;
    if (!toDev.has(userId)) {
      skip(userId, "programs");
      continue;
    }
    const copy = { ...p, createdBy: mention(p.createdBy) };
    if (!p.isTemplate) copy.ownerUserId = toDev.get(p.ownerUserId);
    if (p.exerciseNotes) {
      copy.exerciseNotes = Object.fromEntries(
        Object.entries(p.exerciseNotes).map(([k, note]) => [k, { ...note, updatedBy: mention(note.updatedBy) }])
      );
    }
    programs.push(copy);
  }

  const runs = [];
  for (const r of prodRuns) {
    if (!toDev.has(r.userId)) {
      skip(r.userId, "runs");
      continue;
    }
    runs.push({ ...r, userId: toDev.get(r.userId) });
  }

  const sessions = [];
  for (const s of prodSessions) {
    if (!toDev.has(s.userId)) {
      skip(s.userId, "sessions");
      continue;
    }
    const devId = toDev.get(s.userId);
    const copy = { ...s, userId: devId };
    // programDayKey = <userId>#<programId>#<dayId>
    if (s.programDayKey?.startsWith(`${s.userId}#`)) copy.programDayKey = devId + s.programDayKey.slice(s.userId.length);
    if (s.loggedByUserId) copy.loggedByUserId = mention(s.loggedByUserId);
    if (s.editedByUserId) copy.editedByUserId = mention(s.editedByUserId);
    sessions.push(copy);
  }

  // ---------- Report ----------
  console.log("\nProd → dev — copy:");
  console.log(`  programmes ${programs.length} of ${prodPrograms.length}`);
  console.log(`  runs       ${runs.length} of ${prodRuns.length}`);
  console.log(`  workouts   ${sessions.length} of ${prodSessions.length}`);
  if (skipped.size > 0) {
    console.log("\nNot copied — user not in dev:");
    for (const [id, n] of skipped) {
      console.log(`  ${emailOf.get(id) ?? id}: programmes ${n.programs}, runs ${n.runs}, workouts ${n.sessions}`);
    }
  }
  if (unmatchedMentions.size > 0) {
    console.log("\nKept their prod userId (mentioned on a copied item, but not in dev):");
    for (const id of unmatchedMentions) console.log(`  ${emailOf.get(id) ?? id}`);
  }

  // ---------- Clear dev ----------
  if (CLEAR) {
    console.log(`\nDev — ${APPLY ? "clearing" : "would clear"}:`);
    for (const table of [DEV.programs, DEV.runs, DEV.sessions]) {
      console.log(`  ${table}: ${await clearTable(table)} items`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only — nothing changed. Re-run with --apply to do it.");
    return;
  }

  // ---------- Copy into dev ----------
  await putItems(DEV.programs, programs);
  await putItems(DEV.runs, runs);
  await putItems(DEV.sessions, sessions);
  console.log("\nCopied prod data into dev. Done.");
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
