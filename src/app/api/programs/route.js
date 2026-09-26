import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getRequestUser } from "../../../lib/users";
import { ROLES } from "../../../lib/profile";
import { canManageUser, isProgramManager, listProgramsForOwner, normaliseProgramInput, sortPrograms } from "../../../lib/programs";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Default: the caller's own programmes.
// ?userId=X — a client's programmes (their PT, or an admin).
// ?scope=all — every programme (admins only; used by the exercise library's
//   "used in" view).
export const GET = withLogging("GET /api/programs", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get("scope") === "all") {
    if (user.role !== ROLES.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const programs = [];
    let ExclusiveStartKey;
    do {
      const page = await ddb.send(new ScanCommand({ TableName: TABLES.programs, ExclusiveStartKey }));
      programs.push(...(page.Items ?? []));
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return NextResponse.json({ programs: sortPrograms(programs) });
  }

  const ownerUserId = searchParams.get("userId") || user.userId;
  if (ownerUserId !== user.userId && !(await canManageUser(user, ownerUserId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ programs: await listProgramsForOwner(ownerUserId) });
});

// A PT creates a programme for one of their clients (admins: anyone): { ownerUserId, name, goal,
// durationWeeks, days: [{ label, subtitle, exercises: [{ name, targetSets,
// targetReps, restSeconds }] }] }.
export const POST = withLogging("POST /api/programs", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isProgramManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { ownerUserId } = body;
  if (!ownerUserId) return NextResponse.json({ error: "ownerUserId is required" }, { status: 400 });

  const { Item: owner } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId: ownerUserId } }));
  // Not-your-client reads the same as not-found, so PTs can't probe for
  // other PTs' clients.
  if (!owner || !(await canManageUser(user, ownerUserId))) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { program: fields, error } = normaliseProgramInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const now = new Date().toISOString();
  const program = {
    programId: randomUUID(),
    ownerUserId,
    ...fields,
    createdBy: user.userId,
    createdByName: user.name || user.email,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.programs, Item: program }));
  return NextResponse.json({ program }, { status: 201 });
});
