"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/apiClient";
import { useAuth } from "../../../components/AuthProvider";
import AppHeader from "../../../components/AppHeader";
import { ROLES } from "../../../lib/profile";
import { isTrainerLed } from "../../../lib/programLead";
import styles from "../page.module.css";

// The shared template library: every PT and admin sees every template, and
// can start a client's programme from any of them. Only a template's
// creator (or an admin) can edit it.
export default function TemplatesPage() {
  const { userId, profile } = useAuth();
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { programs } = await api.get("/api/programs", { scope: "templates" });
        setTemplates(programs);
      } catch (err) {
        setError(err.message || "Could not load templates.");
      }
    })();
  }, []);

  const canEdit = (t) => profile?.role === ROLES.ADMIN || t.createdBy === userId;

  return (
    <>
      <AppHeader backHref="/trainer" backLabel="Clients" />
      <main className={styles.main}>
        <div className={styles.sectionHeader}>
          <div>
            <h1 className={styles.title}>Programme templates</h1>
            <p className={styles.subtitle}>Reusable programmes any trainer can start a client from.</p>
          </div>
          <Link href="/trainer/templates/new" className={styles.primaryButton}>
            + New template
          </Link>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {!templates ? (
          !error && <p className={styles.empty}>Loading…</p>
        ) : templates.length === 0 ? (
          <p className={styles.empty}>
            No templates yet — create one here, or use &ldquo;Save as template&rdquo; on any client&apos;s programme.
          </p>
        ) : (
          <ul className={styles.list}>
            {templates.map((t) => {
              const info = (
                <span className={styles.info}>
                  <span className={styles.name}>
                    {t.name}
                    <span className={styles.badge}>{isTrainerLed(t) ? "Trainer led" : "User led"}</span>
                  </span>
                  <span className={styles.meta}>
                    {[t.goal, `${t.days.length} days/week`, `${t.durationWeeks} weeks`, `by ${t.createdBy === userId ? "you" : t.createdByName || "a trainer"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              );
              return (
                <li key={t.programId}>
                  {canEdit(t) ? (
                    <Link href={`/trainer/templates/${t.programId}`} className={styles.row}>
                      {info}
                      <span className={styles.chevron} aria-hidden="true">
                        ›
                      </span>
                    </Link>
                  ) : (
                    <div className={styles.row}>{info}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
