"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { ROLES, ROLE_LABELS, MODE_HOME, MODE_LABELS, modeForPath, modesForRole } from "../lib/profile";
import Avatar from "./Avatar";
import styles from "./AppHeader.module.css";

export default function AppHeader({ backHref, backLabel }) {
  const { user, profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  // Basic users only have User mode, so they never see the switcher.
  const modes = modesForRole(profile?.role);
  const currentMode = modeForPath(pathname);

  const email = profile?.email || user?.signInDetails?.loginId || user?.username;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref ? (
          <Link href={backHref} className={styles.back}>
            ← {backLabel || "Back"}
          </Link>
        ) : (
          <span className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={28} height={28} className={styles.brandIcon} />
            Grex Fitness
          </span>
        )}
      </div>
      <div className={styles.right} ref={menuRef}>
        {modes.length > 1 && (
          <select
            className={styles.modeSelect}
            value={currentMode}
            onChange={(e) => router.push(MODE_HOME[e.target.value])}
            aria-label="Switch mode"
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]} mode
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          <Avatar src={profile?.avatarUrl} name={profile?.name} email={email} size={36} />
        </button>

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <div className={styles.menuHeader}>
              <span className={styles.menuName}>{profile?.name || email}</span>
              {profile?.name && <span className={styles.menuEmail}>{email}</span>}
              {profile?.role && profile.role !== ROLES.BASIC && (
                <span className={styles.roleBadge}>{ROLE_LABELS[profile.role] ?? profile.role}</span>
              )}
            </div>
            <Link href="/settings" className={styles.menuItem} role="menuitem" onClick={() => setMenuOpen(false)}>
              Profile settings
            </Link>
            <button type="button" className={styles.menuItem} role="menuitem" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
