import { NextResponse } from "next/server";
import { DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getRequestUser } from "../../../../lib/users";
import { canAccessProgram, canEditProgram, canManageUser, getProgram, normaliseProgramInput } from "../../../../lib/programs";
import { PROGRAM_LEADS } from "../../../../lib/programLead";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Loads the programme and checks the caller may see it. Someone else's
// programme reads as "not found" rather than "forbidden", so programme IDs
// can't be probed.
async function loadAccessible(request, params) {
  const user = await getRequestUser(request);
  if (!user) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { programId } = await params;
  const program = await getProgram(programId);
  if (!(await canAccessProgram(user, program))) {
    return { denied: NextResponse.json({ error: "Program not found" }, { status: 404 }) };
  }
  return { user, program };
}

// `canEdit`: whether the caller may change this programme at all (rename,
// edit, delete, and add or switch exercises mid-workout) — see canEditProgram.
export const GET = withLogging("GET /api/programs/[programId]", async (request, { params }) => {
  const { user, program, denied } = await loadAccessible(request, params);
  if (denied) return denied;
  return NextResponse.json({ program, canEdit: await canEditProgram(user, program) });
});

// Rename. Owners can only rename programmes they built themselves — ones
// their PT built are changed by the PT (or an admin).
export const PATCH = withLogging("PATCH /api/programs/[programId]", async (request, { params }) => {
  const { user, program, denied } = await loadAccessible(request, params);
  if (denied) return denied;
  if (!(await canEditProgram(user, program))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name } = await request.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.programs,
      Key: { programId: program.programId },
      UpdateExpression: "SET #name = :name, #updatedAt = :now",
      ExpressionAttributeNames: { "#name": "name", "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: { ":name": name.trim(), ":now": new Date().toISOString() },
      ReturnValues: "ALL_NEW",
    })
  );
  return NextResponse.json({ program: result.Attributes });
});

// Full edit from the programme builder (the owner's PT, or an admin; for a
// template, its creator or an admin; for a programme its owner built
// themselves, the owner too). Ownership, creator and programId never
// change, and existing days keep their dayIds.
export const PUT = withLogging("PUT /api/programs/[programId]", async (request, { params }) => {
  const { user, program, denied } = await loadAccessible(request, params);
  if (denied) return denied;
  if (!(await canEditProgram(user, program))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { program: fields, error } = normaliseProgramInput(await request.json(), program);
  if (error) return NextResponse.json({ error }, { status: 400 });
  // An owner editing their own programme can't hand it to a trainer to run.
  if (!program.isTemplate && !(await canManageUser(user, program.ownerUserId))) fields.ledBy = PROGRAM_LEADS.USER;

  const updated = { ...program, ...fields, updatedAt: new Date().toISOString() };
  await ddb.send(new PutCommand({ TableName: TABLES.programs, Item: updated }));
  return NextResponse.json({ program: updated });
});

// The owner's PT, or an admin (templates: their creator, or an admin; a
// programme the owner built themselves: the owner too). Clients'
// programmes copied from a template are unaffected. The owner's past runs and logged sessions are kept
// (reports still use them); they just no longer have a programme to open.
export const DELETE = withLogging("DELETE /api/programs/[programId]", async (request, { params }) => {
  const { user, program, denied } = await loadAccessible(request, params);
  if (denied) return denied;
  if (!(await canEditProgram(user, program))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ddb.send(new DeleteCommand({ TableName: TABLES.programs, Key: { programId: program.programId } }));
  return NextResponse.json({ ok: true });
});
