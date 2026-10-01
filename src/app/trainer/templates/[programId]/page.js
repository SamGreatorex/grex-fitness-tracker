"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/apiClient";
import AppHeader from "../../../../components/AppHeader";
import ProgrammeBuilder from "../../../../components/ProgrammeBuilder";
import styles from "../../page.module.css";

export default function EditTemplatePage() {
  const { programId } = useParams();
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { program } = await api.get(`/api/programs/${programId}`);
        if (!program.isTemplate) throw new Error("This programme isn't a template.");
        setTemplate(program);
      } catch (err) {
        setError(err.message || "Could not load the template.");
      }
    })();
  }, [programId]);

  return (
    <>
      <AppHeader backHref="/trainer/templates" backLabel="Templates" />
      <main className={styles.main}>
        <h1 className={styles.title}>Edit template</h1>
        <p className={styles.subtitle}>Changes apply to programmes created from it later — existing ones keep their own copy.</p>
        {error ? (
          <p className={styles.error}>{error}</p>
        ) : !template ? (
          <p className={styles.empty}>Loading template…</p>
        ) : (
          <ProgrammeBuilder isTemplate program={template} backHref="/trainer/templates" />
        )}
      </main>
    </>
  );
}
