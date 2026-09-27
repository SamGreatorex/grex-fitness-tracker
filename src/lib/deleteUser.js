import { BatchWriteCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { ddb, TABLES } from "./dynamo";
import { deleteMediaObject } from "./s3";

// Hardcoded rather than read from AWS_REGION — see src/lib/dynamo.js.
const cognito = new CognitoIdentityProviderClient({ region: "eu-west-2" });

// Clients of someone who's no longer a PT go back to the unassigned pool,
// so other PTs can pick them up. Returns how many were released.
export async function releaseClientsOf(ptUserId) {
  let released = 0;
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.users,
        FilterExpression: "ptUserId = :pt",
        ExpressionAttributeValues: { ":pt": ptUserId },
        ProjectionExpression: "userId",
        ExclusiveStartKey,
      })
    );
    for (const { userId } of page.Items ?? []) {
      try {
        await ddb.send(
          new UpdateCommand({
            TableName: TABLES.users,
            Key: { userId },
            UpdateExpression: "REMOVE ptUserId, ptAssignedAt",
            ConditionExpression: "ptUserId = :pt",
            ExpressionAttributeValues: { ":pt": ptUserId },
          })
        );
        released++;
      } catch (err) {
        if (err.name !== "ConditionalCheckFailedException") throw err;
      }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return released;
}

// Every item in a userId-keyed table for this user, keys only.
async function keysForUser(table, sortKey, userId) {
  const keys = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ProjectionExpression: "userId, #sk",
        ExpressionAttributeNames: { "#sk": sortKey },
        ExclusiveStartKey,
      })
    );
    keys.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return keys;
}

// Deletes in batches of 25 (DynamoDB's limit), retrying anything throttled.
async function batchDelete(table, keys) {
  for (let i = 0; i < keys.length; i += 25) {
    let requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length > 0; attempt++) {
      if (attempt > 5) throw new Error(`Could not delete all items from ${table}`);
      if (attempt > 0) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const result = await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: requests } }));
      requests = result.UnprocessedItems?.[table] ?? [];
    }
  }
  return keys.length;
}

async function programmeIdsOwnedBy(userId) {
  const ids = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.programs,
        IndexName: "OwnerIndex",
        KeyConditionExpression: "ownerUserId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ProjectionExpression: "programId",
        ExclusiveStartKey,
      })
    );
    ids.push(...(page.Items ?? []).map((p) => p.programId));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return ids;
}

// Removes the user's Cognito sign-in. Already-gone counts as done, so a
// retried delete can finish off whatever a failed attempt left behind.
async function deleteCognitoUser(user) {
  const UserPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  // With email as the sign-in attribute Cognito's username is the sub
  // (our userId); the email alias is tried as a fallback.
  for (const Username of [user.userId, user.email].filter(Boolean)) {
    try {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId, Username }));
      return "deleted";
    } catch (err) {
      if (err.name !== "UserNotFoundException") throw err;
    }
  }
  return "notFound";
}

// Permanently deletes a user and everything that belongs to them.
// Order matters: sign-in is removed first (so they can't log back in and
// recreate a profile mid-delete), the users row last (so if anything fails
// part-way the admin can simply press Delete again to finish it).
export async function deleteUserCompletely(user) {
  const { userId } = user;
  const summary = { cognito: await deleteCognitoUser(user) };

  const programIds = await programmeIdsOwnedBy(userId);
  for (const programId of programIds) {
    await ddb.send(new DeleteCommand({ TableName: TABLES.programs, Key: { programId } }));
  }
  summary.programmes = programIds.length;

  summary.runs = await batchDelete(TABLES.runs, await keysForUser(TABLES.runs, "runId", userId));
  summary.workouts = await batchDelete(TABLES.sessions, await keysForUser(TABLES.sessions, "sessionId", userId));
  summary.measurements = await batchDelete(TABLES.measurements, await keysForUser(TABLES.measurements, "date", userId));

  // If they were a PT, their clients become unassigned.
  summary.clientsReleased = await releaseClientsOf(userId);

  if (user.avatarKey) await deleteMediaObject(user.avatarKey);

  await ddb.send(new DeleteCommand({ TableName: TABLES.users, Key: { userId } }));
  return summary;
}
