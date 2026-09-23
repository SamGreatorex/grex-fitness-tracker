import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Hardcoded rather than read from AWS_REGION: that name is reserved on the
// Lambda runtime AWS Amplify Hosting's SSR compute runs on, so AWS silently
// overrides it to the function's own execution region — a value set for it
// in the Amplify Console is never actually seen by this code. This app's
// DynamoDB tables only ever live in eu-west-2 (see docs/ENV_SETUP.md), so
// there's nothing to make configurable here.
const REGION = "eu-west-2";

const client = new DynamoDBClient({ region: REGION });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  programs: process.env.DYNAMODB_TABLE_PROGRAMS,
  runs: process.env.DYNAMODB_TABLE_RUNS,
  sessions: process.env.DYNAMODB_TABLE_SESSIONS,
  exercises: process.env.DYNAMODB_TABLE_EXERCISES,
};
