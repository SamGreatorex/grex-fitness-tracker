"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../lib/apiClient";
import { useAuth } from "./AuthProvider";
import styles from "./ChatButton.module.css";

const POLL_MS = 30_000;

// Header chat icon with an unread badge. Only shown to people who have
// someone to chat with (a PT, or clients). Re-checks every 30s while the
// tab is visible, and whenever the page changes (e.g. after reading a chat).
export default function ChatButton() {
  const { user } = useAuth();
  const pathname = usePathname();
  // `onlyPartnerId`: set when there's exactly one conversation, so the icon
  // opens it directly rather than a one-item list.
  const [state, setState] = useState({ available: false, unread: 0, onlyPartnerId: null });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { available, unread, conversations } = await api.get("/api/chat");
        const onlyPartnerId = conversations.length === 1 ? conversations[0].partner.userId : null;
        if (!cancelled) setState({ available, unread, onlyPartnerId });
      } catch {
        // Chat not set up, or offline — just don't show the badge.
      }
    };
    check();
    const timer = setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [user, pathname]);

  if (!state.available) return null;

  const label = state.unread ? `Messages, ${state.unread} unread` : "Messages";
  return (
    <Link href={state.onlyPartnerId ? `/chat/${state.onlyPartnerId}` : "/chat"} className={`${styles.button} ${pathname.startsWith("/chat") ? styles.active : ""}`} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
      </svg>
      {state.unread > 0 && <span className={styles.badge}>{state.unread > 99 ? "99+" : state.unread}</span>}
    </Link>
  );
}
