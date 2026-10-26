import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory runs, sessions and programmes tables. Enough for the
// restart and session-logging routes: Get, Delete, Query (by userId), Put,
// and Update (honouring a ConditionExpression of attribute_exists).
const tables = { runs: new Map(), sessions: new Map(), programs: new Map() };
const keyOf = (table, key) =>
  table === "programs" ? key.programId : `${key.userId}|${table === "runs" ? key.runId : key.sessionId}`;

vi.mock("../../src/lib/dynamo", () => ({
  TABLES: { runs: "runs", sessions: "sessions", programs: "programs", users: "users" },
  ddb: {
    send: vi.fn(async (command) => {
      const { TableName, Key, Item } = command.input;
      const table = tables[TableName];
      switch (command.constructor.name) {
        case "GetCommand":
          return { Item: structuredClone(table.get(keyOf(TableName, Key))) };
        case "DeleteCommand":
          table.delete(keyOf(TableName, Key));
          return {};
        case "PutCommand":
          table.set(keyOf(TableName, Item), structuredClone(Item));
          return {};
        case "QueryCommand": {
          const userId = command.input.ExpressionAttributeValues[":userId"];
          return { Items: [...table.values()].filter((row) => row.userId === userId).map((row) => structuredClone(row)) };
        }
        case "UpdateCommand": {
          const id = keyOf(TableName, Key);
          if (command.input.ConditionExpression?.includes("attribute_exists") && !table.has(id)) {
            const err = new Error("The conditional request failed");
            err.name = "ConditionalCheckFailedException";
            throw err;
          }
          const values = command.input.ExpressionAttributeValues;
          table.set(id, { ...Key, ...table.get(id), currentWeek: values[":nextWeek"] });
          return {};
        }
        default:
          throw new Error(`Unexpected command ${command.constructor.name}`);
      }
    }),
  },
}));

const user = { userId: "u1", role: "basic" };
const program = { programId: "p1", ownerUserId: "u1", createdBy: "u1", ledBy: "user", durationWeeks: 4, days: [] };

vi.mock("../../src/lib/users", () => ({ getRequestUser: vi.fn(async () => user) }));
vi.mock("../../src/lib/subscriptions", () => ({ requireAccess: () => null }));
vi.mock("../../src/lib/programs", async (importOriginal) => ({
  ...(await importOriginal()),
  getProgram: vi.fn(async () => program),
  canRunProgram: vi.fn(async () => true),
}));

import { POST as restart } from "../../src/app/api/runs/[runId]/restart/route";
import { POST as logSession } from "../../src/app/api/sessions/route";

// Restarting a programme deletes its run from the database but keeps the
// workouts already logged.

const RUN_ID = "p1#2026-10-01T00:00:00.000Z";

const post = (body) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
const restartRun = (body, runId = RUN_ID) => restart(post(body), { params: Promise.resolve({ runId }) });

const session = (week, dayId) => ({
  userId: "u1",
  sessionId: `${RUN_ID}#w${week}#${dayId}#2026-10-0${week}T10:00:00.000Z`,
  runId: RUN_ID,
  programId: "p1",
  dayId,
  week,
});

beforeEach(() => {
  tables.runs.clear();
  tables.sessions.clear();
  tables.programs.set("p1", structuredClone(program));
  tables.runs.set(`u1|${RUN_ID}`, { userId: "u1", runId: RUN_ID, programId: "p1", status: "active", currentWeek: 2 });
  for (const s of [session(1, "d1"), session(1, "d2"), session(2, "d1")]) tables.sessions.set(`u1|${s.sessionId}`, s);
});

describe("restarting a programme", () => {
  it("deletes the run from the database", async () => {
    const res = await restartRun({ scope: "program" });

    expect(res.status).toBe(200);
    expect(tables.runs.has(`u1|${RUN_ID}`)).toBe(false);
  });

  it("keeps the workouts already logged", async () => {
    await restartRun({ scope: "program" });

    expect(tables.sessions.size).toBe(3);
  });

  it("returns 404 for a run that doesn't exist (e.g. restarted twice)", async () => {
    await restartRun({ scope: "program" });
    const res = await restartRun({ scope: "program" });

    expect(res.status).toBe(404);
  });

  it("doesn't re-create the run when a workout is finished on a page left open", async () => {
    await restartRun({ scope: "program" });

    const res = await logSession(
      post({ runId: RUN_ID, programId: "p1", dayId: "d2", week: 2, exercises: [], dayOrder: 1, totalDaysInProgram: 2 })
    );

    expect(res.status).toBe(201);
    expect(tables.runs.has(`u1|${RUN_ID}`)).toBe(false);
  });
});

describe("restarting a week", () => {
  it("keeps the run and clears only that week's workouts", async () => {
    await restartRun({ scope: "week", week: 2 });

    expect(tables.runs.get(`u1|${RUN_ID}`)).toMatchObject({ status: "active", currentWeek: 2 });
    expect([...tables.sessions.values()].map((s) => s.week)).toEqual([1, 1]);
  });
});
