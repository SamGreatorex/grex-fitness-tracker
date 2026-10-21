"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { accessFor } from "../lib/billing";
import { isProfileComplete } from "../lib/profile";

// Pages someone without an active plan can still reach: choosing a plan,
// managing billing, their settings, and signing in.
const OPEN_PATHS = ["/subscribe", "/billing", "/settings", "/login"];

// Mounted once in the root layout. A signed-in user with no active plan —
// never chosen one, trial over, cancelled plan ended, or a renewal failed —
// is sent to /subscribe from anywhere else in the app. Trainers and admins
// are never sent. (The API enforces the same rules; this just takes them
// to the right place instead of a page of errors.)
export default function SubscriptionGate() {
  const { user, profile, refreshProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const checking = useRef(false);

  useEffect(() => {
    if (!user || !profile || !isProfileComplete(profile)) return;
    if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return;
    if (accessFor(profile).hasAccess || checking.current) return;

    // The profile here may be out of date (e.g. the month just renewed on
    // the server), so check again with a fresh copy before sending them off.
    checking.current = true;
    (async () => {
      try {
        const fresh = await refreshProfile();
        if (!accessFor(fresh).hasAccess) router.replace(`/subscribe?next=${encodeURIComponent(pathname)}`);
      } catch {
        // Couldn't check — leave them be; the API still enforces access.
      } finally {
        checking.current = false;
      }
    })();
  }, [user, profile, pathname, refreshProfile, router]);

  return null;
}
