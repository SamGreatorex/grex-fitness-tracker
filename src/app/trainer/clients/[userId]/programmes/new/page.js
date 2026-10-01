"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../../../lib/apiClient";
import AppHeader from "../../../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../../../components/ProgrammeBuilder";
import { useClient } from "../../../../useClient";
import styles from "../../../../page.module.css";

export default function NewProgrammePage() {
  const { userId } = useParams();
  const { client } = useClient(userId);
  const clientHref = `/trainer/clients/${userId}`;
  // Picking a template prefills the builder with a copy of it; the client's
  // programme doesn't stay linked to the template afterwards.
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { programs } = await api.get("/api/programs", { scope: "templates" });
        setTemplates(programs);
      } catch {
        // No templates to offer — building from scratch still works.
      }
    })();
  }, []);

  const chooseTemplate = (nextId) => {
    if (templateId !== nextId && !window.confirm("Replace what's in the form with this template?")) return;
    setTemplateId(nextId);
  };

  const template = templates.find((t) => t.programId === templateId);

  return (
    <>
      <AppHeader backHref={clientHref} backLabel={client?.name || "Client"} />
      <main className={styles.main}>
        <h1 className={styles.title}>New programme</h1>
        <p className={styles.subtitle}>For {client?.name || client?.email || "this client"}</p>
        {client === undefined ? (
          <p className={styles.empty}>Loading…</p>
        ) : client === null ? (
          <p className={styles.error}>This user isn&apos;t one of your clients.</p>
        ) : (
          <>
            {templates.length > 0 && (
              <label className={styles.templatePicker}>
                Start from a template
                <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
                  <option value="">Blank programme</option>
                  {templates.map((t) => (
                    <option key={t.programId} value={t.programId}>
                      {t.name} · {t.days.length} days/week · {t.durationWeeks} weeks
                    </option>
                  ))}
                </select>
              </label>
            )}
            {/* Remounts on each pick, so the form starts fresh from that template. */}
            <ProgrammeBuilder key={templateId || "blank"} ownerUserId={userId} template={template} backHref={clientHref} />
          </>
        )}
      </main>
    </>
  );
}
