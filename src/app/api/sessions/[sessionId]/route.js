import { NextResponse } from "next/server";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../lib/dynamo";
import { getRequestUser } from "../../../../lib/users";
import { canRunProgram, getProgram, resolveSubjectUserId } from "../../../../lib/programs";
import { applySessionEdit } from "../../../../lib/sessionEdit";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// One of `requestedUserId`'s sessions (default: the caller's) — or null if
// it's missing or the caller may not see that user's data.
async function loadSession(user, requestedUserId, sessionId) {
  const userId = await resolveSubjectUserId(user, requestedUserId);
  if (!userId) return null;
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLES.sessions, Key: { userId, sessionId } }));
  return Item ?? null;
}

export const GET = withLogging("GET /api/sessions/[sessionId]", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?userId=X — one of a client's sessions, for their PT or an admin.
  const { sessionId } = await params;
  const session = await loadSession(user, new URL(request.url).searchParams.get("userId"), sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  return NextResponse.json({ session });
});

// Corrects a logged workout: { exercises: [{ exerciseId, sets: [{ weight |
// unit: "lb" + weightEntered, reps, effort }] } | { exerciseId, cardio: {
// settings, durationSeconds, effort } }], userId? }. Whoever may run the
// programme may edit its workouts (the owner for user-led programmes, their
// PT for trainer-led ones) — the same people who logged them.
export const PUT = withLogging("PUT /api/sessions/[sessionId]", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sessionId } = await params;
  const session = await loadSession(user, body.userId, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const program = await getProgram(session.programId);
  // Programme since deleted: its owner can still fix their own history.
  const allowed = program ? await canRunProgram(user, program) : session.userId === user.userId;
  if (!allowed) return NextResponse.json({ error: "You can't edit this workout" }, { status: 403 });

  const { exercises, totalWeightLifted, error } = applySessionEdit(session, body.exercises);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const updated = {
    ...session,
    exercises,
    totalWeightLifted,
    editedAt: new Date().toISOString(),
    editedByUserId: user.userId,
  };
  await ddb.send(new PutCommand({ TableName: TABLES.sessions, Item: updated }));
  return NextResponse.json({ session: updated });
});
