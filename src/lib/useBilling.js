"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./apiClient";
import { useAuth } from "../components/AuthProvider";

// The signed-in user's plan, allowance and payments (GET /api/billing), and
// `act(action, details)` to change them (POST /api/billing). A successful
// action also refreshes the app-wide profile, so access (and anything gated
// on it) updates straight away. `act` resolves to the server's message and
// throws with its error.
export function useBilling() {
  const { user, setProfile } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await api.get("/api/billing"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your plan.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await reload();
    })();
  }, [user, reload]);

  const act = async (action, details = {}) => {
    const { user: updated, message, ...summary } = await api.post("/api/billing", { action, ...details });
    setData(summary);
    if (updated) setProfile(updated);
    return message;
  };

  return { data, error, reload, act };
}
