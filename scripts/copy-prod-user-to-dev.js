#!/usr/bin/env node
// Replaces one user's data in dev with a copy of their data from prod:
// their profile, programmes (incl. exercise notes), programme runs, logged
// workouts, body measurements, trainer chats and avatar.
//
// The same person has a different userId in each environment (it's their
// Cognito sub, and dev has its own user pool), so every ID is rewritten on
// the way over — matched by email. Other people the data points at (their
// PT, whoever built or logged something, chat partners) are matched by
// email too; anyone who doesn't exist in dev is reported, and their link is
// dropped where it would otherwise break things (PT, chats).
//
// PROD IS ONLY EVER READ. Every AWS call goes through guardedSend(), which
// refuses any write to a table or bucket that isn't a dev one.
//
// Dev is cleared first: the user's programmes, runs, workouts, measurements
// and chats. Their dev sign-in (Cognito) and dev users row are kept — the
// row's fields are replaced with prod's. They must have signed in to dev at
// least once, so the row exists.
//
// Not copied: programme templates (shared, not one user's) and other
// people's data (e.g. a PT's clients).
//
// Usage:
//   node scripts/copy-prod-user-to-dev.js <email>            # dry run: shows what it would do
//   node scripts/copy-prod-user-to-dev.js <email> --apply    # does it
// Uses your AWS credentials (AWS_PROFILE, e.g. sam-personal).

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  GetCommand,
  PutCommand,
  BatchWriteCommand,
} = require("@aws-sdk/lib-dynamodb");
const { S3Client, CopyObjectCommand } = require("@aws-sdk/client-s3");

const REGION = "eu-west-2";
const ACCOUNT = "560506968350";
const PROD_PREFIX = "grex-fitness-tracker-";
const DEV_PREFIX = "grex-fitness-tracker-dev-";
const TABLE_NAMES = ["users", "programs", "program-runs", "workout-sessions", "body-measurements", "chat-messages"];
const PROD = Object.fromEntries(TABLE_NAMES.map((t) => [t, PROD_PREFIX + t]));
const DEV = Object.fromEntries(TABLE_NAMES.map((t) => [t, DEV_PREFIX + t]));
const PROD_BUCKET = `${PROD_PREFIX}exercise-media-${ACCOUNT}`;
const DEV_BUCKET = `${DEV_PREFIX}exercise-media-${ACCOUNT}`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

// ---- The prod-is-read-only guard ----
// Reads may go anywhere; anything else must only name dev tables/buckets.
// (Note the prod prefix is also the start of every dev name, so the check
// is "is it dev", never "is it prod".)
const READS = new Set(["GetCommand", "QueryCommand", "ScanCommand"]);
const isDevTable = (name) => typeof name === "string" && name.startsWith(DEV_PREFIX);

async function guardedSend(client, command) {
  const kind = command.constructor.name;
  const input = command.input;
  if (!READS.has(kind)) {
    const tables = input.TableName ? [input.TableName] : Object.keys(input.RequestItems ?? {});
    const bucket = input.Bucket;
    const targets = bucket ? [bucket] : tables;
    if (targets.length === 0 || targets.some((t) => (bucket ? t !== DEV_BUCKET : !isDevTable(t)))) {
      throw new Error(`Refusing ${kind} on ${targets.join(", ") || "(nothing)"} — only dev may be written to.`);
    }
    if (!APPLY) throw new Error(`Internal error: ${kind} attempted in a dry run.`);
  }
  return client.send(command);
}
const send = (command) => guardedSend(ddb, command);

// ---- Arguments ----
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const EMAIL = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!EMAIL) {
  console.error("Usage: node scripts/copy-prod-user-to-dev.js <email> [--apply]");
  process.exit(1);
}

// ---- Reading helpers ----
async function all(command, input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await send(new command({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}
const scanAll = (TableName, extra = {}) => all(ScanCommand, { TableName, ...extra });
const queryUser = (TableName, userId) =>
  all(QueryCommand, { TableName, KeyConditionExpression: "userId = :u", ExpressionAttributeValues: { ":u": userId } });
const programsOwnedBy = (TableName, userId) =>
  all(QueryCommand, {
    TableName,
    IndexName: "OwnerIndex",
    KeyConditionExpression: "ownerUserId = :u",
    ExpressionAttributeValues: { ":u": userId },
  });

// ---- Writing helpers (dev only, via the guard) ----
async function batch(TableName, requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let pending = requests.slice(i, i + 25);
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt > 6) throw new Error(`Could not finish writing to ${TableName}`);
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const result = await send(new BatchWriteCommand({ RequestItems: { [TableName]: pending } }));
      pending = result.UnprocessedItems?.[TableName] ?? [];
    }
  }
}
const deleteKeys = (TableName, keys) => batch(TableName, keys.map((Key) => ({ DeleteRequest: { Key } })));
const putItems = (TableName, items) => batch(TableName, items.map((Item) => ({ PutRequest: { Item } })));

// ---- ID mapping ----
// prod userId → dev userId, for everyone whose email exists in both.
async function buildIdMap() {
  const byEmail = (users) => new Map(users.filter((u) => u.email).map((u) => [u.email.trim().toLowerCase(), u]));
  const prodUsers = await scanAll(PROD.users);
  const devUsers = await scanAll(DEV.users);
  const devByEmail = byEmail(devUsers);
  const map = new Map();
  for (const [email, prodUser] of byEmail(prodUsers)) {
    const devUser = devByEmail.get(email);
    if (devUser) map.set(prodUser.userId, devUser.userId);
  }
  return { map, prodUser: byEmail(prodUsers).get(EMAIL), devUser: devByEmail.get(EMAIL), prodUsers };
}

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY RUN (nothing will be changed — add --apply to do it)"}`);
  console.log(`User: ${EMAIL}\nFrom: ${PROD_PREFIX}* (read only)\nTo:   ${DEV_PREFIX}*\n`);

  const { map, prodUser, devUser, prodUsers } = await buildIdMap();
  if (!prodUser) throw new Error(`No prod user with email ${EMAIL}.`);
  if (!devUser) throw new Error(`No dev user with email ${EMAIL} — sign in to dev once so their row exists, then re-run.`);
  const prodId = prodUser.userId;
  const devId = devUser.userId;
  console.log(`prod userId ${prodId} → dev userId ${devId}`);

  // Other people referenced: mapped if they exist in dev, otherwise reported.
  const emailOf = new Map(prodUsers.map((u) => [u.userId, u.email]));
  const unmatched = new Set();
  const mapId = (id) => {
    if (id == null) return id;
    if (map.has(id)) return map.get(id);
    unmatched.add(id);
    return id;
  };

  // ---------- Read everything from prod ----------
  const prodPrograms = await programsOwnedBy(PROD.programs, prodId);
  const prodRuns = await queryUser(PROD["program-runs"], prodId);
  const prodSessions = await queryUser(PROD["workout-sessions"], prodId);
  const prodMeasurements = await queryUser(PROD["body-measurements"], prodId);
  const prodChatItems = (await scanAll(PROD["chat-messages"])).filter((i) => i.conversationId.split("#").includes(prodId));

  // ---------- Transform to dev IDs ----------
  const user = { ...prodUser, userId: devId, email: devUser.email };
  if (prodUser.ptUserId) {
    if (map.has(prodUser.ptUserId)) user.ptUserId = map.get(prodUser.ptUserId);
    else {
      console.log(`  ! Their PT (${emailOf.get(prodUser.ptUserId) ?? prodUser.ptUserId}) isn't in dev — no PT in dev.`);
      delete user.ptUserId;
      delete user.ptAssignedAt;
    }
  }
  // The avatar lives in the media bucket under avatars/<userId>/; it's copied
  // across to the dev bucket under the dev userId.
  let avatarCopy = null;
  if (prodUser.avatarKey) {
    const devKey = prodUser.avatarKey.replace(`avatars/${prodId}/`, `avatars/${devId}/`);
    avatarCopy = { from: prodUser.avatarKey, to: devKey };
    user.avatarKey = devKey;
    if (prodUser.avatarUrl) user.avatarUrl = prodUser.avatarUrl.replace(PROD_BUCKET, DEV_BUCKET).replace(prodUser.avatarKey, devKey);
  }

  const programs = prodPrograms.map((p) => ({
    ...p,
    ownerUserId: devId,
    createdBy: p.createdBy === prodId ? devId : mapId(p.createdBy),
    ...(p.exerciseNotes && {
      exerciseNotes: Object.fromEntries(
        Object.entries(p.exerciseNotes).map(([k, note]) => [k, { ...note, updatedBy: note.updatedBy === prodId ? devId : mapId(note.updatedBy) }])
      ),
    }),
  }));

  const runs = prodRuns.map((r) => ({ ...r, userId: devId }));

  const sessions = prodSessions.map((s) => ({
    ...s,
    userId: devId,
    programDayKey: s.programDayKey?.replace(`${prodId}#`, `${devId}#`),
    ...(s.loggedByUserId && { loggedByUserId: s.loggedByUserId === prodId ? devId : mapId(s.loggedByUserId) }),
    ...(s.editedByUserId && { editedByUserId: s.editedByUserId === prodId ? devId : mapId(s.editedByUserId) }),
  }));

  const measurements = prodMeasurements.map((m) => ({ ...m, userId: devId }));

  // Chats: only with partners who exist in dev — a conversation is keyed by
  // both people's IDs, so it can't be copied without the other one.
  const swap = (id) => (id === prodId ? devId : map.get(id));
  const chatItems = [];
  const skippedChats = new Set();
  for (const item of prodChatItems) {
    const ids = item.conversationId.split("#");
    if (ids.some((id) => swap(id) == null)) {
      skippedChats.add(item.conversationId);
      continue;
    }
    const next = { ...item, conversationId: ids.map(swap).join("#") };
    for (const field of ["clientUserId", "trainerUserId", "lastSenderUserId", "senderUserId"]) {
      if (next[field]) next[field] = swap(next[field]) ?? next[field];
    }
    // Per-person "read up to" times are stored as readAt_<userId>.
    for (const key of Object.keys(next).filter((k) => k.startsWith("readAt_"))) {
      const id = swap(key.slice("readAt_".length));
      const value = next[key];
      delete next[key];
      if (id) next[`readAt_${id}`] = value;
    }
    chatItems.push(next);
  }
  for (const c of skippedChats) {
    const partner = c.split("#").find((id) => id !== prodId);
    console.log(`  ! Chat with ${emailOf.get(partner) ?? partner} skipped — they aren't in dev.`);
  }

  // Programme IDs are kept, so runs/sessions still point at them — but never
  // overwrite someone else's dev programme that happens to share an ID.
  for (const p of programs) {
    const { Item: existing } = await send(new GetCommand({ TableName: DEV.programs, Key: { programId: p.programId } }));
    if (existing && existing.ownerUserId !== devId) {
      throw new Error(`Dev programme ${p.programId} belongs to someone else (${existing.ownerUserId}) — stopping.`);
    }
  }

  // ---------- What's in dev now (to clear) ----------
  const devPrograms = await programsOwnedBy(DEV.programs, devId);
  const devRuns = await queryUser(DEV["program-runs"], devId);
  const devSessions = await queryUser(DEV["workout-sessions"], devId);
  const devMeasurements = await queryUser(DEV["body-measurements"], devId);
  const devChatKeys = (await scanAll(DEV["chat-messages"], { ProjectionExpression: "conversationId, itemKey" })).filter((i) =>
    i.conversationId.split("#").includes(devId)
  );

  console.log("\nDev — delete:");
  console.log(`  programmes ${devPrograms.length}, runs ${devRuns.length}, workouts ${devSessions.length}, measurements ${devMeasurements.length}, chat items ${devChatKeys.length}`);
  console.log("Prod → dev — copy:");
  console.log(`  profile 1, programmes ${programs.length}, runs ${runs.length}, workouts ${sessions.length}, measurements ${measurements.length}, chat items ${chatItems.length}, avatar ${avatarCopy ? 1 : 0}`);
  if (unmatched.size > 0) {
    console.log("  ! Kept as-is (not in dev): " + [...unmatched].map((id) => emailOf.get(id) ?? id).join(", "));
  }

  if (!APPLY) {
    console.log("\nDry run only — nothing changed. Re-run with --apply to do it.");
    return;
  }

  // ---------- Clear dev ----------
  await deleteKeys(DEV.programs, devPrograms.map((p) => ({ programId: p.programId })));
  await deleteKeys(DEV["program-runs"], devRuns.map((r) => ({ userId: devId, runId: r.runId })));
  await deleteKeys(DEV["workout-sessions"], devSessions.map((s) => ({ userId: devId, sessionId: s.sessionId })));
  await deleteKeys(DEV["body-measurements"], devMeasurements.map((m) => ({ userId: devId, date: m.date })));
  await deleteKeys(DEV["chat-messages"], devChatKeys.map((i) => ({ conversationId: i.conversationId, itemKey: i.itemKey })));
  console.log("\nCleared dev.");

  // ---------- Copy into dev ----------
  if (avatarCopy) {
    await guardedSend(s3, new CopyObjectCommand({ Bucket: DEV_BUCKET, Key: avatarCopy.to, CopySource: `${PROD_BUCKET}/${avatarCopy.from}` }));
  }
  await send(new PutCommand({ TableName: DEV.users, Item: user }));
  await putItems(DEV.programs, programs);
  await putItems(DEV["program-runs"], runs);
  await putItems(DEV["workout-sessions"], sessions);
  await putItems(DEV["body-measurements"], measurements);
  await putItems(DEV["chat-messages"], chatItems);
  console.log("Copied prod data into dev. Done.");
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
