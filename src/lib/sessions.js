import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";

// Reading logged workouts without pulling a user's whole history.
// sessionId is "<runId>#w<week>#<dayId>#<completedAt>", so one run's
// sessions share a key prefix; UserCompletedIndex (userId + completedAt)
// gives them newest-first across every run.

export const SESSION_PAGE = { defaultLimit: 50, maxLimit: 100 };

// Every session in one run (a run is at most weeks × days long).
export async function sessionsForRun(userId, runId) {
  const sessions = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.sessions,
        KeyConditionExpression: "userId = :userId AND begins_with(sessionId, :run)",
        ExpressionAttributeValues: { ":userId": userId, ":run": `${runId}#` },
        ExclusiveStartKey,
      })
    );
    sessions.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return sessions;
}

const encodeCursor = (key) => Buffer.from(JSON.stringify(key)).toString("base64url");

// The cursor is the index's LastEvaluatedKey, so it must be this user's.
function decodeCursor(cursor, userId) {
  try {
    const key = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const valid =
      key?.userId === userId && typeof key.sessionId === "string" && typeof key.completedAt === "string" && Object.keys(key).length === 3;
    return valid ? key : null;
  } catch {
    return null;
  }
}

// One page of a user's sessions, newest first: { sessions, nextCursor }
// (nextCursor is null on the last page). Returns null for a bad cursor.
export async function recentSessions(userId, { limit = SESSION_PAGE.defaultLimit, cursor } = {}) {
  let ExclusiveStartKey;
  if (cursor) {
    ExclusiveStartKey = decodeCursor(cursor, userId);
    if (!ExclusiveStartKey) return null;
  }
  const page = await ddb.send(
    new QueryCommand({
      TableName: TABLES.sessions,
      IndexName: "UserCompletedIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: { ":userId": userId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey,
    })
  );
  return {
    sessions: page.Items ?? [],
    nextCursor: page.LastEvaluatedKey ? encodeCursor(page.LastEvaluatedKey) : null,
  };
}
