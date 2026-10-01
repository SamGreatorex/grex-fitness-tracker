import { NextResponse } from "next/server";
import { TABLES } from "../../../lib/dynamo";
import { getRequestUser } from "../../../lib/users";
import { listConversations } from "../../../lib/chat";
import { withLogging } from "../../../lib/apiHandler";

// Every response here is per-user data pulled fresh from DynamoDB/S3 — it
// must never be cached by CloudFront (Amplify Hosting sits behind it), or
// one user's stale response can get served to everyone after that.
export const dynamic = "force-dynamic";

// The caller's chats: with their PT, and (PTs/admins) with each client —
// partner, last message, unread count — plus `unread`, the total (for the
// header badge). `available` is false when there's nobody to chat with.
export const GET = withLogging("GET /api/chat", async (request) => {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!TABLES.chat) return NextResponse.json({ error: "Chat isn't set up yet (DYNAMODB_TABLE_CHAT)." }, { status: 503 });

  const conversations = await listConversations(user);
  return NextResponse.json({
    conversations,
    unread: conversations.reduce((sum, c) => sum + c.unread, 0),
    available: conversations.length > 0,
  });
});
