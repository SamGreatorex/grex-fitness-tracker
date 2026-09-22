"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchAuthSession, getCurrentUser, signOut as amplifySignOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import "../lib/aws-config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);

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
    } finally {
      setLoading(false);
    }
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

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{ user, userId, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
