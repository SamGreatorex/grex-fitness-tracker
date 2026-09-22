import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-west-2" });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  programs: process.env.DYNAMODB_TABLE_PROGRAMS,
  runs: process.env.DYNAMODB_TABLE_RUNS,
  sessions: process.env.DYNAMODB_TABLE_SESSIONS,
  exercises: process.env.DYNAMODB_TABLE_EXERCISES,
};
