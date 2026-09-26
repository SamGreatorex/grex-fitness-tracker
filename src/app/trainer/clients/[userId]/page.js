"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/apiClient";
import AppHeader from "../../../../components/AppHeader";
import Avatar from "../../../../components/Avatar";
import { useClient } from "../../useClient";
import styles from "../../page.module.css";

// One client's programmes, with links to edit them or create a new one.
export default function TrainerClientPage() {
  const { userId } = useParams();
  const router = useRouter();
  const { client, error: clientError } = useClient(userId);
  const [programs, setPrograms] = useState(null);
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Only fetch once we know they're our client — the API would refuse anyway.
    if (!client) return;
    (async () => {
      try {
        const { programs } = await api.get("/api/programs", { userId });
        setPrograms(programs);
      } catch (err) {
        setError(err.message || "Could not load programmes.");
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
                      client.heightCm != null && `${client.heightCm} cm`,
                      client.weightKg != null && `${client.weightKg} kg`,
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

            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Programmes</h2>
              <Link href={`/trainer/clients/${userId}/programmes/new`} className={styles.primaryButton}>
                + New programme
              </Link>
            </div>

            {(error || clientError) && <p className={styles.error}>{error || clientError}</p>}

            {!programs ? (
              <p className={styles.empty}>Loading programmes…</p>
            ) : programs.length === 0 ? (
              <p className={styles.empty}>{displayName} doesn&apos;t have any programmes yet.</p>
            ) : (
              <ul className={styles.list}>
                {programs.map((p) => (
                  <li key={p.programId}>
                    <Link href={`/trainer/clients/${userId}/programmes/${p.programId}`} className={styles.row}>
                      <span className={styles.info}>
                        <span className={styles.name}>{p.name}</span>
                        <span className={styles.meta}>
                          {[
                            p.goal,
                            `${p.days.length} day${p.days.length === 1 ? "" : "s"}/week`,
                            `${p.durationWeeks} weeks`,
                            p.createdByName && `by ${p.createdByName}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </>
  );
}
