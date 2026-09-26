"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { isProfileComplete } from "../lib/profile";
import ProfileForm from "./ProfileForm";
import styles from "./ProfileSetupDialog.module.css";

// Mounted once in the root layout. As soon as a signed-in (i.e. email-
// verified) user's profile is missing any required field, this blocks the
// app with a window asking for it. It can't be dismissed — only completed
// or signed out of. The settings page and login screen are exempt, since
// they either already show the same form or have no user yet.
export default function ProfileSetupDialog() {
  const { user, profile, setProfile, signOut } = useAuth();
  const pathname = usePathname();

  const open =
    !!user && !!profile && !isProfileComplete(profile) && pathname !== "/settings" && pathname !== "/login";

  if (!open) return null;
  return <SetupDialog profile={profile} onSaved={setProfile} onSignOut={signOut} />;
}

function SetupDialog({ profile, onSaved, onSignOut }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.dialog} onCancel={(e) => e.preventDefault()}>
      <div className={styles.inner}>
        <h2 className={styles.title}>Set up your profile</h2>
        <p className={styles.subtext}>
          Tell us a bit about yourself so we can track your progress from the right starting point.
        </p>
        <ProfileForm profile={profile} onSaved={onSaved} submitLabel="Save & continue" />
        <button type="button" className={styles.signOut} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </dialog>
  );
}
