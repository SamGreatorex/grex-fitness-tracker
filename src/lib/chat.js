import { randomUUID } from "crypto";
import { BatchGetCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLES } from "./dynamo";
import { isProgramManager } from "./programs";

// Trainer <-> client chat. A user can chat with their own PT (users.ptUserId),
// and a PT (or an admin) with each of their clients — nobody else. If a
// client changes PT, the old conversation simply stops being reachable (it's
// kept, and comes back if they're reassigned).
//
// Storage (TABLES.chat): one partition per pair, conversationId =
// "<clientUserId>#<trainerUserId>". Messages are itemKey "msg#<ISO>#<rand>"
// (so they sort by time); one itemKey "meta" item holds the pair, the last
// message and, per participant, readAt_<userId> — when they last read it.

export const CHAT_LIMITS = { textLength: 2000, pageSize: 100 };

const META = "meta";
const MSG = "msg#";

export const conversationIdFor = (clientUserId, trainerUserId) => `${clientUserId}#${trainerUserId}`;
const readAttr = (userId) => `readAt_${userId}`;

async function getUser(userId) {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLES.users, Key: { userId } }));
  return Item ?? null;
}

// What one participant sees of the other. Clients only get their trainer's
// name and picture (as on the home page's trainer card), never their email.
function partnerView(other, otherIsTrainer) {
  return {
    userId: other.userId,
    name: other.name?.trim() || (otherIsTrainer ? "Your trainer" : other.email),
    avatarUrl: other.avatarUrl ?? null,
    role: otherIsTrainer ? "trainer" : "client",
  };
}

// The conversation between `user` and `otherUserId`, if they're a client and
// their current PT (either way round): { conversationId, partner }, or null.
export async function resolveConversation(user, otherUserId) {
  if (!user || !otherUserId || otherUserId === user.userId) return null;
  const other = await getUser(otherUserId);
  if (!other) return null;
  if (user.ptUserId === other.userId) {
    return { conversationId: conversationIdFor(user.userId, other.userId), partner: partnerView(other, true) };
  }
  if (other.ptUserId === user.userId && isProgramManager(user)) {
    return { conversationId: conversationIdFor(other.userId, user.userId), partner: partnerView(other, false) };
  }
  return null;
}

// Everyone `user` can chat with: their PT, and (for PTs/admins) their clients.
async function partnersOf(user) {
  const partners = [];
  if (user.ptUserId && user.ptUserId !== user.userId) {
    const pt = await getUser(user.ptUserId);
    if (pt) partners.push({ conversationId: conversationIdFor(user.userId, pt.userId), partner: partnerView(pt, true) });
  }
  if (isProgramManager(user)) {
    let ExclusiveStartKey;
    do {
      const page = await ddb.send(
        new ScanCommand({
          TableName: TABLES.users,
          FilterExpression: "ptUserId = :me",
          ExpressionAttributeValues: { ":me": user.userId },
          ProjectionExpression: "userId, #name, email, avatarUrl",
          ExpressionAttributeNames: { "#name": "name" },
          ExclusiveStartKey,
        })
      );
      for (const client of page.Items ?? []) {
        if (client.userId === user.userId) continue; // an admin who is their own trainer
        partners.push({ conversationId: conversationIdFor(client.userId, user.userId), partner: partnerView(client, false) });
      }
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
  }
  return partners;
}

async function getMetas(conversationIds) {
  const metas = {};
  for (let i = 0; i < conversationIds.length; i += 100) {
    let keys = conversationIds.slice(i, i + 100).map((conversationId) => ({ conversationId, itemKey: META }));
    for (let attempt = 0; keys.length > 0 && attempt < 5; attempt++) {
      const result = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLES.chat]: { Keys: keys } } }));
      for (const meta of result.Responses?.[TABLES.chat] ?? []) metas[meta.conversationId] = meta;
      keys = result.UnprocessedKeys?.[TABLES.chat]?.Keys ?? [];
    }
  }
  return metas;
}

// How many messages from the other person `userId` hasn't read yet. If the
// latest message is their own they've seen everything (sending marks read).
async function unreadCount(meta, userId) {
  if (!meta?.lastMessageAt || meta.lastSenderUserId === userId) return 0;
  const readAt = meta[readAttr(userId)];
  if (readAt && readAt >= meta.lastMessageAt) return 0;
  // Message keys sort after "meta", so "> msg#<readAt>" is just the newer messages.
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.chat,
      KeyConditionExpression: "conversationId = :c AND itemKey > :from",
      FilterExpression: "senderUserId <> :me",
      ExpressionAttributeValues: { ":c": meta.conversationId, ":from": `${MSG}${readAt ?? ""}`, ":me": userId },
      Select: "COUNT",
    })
  );
  return result.Count ?? 0;
}

// The caller's conversations — newest activity first — with each partner,
// the last message and how many are unread.
export async function listConversations(user) {
  const partners = await partnersOf(user);
  const metas = await getMetas(partners.map((p) => p.conversationId));
  const conversations = await Promise.all(
    partners.map(async ({ conversationId, partner }) => {
      const meta = metas[conversationId];
      return {
        conversationId,
        partner,
        lastMessageAt: meta?.lastMessageAt ?? null,
        lastMessageText: meta?.lastMessageText ?? null,
        lastFromMe: meta ? meta.lastSenderUserId === user.userId : false,
        unread: await unreadCount(meta, user.userId),
      };
    })
  );
  return conversations.sort(
    (a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || a.partner.name.localeCompare(b.partner.name)
  );
}

function toMessage(item) {
  return { id: item.itemKey, senderUserId: item.senderUserId, text: item.text, sentAt: item.sentAt };
}

// Messages oldest-first. By default the latest page; `after` (a message id)
// gives only newer ones (for polling); `before` gives the page before it
// (for "load earlier"). `hasMore` says whether there are earlier ones.
export async function listMessages(conversationId, { after, before } = {}) {
  // Message keys all sort after "meta", so anything > a message key is a
  // newer message.
  if (after?.startsWith(MSG)) {
    const result = await ddb.send(
      new QueryCommand({
        TableName: TABLES.chat,
        KeyConditionExpression: "conversationId = :c AND itemKey > :after",
        ExpressionAttributeValues: { ":c": conversationId, ":after": after },
      })
    );
    return { messages: (result.Items ?? []).map(toMessage), hasMore: false };
  }

  // Newest first, then flipped. BETWEEN is inclusive, so the `before`
  // message itself comes back too — fetch one extra and drop it.
  const olderThan = before?.startsWith(MSG) ? before : null;
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLES.chat,
      KeyConditionExpression: olderThan
        ? "conversationId = :c AND itemKey BETWEEN :msg AND :before"
        : "conversationId = :c AND begins_with(itemKey, :msg)",
      ExpressionAttributeValues: { ":c": conversationId, ":msg": MSG, ...(olderThan && { ":before": olderThan }) },
      ScanIndexForward: false,
      Limit: CHAT_LIMITS.pageSize + (olderThan ? 1 : 0),
    })
  );
  const items = (result.Items ?? []).filter((i) => i.itemKey !== olderThan);
  return { messages: items.map(toMessage).reverse(), hasMore: !!result.LastEvaluatedKey };
}

// Records that `userId` has read everything up to now. No-op before the
// conversation's first message (there's no meta item yet).
export async function markRead(conversationId, userId) {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLES.chat,
        Key: { conversationId, itemKey: META },
        UpdateExpression: "SET #read = :now",
        ConditionExpression: "attribute_exists(conversationId)",
        ExpressionAttributeNames: { "#read": readAttr(userId) },
        ExpressionAttributeValues: { ":now": new Date().toISOString() },
      })
    );
  } catch (err) {
    if (err.name !== "ConditionalCheckFailedException") throw err;
  }
}

// Saves a message and updates the conversation's meta (creating it on the
// first message). Sending also counts as having read everything so far.
export async function sendMessage(conversationId, senderUserId, text) {
  const sentAt = new Date().toISOString();
  const item = { conversationId, itemKey: `${MSG}${sentAt}#${randomUUID().slice(0, 8)}`, senderUserId, text, sentAt };
  await ddb.send(new PutCommand({ TableName: TABLES.chat, Item: item }));

  const [clientUserId, trainerUserId] = conversationId.split("#");
  await ddb.send(
    new UpdateCommand({
      TableName: TABLES.chat,
      Key: { conversationId, itemKey: META },
      UpdateExpression:
        "SET clientUserId = :client, trainerUserId = :trainer, lastMessageAt = :at, lastMessageText = :preview, lastSenderUserId = :sender, #read = :at",
      ExpressionAttributeNames: { "#read": readAttr(senderUserId) },
      ExpressionAttributeValues: {
        ":client": clientUserId,
        ":trainer": trainerUserId,
        ":at": sentAt,
        ":preview": text.length > 140 ? `${text.slice(0, 140)}…` : text,
        ":sender": senderUserId,
      },
    })
  );
  return toMessage(item);
}

// Every conversation `userId` is part of, as client or trainer (for
// deleting a user). Scans the meta items — the chat table is small.
export async function conversationIdsInvolving(userId) {
  const ids = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: TABLES.chat,
        FilterExpression: "itemKey = :meta AND (clientUserId = :u OR trainerUserId = :u)",
        ExpressionAttributeValues: { ":meta": META, ":u": userId },
        ProjectionExpression: "conversationId",
        ExclusiveStartKey,
      })
    );
    ids.push(...(page.Items ?? []).map((i) => i.conversationId));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return ids;
}

// Every item key in a conversation (messages and meta), for deletion.
export async function keysForConversation(conversationId) {
  const keys = [];
  let ExclusiveStartKey;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: TABLES.chat,
        KeyConditionExpression: "conversationId = :c",
        ExpressionAttributeValues: { ":c": conversationId },
        ProjectionExpression: "conversationId, itemKey",
        ExclusiveStartKey,
      })
    );
    keys.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return keys;
}
