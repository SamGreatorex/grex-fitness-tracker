import { vi } from "vitest";

// An in-memory stand-in for the DynamoDB users table, enough for the
// billing code in src/lib/subscriptions.js: GetCommand reads the row, and
// UpdateCommand applies the fields saveBilling sets (including appending
// payments and removing the trainer link). Use with
//   vi.mock("../../src/lib/dynamo", () => ({ ddb: { send: vi.fn() }, TABLES: { users: "users" } }));
// then `const table = useUsersTable(ddb, row)`.
export function useUsersTable(ddb, row) {
  let stored = structuredClone(row);
  const updates = [];

  ddb.send.mockReset();
  ddb.send.mockImplementation(async (command) => {
    const input = command.input;
    if (!input.UpdateExpression) return { Item: structuredClone(stored) };

    updates.push(input);
    const values = input.ExpressionAttributeValues;
    const next = { ...stored, billingVersion: values[":next"], updatedAt: values[":now"] };
    for (const key of ["subscription", "extraProgrammeSlots", "trialUsedAt"]) {
      if (`:${key}` in values) next[key] = values[`:${key}`];
    }
    if (values[":payments"]) next.payments = [...(stored.payments ?? []), ...values[":payments"]];
    if (input.UpdateExpression.includes("REMOVE")) {
      delete next.ptUserId;
      delete next.ptAssignedAt;
    }
    stored = next;
    return { Attributes: structuredClone(next) };
  });

  return {
    get row() {
      return stored;
    },
    updates,
  };
}

export const mockDynamo = () => ({ ddb: { send: vi.fn() }, TABLES: { users: "users" } });
