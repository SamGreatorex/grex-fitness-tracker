"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { ROLES, ROLE_LABELS, MODE_HOME, MODE_LABELS, modeForPath, modesForRole } from "../lib/profile";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";
import ChatButton from "./ChatButton";
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
          <Link href="/" className={styles.brand} aria-label="Fit4 The Future — home">
            {/* The F4TF logo without its tagline (unreadable at this size). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/f4tf-mark.png" alt="Fit4 The Future" width={680} height={352} className={styles.brandLogo} />
          </Link>
        )}
      </div>
      <div className={styles.right} ref={menuRef}>
        {modes.length > 1 && (
          <Dropdown
            variant="pill"
            value={currentMode}
            onChange={(mode) => router.push(MODE_HOME[mode])}
            aria-label="Switch mode"
            options={modes.map((m) => ({ value: m, label: `${MODE_LABELS[m]} mode` }))}
          />
        )}
        <ChatButton />
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
