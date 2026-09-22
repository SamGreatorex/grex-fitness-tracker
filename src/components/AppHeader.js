"use client";

import Link from "next/link";
import { useAuth } from "./AuthProvider";
import styles from "./AppHeader.module.css";

export default function AppHeader({ backHref, backLabel }) {
  const { user, signOut } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            ← {backLabel || "Back"}
          </Link>
        ) : (
          <span className={styles.brand}>Grex Fitness</span>
        )}
      </div>
      <div className={styles.right}>
        {user && <span className={styles.email}>{user.signInDetails?.loginId || user.username}</span>}
        <button type="button" className={styles.signOut} onClick={signOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
