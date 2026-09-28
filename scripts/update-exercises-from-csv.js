#!/usr/bin/env node
// Updates the Exercises table from a CSV in the DynamoDB console's
// "Export to CSV" format (list columns look like [{"S":"Gym"},{"S":"Home"}]).
//
//   - Rows whose exerciseId isn't in the table are created.
//   - Rows that exist are updated, but only the columns whose values actually
//     changed. Attributes that aren't columns in the CSV (e.g. old
//     defaultReps/defaultWeight/where) are left as they are — unless
//     --remove-extra is passed, which removes them so each row ends up with
//     exactly the CSV's columns (exerciseId/createdAt/updatedAt always kept).
//   - Exercises in the table but not in the CSV are listed, never deleted.
//   - createdAt is kept from the table for existing rows; updatedAt is set to
//     now on anything created or changed.
//
// After writing, every created/updated item is read back and checked, so
// "Done" only prints if the table really holds the new values.
//
// Options:
//   --dry-run        show what would change; write nothing
//   --table <name>   target this table (otherwise DYNAMODB_TABLE_EXERCISES)
//   --force          write every CSV row, even ones that look unchanged
//   --remove-extra   remove attributes that aren't columns in the CSV
//
// Always dry-run first — it prints every create and every field change:
//   node --env-file=.env.production.local scripts/update-exercises-from-csv.js ~/Downloads/results_updated.csv --table grex-fitness-tracker-exercises --dry-run
//   node --env-file=.env.production.local scripts/update-exercises-from-csv.js ~/Downloads/results_updated.csv --table grex-fitness-tracker-exercises

const fs = require("fs");
const os = require("os");
const path = require("path");

const REGION = process.env.AWS_REGION || "eu-west-2";

// Columns that hold DynamoDB string lists ([{"S": "..."}]).
const LIST_COLUMNS = ["primaryTags", "secondaryTags", "stabilizerTags", "instructions", "location"];
// Never written from the CSV: the key, and the timestamps (managed here).
const SKIP_COLUMNS = ["exerciseId", "createdAt", "updatedAt"];
// Never removed by --remove-extra.
const PROTECTED = new Set(["exerciseId", "createdAt", "updatedAt"]);
const TYPES = ["strength", "cardio"];

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
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...data] = rows.filter((r) => r.some((c) => c !== ""));
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// One CSV row → the item attributes to write, or throws with a clear reason.
function rowToItem(row, line) {
  const at = `row ${line} (${row.exerciseId || "no exerciseId"})`;
  if (!row.exerciseId) throw new Error(`${at}: exerciseId is empty`);
  if (!row.name) throw new Error(`${at}: name is empty`);

  const item = {};
  for (const [column, raw] of Object.entries(row)) {
    if (SKIP_COLUMNS.includes(column)) continue;
    const value = raw.trim();
    if (LIST_COLUMNS.includes(column)) {
      if (value === "") {
        item[column] = [];
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error(`${at}: ${column} isn't a valid list: ${value.slice(0, 60)}`);
      }
      if (!Array.isArray(parsed) || parsed.some((d) => typeof d?.S !== "string")) {
        throw new Error(`${at}: ${column} must look like [{"S":"..."}]`);
      }
      item[column] = parsed.map((d) => d.S.trim()).filter(Boolean);
    } else {
      item[column] = value === "" || value === "null" ? null : value;
    }
  }

  if (item.type != null) {
    item.type = item.type.toLowerCase();
    if (!TYPES.includes(item.type)) throw new Error(`${at}: type must be ${TYPES.join(" or ")}, got "${item.type}"`);
  }
  return item;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// What would change: [{ exerciseId, action: "create" | "update" | "unchanged",
// changes, removals }]. With `force`, every existing row is written in full,
// changed or not. With `removeExtra`, attributes not in `csvColumns` are
// listed for removal.
function planUpdates(items, existingById, { force = false, removeExtra = false, csvColumns = new Set() } = {}) {
  return items.map(({ exerciseId, createdAt, item }) => {
    const current = existingById.get(exerciseId);
    if (!current) return { exerciseId, action: "create", item, createdAt, removals: [] };
    const changes = Object.entries(item)
      .filter(([k, v]) => force || !same(current[k], v))
      .map(([k, v]) => ({ field: k, from: current[k], to: v }));
    const removals = removeExtra
      ? Object.keys(current).filter((k) => !csvColumns.has(k) && !PROTECTED.has(k))
      : [];
    return { exerciseId, action: changes.length || removals.length ? "update" : "unchanged", changes, removals };
  });
}

// Fields that should now hold the given values (undefined = removed), for
// read-back checking.
function expectedAfterWrite(p) {
  if (p.action === "create") return p.item;
  return {
    ...Object.fromEntries(p.changes.map((c) => [c.field, c.to])),
    ...Object.fromEntries(p.removals.map((k) => [k, undefined])),
  };
}

function short(v) {
  const s = Array.isArray(v) ? `[${v.join(", ")}]` : v == null ? "—" : String(v);
  return s.length > 70 ? `${s.slice(0, 67)}…` : s;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const removeExtra = args.includes("--remove-extra");
  const tableFlag = args.indexOf("--table");
  const TABLE = tableFlag >= 0 ? args[tableFlag + 1] : process.env.DYNAMODB_TABLE_EXERCISES;
  // The CSV path is the first plain argument that isn't --table's value.
  const tableValueIndex = tableFlag >= 0 ? tableFlag + 1 : -1;
  const fileArg = args.find((a, i) => !a.startsWith("--") && i !== tableValueIndex);
  if (!fileArg) {
    console.error("Usage: node scripts/update-exercises-from-csv.js <path-to-csv> [--table <name>] [--dry-run] [--force] [--remove-extra]");
    process.exit(1);
  }
  if (!TABLE || TABLE.startsWith("--")) {
    console.error("No table — pass --table <name>, or DYNAMODB_TABLE_EXERCISES via --env-file=<your env file>.");
    process.exit(1);
  }
  const file = fileArg.startsWith("~") ? path.join(os.homedir(), fileArg.slice(1)) : fileArg;

  // Validate the whole file before touching the table.
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const items = rows.map((row, i) => ({ exerciseId: row.exerciseId, createdAt: row.createdAt || null, item: rowToItem(row, i + 2) }));
  const dupes = items.map((x) => x.exerciseId).filter((id, i, all) => all.indexOf(id) !== i);
  if (dupes.length) throw new Error(`Duplicate exerciseIds in CSV: ${[...new Set(dupes)].join(", ")}`);

  const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

  const existing = [];
  let ExclusiveStartKey;
  do {
    const page = await client.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    existing.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const existingById = new Map(existing.map((e) => [e.exerciseId, e]));

  const csvColumns = new Set(Object.keys(rows[0] ?? {}));
  const plan = planUpdates(items, existingById, { force, removeExtra, csvColumns });
  const csvIds = new Set(items.map((x) => x.exerciseId));
  const notInCsv = existing.filter((e) => !csvIds.has(e.exerciseId)).map((e) => e.exerciseId);

  console.log(dryRun ? "[DRY RUN — nothing will be written]" : "[LIVE RUN — writing to the table]");
  console.log(`  Table:   ${TABLE}${tableFlag >= 0 ? " (from --table)" : " (from DYNAMODB_TABLE_EXERCISES)"}`);
  console.log(`  Region:  ${REGION}   AWS profile: ${process.env.AWS_PROFILE || "(default credentials)"}`);
  console.log(`  CSV:     ${rows.length} rows from ${file}`);
  console.log(`  Table currently has ${existing.length} exercises${force ? "   (--force: rewriting every row)" : ""}`);
  if (removeExtra) console.log(`  --remove-extra: removing any attribute that isn't one of the CSV's ${csvColumns.size} columns`);
  console.log("");
  for (const p of plan) {
    if (p.action === "create") console.log(`+ ${p.exerciseId} (new)`);
    if (p.action === "update") {
      console.log(`~ ${p.exerciseId}`);
      for (const c of p.changes) console.log(`    ${c.field}: ${short(c.from)} → ${short(c.to)}`);
      for (const k of p.removals) console.log(`    - ${k} (removed, was ${short(existingById.get(p.exerciseId)[k])})`);
    }
  }
  const count = (a) => plan.filter((p) => p.action === a).length;
  const removalCount = plan.reduce((n, p) => n + p.removals.length, 0);
  console.log(`\n${count("create")} to create, ${count("update")} to update, ${count("unchanged")} unchanged.`);
  if (removeExtra) {
    const byAttr = {};
    for (const p of plan) for (const k of p.removals) byAttr[k] = (byAttr[k] ?? 0) + 1;
    console.log(`Attributes to remove: ${removalCount ? Object.entries(byAttr).map(([k, n]) => `${k} (${n} rows)`).join(", ") : "none"}`);
  }
  if (notInCsv.length) console.log(`Not in the CSV (left alone): ${notInCsv.join(", ")}`);

  if (count("create") + count("update") === 0) {
    console.log(`\nNothing to change — every CSV row already matches ${TABLE}.`);
    console.log("If you expected changes, check the table name above is the one you're looking at, or use --force.");
    return;
  }

  if (dryRun) {
    console.log("\nDry run — nothing was written. Re-run without --dry-run to apply.");
    return;
  }

  const now = new Date().toISOString();
  for (const p of plan) {
    if (p.action === "create") {
      await client.send(
        new PutCommand({
          TableName: TABLE,
          Item: { exerciseId: p.exerciseId, ...p.item, createdAt: p.createdAt || now, updatedAt: now },
          ConditionExpression: "attribute_not_exists(exerciseId)",
        })
      );
    } else if (p.action === "update") {
      const set = Object.fromEntries([...p.changes.map((c) => [c.field, c.to]), ["updatedAt", now]]);
      const setExpr = `SET ${Object.keys(set).map((k) => `#${k} = :${k}`).join(", ")}`;
      const removeExpr = p.removals.length ? ` REMOVE ${p.removals.map((k) => `#${k}`).join(", ")}` : "";
      await client.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { exerciseId: p.exerciseId },
          UpdateExpression: setExpr + removeExpr,
          ExpressionAttributeNames: Object.fromEntries([...Object.keys(set), ...p.removals].map((k) => [`#${k}`, k])),
          ExpressionAttributeValues: Object.fromEntries(Object.entries(set).map(([k, v]) => [`:${k}`, v])),
          ConditionExpression: "attribute_exists(exerciseId)",
        })
      );
    }
  }
  // Read every written item back (strongly consistent) and check it holds
  // the new values — so success is only reported if the table really changed.
  const failed = [];
  for (const p of plan) {
    if (p.action === "unchanged") continue;
    const { Item } = await client.send(
      new GetCommand({ TableName: TABLE, Key: { exerciseId: p.exerciseId }, ConsistentRead: true })
    );
    const expected = expectedAfterWrite(p);
    const wrong = Object.keys(expected).filter((k) => !same(Item?.[k], expected[k]));
    if (!Item || wrong.length) failed.push(`${p.exerciseId}${Item ? ` (${wrong.join(", ")})` : " (missing)"}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} item(s) in ${TABLE} don't hold the new values after writing:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  console.log(
    `\nDone and verified in ${TABLE}: created ${count("create")}, updated ${count("update")}` +
      (removeExtra ? `, removed ${removalCount} attribute value(s).` : ".")
  );
}

module.exports = { parseCsv, rowToItem, planUpdates, expectedAfterWrite, main };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
