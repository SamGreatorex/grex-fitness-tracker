"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/apiClient";
import { useAuth } from "../../../../components/AuthProvider";
import { formatHeight, formatWeight } from "../../../../lib/units";
import AppHeader from "../../../../components/AppHeader";
import Avatar from "../../../../components/Avatar";
import { useClient } from "../../useClient";
import ClientProgress from "./ClientProgress";
import styles from "../../page.module.css";

// One client: how they're getting on (headline numbers, where they are in
// each programme, recent workouts, trends) plus their programmes to edit.
export default function TrainerClientPage() {
  const { userId } = useParams();
  const router = useRouter();
  const { client, error: clientError } = useClient(userId);
  // Shown in the trainer's own chosen units.
  const { profile: me } = useAuth();
  const [progress, setProgress] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Only fetch once we know they're our client — the API would refuse anyway.
    if (!client) return;
    (async () => {
      try {
        setProgress(await api.get(`/api/trainer/clients/${userId}/progress`));
      } catch (err) {
        setError(err.message || "Could not load their progress.");
      }
    })();
  }, [userId, client]);

  const release = async () => {
    if (!window.confirm(`Release ${displayName}? They'll go back to the available list for any PT to take on. Their programmes stay with them.`)) return;
    setReleasing(true);
    setError("");
    try {
      await api.delete(`/api/trainer/clients/${userId}`);
      router.push("/trainer");
    } catch (err) {
      setError(err.message || "Could not release client.");
      setReleasing(false);
    }
  };

  const displayName = client?.name || client?.email || "Client";

  return (
    <>
      <AppHeader backHref="/trainer" backLabel="Clients" />
      <main className={styles.main}>
        {client === null ? (
          <p className={styles.empty}>This user isn&apos;t one of your clients.</p>
        ) : (
          <>
            <div className={styles.clientHeader}>
              <Avatar src={client?.avatarUrl} name={client?.name} email={client?.email} size={64} />
              <div className={styles.info}>
                <h1 className={styles.title}>{displayName}</h1>
                {client && (
                  <span className={styles.meta}>
                    {[
                      client.email,
                      client.heightCm != null && formatHeight(client.heightCm, me?.heightUnit),
                      client.weightKg != null && formatWeight(client.weightKg, me?.weightUnit),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              {client && (
                <button type="button" className={styles.ghostButton} onClick={release} disabled={releasing}>
                  {releasing ? "Releasing…" : "Release client"}
                </button>
              )}
            </div>

            {(error || clientError) && <p className={styles.error}>{error || clientError}</p>}

            {!progress ? (
              !(error || clientError) && <p className={styles.empty}>Loading their progress…</p>
            ) : (
              <ClientProgress userId={userId} data={progress} weightUnit={me?.weightUnit} />
            )}
          </>
        )}
      </main>
    </>
  );
}
