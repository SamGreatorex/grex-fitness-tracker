import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../lib/dynamo";
import { getRequestUser } from "../../../lib/users";
import { ROLES } from "../../../lib/profile";
import { canManageUser, isProgramManager, listProgramsForOwner, listTemplates, normaliseProgramInput, sortPrograms } from "../../../lib/programs";
import { PROGRAM_LEADS } from "../../../lib/programLead";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Default: the caller's own programmes.
// ?userId=X — a client's programmes (their PT, or an admin).
// ?scope=templates — the shared template library (PTs and admins).
// ?scope=all — every programme (admins only; used by the exercise library's
//   "used in" view).
export const GET = withLogging("GET /api/programs", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);

  if (searchParams.get("scope") === "templates") {
    if (!isProgramManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ programs: await listTemplates() });
  }

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

// A PT or admin saves a template (no owner) with { isTemplate: true, ...fields }.
// A PT creates a programme for one of their clients (admins: anyone): { ownerUserId, name, goal,
// ledBy ("user" | "trainer"), durationWeeks, days: [{ label, subtitle, exercises: [{ name, targetSets,
// targetReps, restSeconds }] }] }.
// Anyone can create a programme for themselves (ownerUserId omitted or their
// own userId); it's always user-led unless they're an admin training themselves.
export const POST = withLogging("POST /api/programs", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const isTemplate = body.isTemplate === true;
  const ownerUserId = isTemplate ? null : body.ownerUserId || user.userId;
  const forSelf = ownerUserId === user.userId;
  const managesOwner = !isTemplate && (await canManageUser(user, ownerUserId));

  if (isTemplate) {
    if (!isProgramManager(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (!forSelf) {
    const { Item: owner } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId: ownerUserId } }));
    // Not-your-client reads the same as not-found, so PTs can't probe for
    // other PTs' clients.
    if (!owner || !managesOwner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  const { program: fields, error } = normaliseProgramInput(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (forSelf && !managesOwner) fields.ledBy = PROGRAM_LEADS.USER;

  const now = new Date().toISOString();
  const program = {
    programId: randomUUID(),
    // Templates have no owner, which keeps them out of OwnerIndex (and so
    // out of every client's programme list).
    ...(isTemplate ? { isTemplate: true } : { ownerUserId }),
    ...fields,
    createdBy: user.userId,
    createdByName: user.name || user.email,
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TABLES.programs, Item: program }));
  return NextResponse.json({ program }, { status: 201 });
});
