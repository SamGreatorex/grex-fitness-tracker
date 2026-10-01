"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import { api } from "../../../lib/apiClient";
import AppHeader from "../../../components/AppHeader";
import Avatar from "../../../components/Avatar";
import { formatDayHeading, formatMessageTime } from "../chatTime";
import styles from "../chat.module.css";

const POLL_MS = 4_000;
const MAX_LENGTH = 2000;

// Merges newly fetched messages into the list, skipping any already there
// (a poll can race a send and return the same message).
function mergeNewer(current, incoming) {
  const seen = new Set(current.map((m) => m.id));
  return [...current, ...incoming.filter((m) => !seen.has(m.id))];
}

// Whether the message list is scrolled to (about) the bottom — if so, new
// messages keep it there; if the user has scrolled up to read, they don't.
function isNearBottom(el) {
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

// One conversation, between the signed-in user and `userId` (their trainer,
// or one of their clients). New messages are picked up by polling every few
// seconds while the tab is visible; viewing marks them read.
export default function ChatThreadPage() {
  const { userId: partnerId } = useParams();
  const router = useRouter();
  const { user, loading: sessionLoading } = useAuth();
  const me = user?.userId;

  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  // With only one conversation, /chat just redirects back here — so Back
  // goes home instead.
  const [onlyConversation, setOnlyConversation] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  // What to do with the scroll position after the next render: stick to the
  // bottom (new messages), or keep the view steady (older ones prepended).
  const scrollIntent = useRef({ type: "bottom" });

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  // Initial load.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { partner, messages, hasMore } = await api.get(`/api/chat/${partnerId}`);
        setPartner(partner);
        setHasMore(hasMore);
        scrollIntent.current = { type: "bottom" };
        setMessages(messages);
      } catch (err) {
        if (err.status === 404) setNotFound(true);
        else setError(err.message || "Could not load this conversation.");
      }
    })();
  }, [user, partnerId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { conversations } = await api.get("/api/chat");
        setOnlyConversation(conversations.length === 1);
      } catch {
        // Keep the default Back to Messages.
      }
    })();
  }, [user]);

  // Poll for newer messages while the conversation is open and visible.
  const lastId = messages?.length ? messages[messages.length - 1].id : null;
  const poll = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const { messages: newer } = await api.get(`/api/chat/${partnerId}`, lastId ? { after: lastId } : undefined);
      if (newer.length === 0) return;
      scrollIntent.current = isNearBottom(listRef.current) ? { type: "bottom" } : { type: "none" };
      setMessages((current) => (lastId ? mergeNewer(current ?? [], newer) : newer));
    } catch {
      // Transient — the next poll will try again.
    }
  }, [partnerId, lastId]);

  // Only start polling once the first load is in.
  const loaded = messages !== null;
  useEffect(() => {
    if (!loaded) return;
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [poll, loaded]);

  // Apply the scroll intent once the new messages are on screen.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !messages) return;
    const intent = scrollIntent.current;
    if (intent.type === "bottom") el.scrollTop = el.scrollHeight;
    else if (intent.type === "keep") el.scrollTop = el.scrollHeight - intent.fromBottom;
    scrollIntent.current = { type: "none" };
  }, [messages]);

  const loadOlder = async () => {
    if (!messages?.length) return;
    setLoadingOlder(true);
    try {
      const { messages: older, hasMore } = await api.get(`/api/chat/${partnerId}`, { before: messages[0].id });
      const el = listRef.current;
      scrollIntent.current = { type: "keep", fromBottom: el.scrollHeight - el.scrollTop };
      setHasMore(hasMore);
      setMessages((current) => [...older, ...current]);
    } catch (err) {
      setError(err.message || "Could not load earlier messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    try {
      const { message } = await api.post(`/api/chat/${partnerId}`, { text: trimmed });
      scrollIntent.current = { type: "bottom" };
      setMessages((current) => mergeNewer(current ?? [], [message]));
      setText("");
    } catch (err) {
      setError(err.message || "Could not send your message.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Enter sends; Shift+Enter is a new line.
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  if (sessionLoading || !user) return null;

  return (
    <div className={styles.threadPage}>
      <AppHeader backHref={onlyConversation ? "/" : "/chat"} backLabel={onlyConversation ? "Programs" : "Messages"} />

      {notFound ? (
        <main className={styles.main}>
          <p className={styles.empty}>You can only message your own trainer, or your own clients.</p>
        </main>
      ) : (
        <main className={styles.thread}>
          <div className={styles.threadHeader}>
            {partner && (
              <>
                <Avatar src={partner.avatarUrl} name={partner.name} size={40} />
                <span className={styles.threadHeaderText}>
                  <span className={styles.threadName}>{partner.name}</span>
                  <span className={styles.threadRole}>{partner.role === "trainer" ? "Your trainer" : "Your client"}</span>
                </span>
              </>
            )}
          </div>

          <div ref={listRef} className={styles.messages} aria-live="polite">
            {hasMore && (
              <button type="button" className={styles.loadOlder} onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}
            {messages === null ? (
              !error && <p className={styles.empty}>Loading…</p>
            ) : messages.length === 0 ? (
              <p className={styles.threadEmpty}>No messages yet. Say hello to {partner?.name ?? "them"}!</p>
            ) : (
              messages.map((m, i) => {
                const mine = m.senderUserId === me;
                const newDay = i === 0 || new Date(messages[i - 1].sentAt).toDateString() !== new Date(m.sentAt).toDateString();
                return (
                  <div key={m.id} className={styles.messageGroup}>
                    {newDay && <p className={styles.dayHeading}>{formatDayHeading(m.sentAt)}</p>}
                    <div className={`${styles.message} ${mine ? styles.mine : styles.theirs}`}>
                      <p className={styles.bubble}>{m.text}</p>
                      <span className={styles.time}>{formatMessageTime(m.sentAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <textarea
              ref={inputRef}
              className={styles.input}
              rows={1}
              maxLength={MAX_LENGTH}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={partner ? `Message ${partner.name}` : "Message"}
              enterKeyHint="send"
              aria-label="Message"
              disabled={messages === null}
            />
            <button type="submit" className={styles.sendButton} disabled={sending || !text.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </main>
      )}
    </div>
  );
}
