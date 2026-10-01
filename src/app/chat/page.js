"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { api } from "../../lib/apiClient";
import AppHeader from "../../components/AppHeader";
import Avatar from "../../components/Avatar";
import { ROLES } from "../../lib/profile";
import { formatChatTime } from "./chatTime";
import styles from "./chat.module.css";

const POLL_MS = 15_000;

// Everyone the user can message: their trainer, and (trainers) each client.
export default function ChatListPage() {
  const router = useRouter();
  const { user, loading: sessionLoading, profile } = useAuth();
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState("");
  const isTrainer = profile?.role === ROLES.PT || profile?.role === ROLES.ADMIN;

  useEffect(() => {
    if (!sessionLoading && !user) router.replace("/login");
  }, [sessionLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { conversations } = await api.get("/api/chat");
        // Only one person to talk to (e.g. a client and their trainer):
        // skip the list and open it. replace, so Back doesn't land here.
        if (conversations.length === 1) {
          router.replace(`/chat/${conversations[0].partner.userId}`);
          return;
        }
        if (!cancelled) {
          setConversations(conversations);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load your messages.");
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, router]);

  if (sessionLoading || !user) return null;

  return (
    <>
      <AppHeader backHref="/" backLabel="Programs" />
      <main className={styles.main}>
        <h1 className={styles.title}>Messages</h1>
        <p className={styles.subtitle}>
          {isTrainer ? "Chat with your trainer and your clients." : "Chat with your trainer."}
        </p>

        {error && <p className={styles.error}>{error}</p>}

        {!conversations ? (
          !error && <p className={styles.empty}>Loading…</p>
        ) : conversations.length === 0 ? (
          <p className={styles.empty}>
            {isTrainer
              ? "Nobody to chat with yet — take on clients in Trainer mode and they'll appear here."
              : "Once you've been assigned a trainer, you can chat with them here."}
          </p>
        ) : (
          <ul className={styles.list}>
            {conversations.map((c) => (
              <li key={c.conversationId}>
                <Link href={`/chat/${c.partner.userId}`} className={`${styles.row} ${c.unread ? styles.rowUnread : ""}`}>
                  <Avatar src={c.partner.avatarUrl} name={c.partner.name} size={44} />
                  <span className={styles.rowMain}>
                    <span className={styles.rowTop}>
                      <span className={styles.rowName}>{c.partner.name}</span>
                      <span className={styles.roleBadge}>{c.partner.role === "trainer" ? "Your trainer" : "Client"}</span>
                      {c.lastMessageAt && <span className={styles.rowTime}>{formatChatTime(c.lastMessageAt)}</span>}
                    </span>
                    <span className={styles.rowPreview}>
                      {c.lastMessageText ? `${c.lastFromMe ? "You: " : ""}${c.lastMessageText}` : "No messages yet — say hello"}
                    </span>
                  </span>
                  {c.unread > 0 && (
                    <span className={styles.unreadBadge} aria-label={`${c.unread} unread`}>
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
