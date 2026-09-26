"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchAuthSession, getCurrentUser, signOut as amplifySignOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { api } from "../lib/apiClient";
import "../lib/aws-config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  // The signed-in user's row from the users table (role + profile fields).
  // null while signed out or still loading.
  const [profile, setProfile] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const u = await getCurrentUser();
      const session = await fetchAuthSession();
      const sub = session.tokens?.idToken?.payload?.sub ?? u.userId ?? null;
      setUser(u);
      setUserId(sub);
    } catch {
      setUser(null);
      setUserId(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { user: p } = await api.get("/api/me");
    setProfile(p);
    return p;
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
    const unsub = Hub.listen("auth", ({ payload }) => {
      if (["signedIn", "signedOut", "tokenRefresh"].includes(payload.event)) {
        refresh();
      }
    });
    return () => unsub();
  }, [refresh]);

  // Keyed on userId rather than run inside refresh(), so a token refresh
  // for the same user doesn't refetch the profile.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await refreshProfile();
      } catch (err) {
        console.error("Could not load profile", err);
      }
    })();
  }, [userId, refreshProfile]);

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
    setUserId(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, userId, loading, signOut, refresh, profile, setProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
