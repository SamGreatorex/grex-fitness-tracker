import { NextResponse } from "next/server";
import { TABLES } from "../../../../lib/dynamo";
import { getRequestUser } from "../../../../lib/users";
import { CHAT_LIMITS, listMessages, markRead, resolveConversation, sendMessage } from "../../../../lib/chat";
import { withLogging } from "../../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// The caller's conversation with `userId` (their PT, or one of their
// clients). Anyone else reads as "not found", so user IDs can't be probed.
async function load(request, params) {
  const user = await getRequestUser(request);
  if (!user) return { denied: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!TABLES.chat) {
    return { denied: NextResponse.json({ error: "Chat isn't set up yet (DYNAMODB_TABLE_CHAT)." }, { status: 503 }) };
  }
  const { userId } = await params;
  const conversation = await resolveConversation(user, userId);
  if (!conversation) return { denied: NextResponse.json({ error: "Conversation not found" }, { status: 404 }) };
  return { user, conversation };
}

// Messages, oldest first: the latest page by default; ?after=<id> for just
// newer ones (polling); ?before=<id> for the page before (load earlier).
// Viewing marks the conversation read.
export const GET = withLogging("GET /api/chat/[userId]", async (request, { params }) => {
  const { user, conversation, denied } = await load(request, params);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const { messages, hasMore } = await listMessages(conversation.conversationId, {
    after: searchParams.get("after") || undefined,
    before: searchParams.get("before") || undefined,
  });
  if (!searchParams.get("before")) await markRead(conversation.conversationId, user.userId);

  return NextResponse.json({ partner: conversation.partner, messages, hasMore });
});

// Sends a message: { text }.
export const POST = withLogging("POST /api/chat/[userId]", async (request, { params }) => {
  const { user, conversation, denied } = await load(request, params);
  if (denied) return denied;

  const { text } = await request.json();
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return NextResponse.json({ error: "Type a message first" }, { status: 400 });
  if (trimmed.length > CHAT_LIMITS.textLength) {
    return NextResponse.json({ error: `Messages can be at most ${CHAT_LIMITS.textLength} characters` }, { status: 400 });
  }

  const message = await sendMessage(conversation.conversationId, user.userId, trimmed);
  return NextResponse.json({ message }, { status: 201 });
});
