"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// Renders children only for signed-in users whose role is in `roles`;
// sends everyone else to login (signed out) or home (wrong role). This is
// for UX only — the API routes behind these pages enforce roles themselves.
// Pass a module-level constant for `roles` so the effect doesn't re-run.
export default function RoleGate({ roles, children }) {
  const router = useRouter();
  const { user, loading, profile } = useAuth();
  const allowed = !!profile && roles.includes(profile.role);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    else if (profile && !roles.includes(profile.role)) router.replace("/");
  }, [loading, user, profile, roles, router]);

  return allowed ? children : null;
}
