"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/apiClient";

// One of the signed-in trainer's own clients. `client` is undefined while
// loading and null if this user isn't their client (including anyone
// assigned to another PT).
export function useClient(userId) {
  const [client, setClient] = useState(undefined);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { clients } = await api.get("/api/trainer/clients");
        setClient(clients.find((c) => c.userId === userId) ?? null);
      } catch (err) {
        setError(err.message || "Could not load client.");
      }
    })();
  }, [userId]);

  return { client, error };
}
