import { NextResponse } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "../../../../../lib/dynamo";
import { getRequestUser } from "../../../../../lib/users";
import { canRunProgram, getProgram } from "../../../../../lib/programs";
import { EXERCISE_NOTE_MAX_LENGTH, exerciseNoteKey } from "../../../../../lib/exerciseNotes";
import { withLogging } from "../../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// Sets (or, with empty text, clears) the note on one exercise in one day:
// { dayId, exerciseName, text }. Whoever runs the programme can write them —
// the owner for user-led ones (even if their PT built it: a note doesn't
// change the training), their PT for trainer-led ones. Updated in place, so
// it never races a builder save or an exercise switch.
export const PUT = withLogging("PUT /api/programs/[programId]/notes", async (request, { params }) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { dayId, exerciseName, text } = await request.json();
  if (!dayId || !exerciseName?.trim()) {
    return NextResponse.json({ error: "dayId and exerciseName are required" }, { status: 400 });
  }
  const note = String(text ?? "").trim();
  if (note.length > EXERCISE_NOTE_MAX_LENGTH) {
    return NextResponse.json({ error: `Notes can be at most ${EXERCISE_NOTE_MAX_LENGTH} characters` }, { status: 400 });
  }

  const program = await getProgram(programId);
  if (!(await canRunProgram(user, program))) return NextResponse.json({ error: "Program not found" }, { status: 404 });
  if (!program.days.some((d) => d.dayId === dayId)) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  const key = exerciseNoteKey(dayId, exerciseName);
  const names = { "#notes": "exerciseNotes", "#key": key };

  // Empty text clears the note.
  if (!note) {
    if (program.exerciseNotes?.[key]) {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLES.programs,
          Key: { programId },
          UpdateExpression: "REMOVE #notes.#key",
          ExpressionAttributeNames: names,
        })
      );
    }
    return NextResponse.json({ note: null });
  }

  const value = { text: note, updatedAt: new Date().toISOString(), updatedBy: user.userId };
  // A nested path can only be set inside a map that exists, so make sure the
  // programme has one (if_not_exists leaves any notes already there alone —
  // safe even if two first notes are saved at once), then set this entry.
  if (!program.exerciseNotes) {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.programs,
        Key: { programId },
        UpdateExpression: "SET #notes = if_not_exists(#notes, :empty)",
        ExpressionAttributeNames: { "#notes": "exerciseNotes" },
        ExpressionAttributeValues: { ":empty": {} },
      })
    );
  }
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.programs,
      Key: { programId },
      UpdateExpression: "SET #notes.#key = :note",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ":note": value },
    })
  );
  return NextResponse.json({ note: value });
});
